"""
Database access. One service-role Supabase client plus small helpers that keep the
stage modules free of PostgREST quirks (chunked upserts, safe selects, vector I/O).
"""

from __future__ import annotations

import os
import time
from typing import Any, Iterable, Sequence

import httpx
from postgrest._sync import request_builder as _postgrest_rb
from supabase import Client, create_client
from supabase.lib.client_options import SyncClientOptions

from .log import get_logger

log = get_logger("db")

# Healthy requests answer in <1 s; anything longer is a hung connection, so fail fast and retry.
DB_TIMEOUT_SECONDS = int(os.getenv("SUPABASE_TIMEOUT_SECONDS", "12"))
DB_RETRIES = 4

# PostgREST occasionally leaves a stale keep-alive connection hanging on the first
# request after an idle period (observed as 120 s read timeouts on otherwise sub-second
# writes). Retry transport-level failures with a short timeout; every pipeline write is
# idempotent (upserts / unique keys), so a retried request can never duplicate data.
_original_send_with_retry = _postgrest_rb.send_with_retry


def _resilient_send(req):  # type: ignore[no-untyped-def]
    for attempt in range(DB_RETRIES + 1):
        try:
            return _original_send_with_retry(req)
        except (httpx.TimeoutException, httpx.ConnectError, httpx.RemoteProtocolError) as exc:
            if attempt >= DB_RETRIES:
                raise
            log.warning("db request failed — retrying", error=type(exc).__name__, attempt=attempt + 1)
            time.sleep(1 + attempt)
    raise RuntimeError("unreachable")


_postgrest_rb.send_with_retry = _resilient_send


def get_db() -> Client:
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_KEY"]
    return create_client(url, key, options=SyncClientOptions(postgrest_client_timeout=DB_TIMEOUT_SECONDS))


def chunked(items: Sequence[Any], size: int = 200) -> Iterable[Sequence[Any]]:
    for i in range(0, len(items), size):
        yield items[i : i + size]


def upsert(db: Client, table: str, rows: list[dict], on_conflict: str, *, ignore_duplicates: bool = False) -> int:
    """Chunked upsert; returns number of rows sent. Never raises on an empty list."""
    if not rows:
        return 0
    n = 0
    for chunk in chunked(rows):
        db.table(table).upsert(list(chunk), on_conflict=on_conflict, ignore_duplicates=ignore_duplicates).execute()
        n += len(chunk)
    return n


def select_all(db: Client, table: str, columns: str = "*", *, page: int = 1000, **filters: Any) -> list[dict]:
    """Paginate through a table (PostgREST caps a single response at 1000 rows)."""
    out: list[dict] = []
    start = 0
    while True:
        q = db.table(table).select(columns)
        for col, val in filters.items():
            q = q.eq(col, val)
        res = q.range(start, start + page - 1).execute()
        rows = res.data or []
        out.extend(rows)
        if len(rows) < page:
            return out
        start += page


def vec_to_pg(vec: Sequence[float] | None) -> str | None:
    """pgvector accepts the '[x,y,z]' literal through PostgREST."""
    if vec is None:
        return None
    return "[" + ",".join(f"{float(x):.6f}" for x in vec) + "]"


def pg_to_vec(value: Any) -> list[float] | None:
    """PostgREST returns vector columns as a '[...]' string."""
    if value is None:
        return None
    if isinstance(value, list):
        return [float(x) for x in value]
    if isinstance(value, str):
        s = value.strip().strip("[]")
        if not s:
            return None
        return [float(x) for x in s.split(",")]
    return None


def set_article_status(db: Client, article_id: str, status: str, error: str | None = None) -> None:
    patch: dict[str, Any] = {"ingestion_status": status, "error": error}
    if status == "FAILED":
        # Increment retry counter without a round trip: PostgREST has no atomic increment,
        # so read-modify-write is acceptable here (single writer: the daily job).
        cur = db.table("raw_articles").select("retry_count").eq("id", article_id).single().execute().data or {}
        patch["retry_count"] = int(cur.get("retry_count", 0)) + 1
    db.table("raw_articles").update(patch).eq("id", article_id).execute()


def record_pipeline_run(db: Client, run_id: str | None, *, status: str, stats: dict, error: str | None = None) -> str | None:
    """Best-effort run bookkeeping — observability must never abort the pipeline."""
    try:
        if run_id is None:
            res = db.table("pipeline_runs").insert({"status": status, "stats": stats}).execute()
            return res.data[0]["id"]
        db.table("pipeline_runs").update(
            {"status": status, "stats": stats, "error": error, "finished_at": "now()"}
        ).eq("id", run_id).execute()
        return run_id
    except Exception as exc:  # noqa: BLE001
        log.warning("pipeline_runs write failed", error=str(exc)[:200])
        return run_id
