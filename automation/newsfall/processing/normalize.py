"""
Normalize + deterministic deduplication (Parts 4, 32).

INGESTED → NORMALIZED | DUPLICATE | SKIPPED

Levels handled here (cheap, no LLM):
  1. URL          — already unique at the DB level; canonical_url collapses tracking params
  2. content hash — identical text under a different URL (syndication)
  3. title        — near-identical titles from the same source family within a short window
Semantic (embedding) duplicates are handled in `embeddings.py`; same-story-different-
coverage is NOT deduplication — that is event clustering.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from ..config import PipelineConfig
from ..db import upsert
from ..log import get_logger
from ..text import content_hash, excerpt, normalize_whitespace, title_similarity

log = get_logger("normalize")


def _recent_titles(db, days: int) -> list[dict]:
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    return (db.table("raw_articles").select("id,title,source_id,content_hash")
            .neq("ingestion_status", "INGESTED").gte("created_at", since).limit(3000).execute().data or [])


def decide_duplicate(article: dict, seen_hashes: dict[str, str], recent: list[dict], title_threshold: float) -> str | None:
    """Return the id of the article this one duplicates, or None. Pure, unit-tested."""
    h = article.get("content_hash")
    if h and h in seen_hashes and seen_hashes[h] != article["id"]:
        return seen_hashes[h]
    for other in recent:
        if other["id"] == article["id"]:
            continue
        if other.get("source_id") != article.get("source_id"):
            continue  # cross-source similar titles are clustering, not dedupe
        if title_similarity(article["title"], other["title"]) >= title_threshold:
            return other["id"]
    return None


def run_normalize(db, cfg: PipelineConfig, llm=None) -> dict:
    stats = {"normalized": 0, "duplicates": 0, "skipped": 0}
    pending = (db.table("raw_articles").select("id,title,content,source_id,content_hash,url")
               .eq("ingestion_status", "INGESTED").order("published_at", desc=True)
               .limit(cfg.max_articles_per_run).execute().data or [])
    if not pending:
        return stats

    recent = _recent_titles(db, days=3)
    seen_hashes: dict[str, str] = {r["content_hash"]: r["id"] for r in recent if r.get("content_hash")}

    # Decide everything in memory, then write in batches (one round-trip per ~100 rows
    # instead of one per article — the DB link, not CPU, is the bottleneck).
    patches: list[dict] = []
    for art in pending:
        content = normalize_whitespace(art.get("content") or "")
        title = normalize_whitespace(art.get("title") or "")
        # Uniform key set per row — PostgREST bulk upserts send NULL for keys a row omits.
        h = content_hash(title, content)
        base = {
            "id": art["id"], "url": art["url"], "title": title[:300] or art["title"],
            "content": content[: cfg.max_content_chars] or None, "summary": excerpt(content) if content else None,
            "content_hash": h, "duplicate_of": None, "error": None,
        }
        if len(content) < cfg.min_content_chars and len(title) < 20:
            patches.append({**base, "ingestion_status": "SKIPPED", "error": "too little content"})
            stats["skipped"] += 1
            continue

        art["content_hash"] = h
        dup_of = decide_duplicate(art, seen_hashes, recent, cfg.title_similarity_dup)
        if dup_of:
            patches.append({**base, "ingestion_status": "DUPLICATE", "duplicate_of": dup_of})
            stats["duplicates"] += 1
            continue

        patches.append({**base, "ingestion_status": "NORMALIZED"})
        seen_hashes[h] = art["id"]
        recent.append({"id": art["id"], "title": title, "source_id": art.get("source_id"), "content_hash": h})
        stats["normalized"] += 1

    # Upsert on the primary key acts as a batched UPDATE (url is included because it is NOT NULL).
    upsert(db, "raw_articles", patches, on_conflict="id")
    log.info("normalize complete", **stats)
    return stats
