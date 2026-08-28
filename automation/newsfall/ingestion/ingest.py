"""
Ingestion stage: sources → raw_articles (status INGESTED).

Idempotent: `raw_articles.url` is unique and we preload known canonical URLs, so
re-running never duplicates. Source health (last_success_at, consecutive_failures,
last_error, last_item_count) is updated every run so a blind eye is visible.
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

from ..config import PipelineConfig
from ..db import upsert
from ..log import get_logger
from ..sources.registry import sync_sources
from ..text import canonical_url, content_hash, excerpt, iso, normalize_whitespace
from .fetchers import fetch_source

log = get_logger("ingest")


def _known_urls(db) -> set[str]:
    urls: set[str] = set()
    start, page = 0, 1000
    while True:
        rows = db.table("raw_articles").select("url").range(start, start + page - 1).execute().data or []
        urls.update(r["url"] for r in rows)
        if len(rows) < page:
            return urls
        start += page


def run_ingestion(db, cfg: PipelineConfig, llm=None) -> dict:
    stats = {"sources": 0, "fetched": 0, "new": 0, "skipped_old": 0, "failed_sources": 0}
    sync_sources(db)

    sources = (db.table("sources").select("*").eq("active", True).in_("tier", list(cfg.source_tiers)).execute().data or [])
    known = _known_urls(db)
    cutoff = datetime.now(timezone.utc) - timedelta(days=cfg.max_article_age_days)
    github_token = os.getenv("GITHUB_TOKEN")
    now_iso = iso(datetime.now(timezone.utc))

    for src in sources:
        stats["sources"] += 1
        result = fetch_source(src, limit=cfg.items_per_source, github_token=github_token)
        health = {"last_fetched_at": now_iso, "last_item_count": len(result.items)}
        if result.error:
            stats["failed_sources"] += 1
            health.update({"consecutive_failures": int(src.get("consecutive_failures") or 0) + 1,
                           "last_error": result.error})
            log.warning("source fetch failed", source=src["slug"], error=result.error)
        else:
            health.update({"consecutive_failures": 0, "last_error": None, "last_success_at": now_iso})

        rows = []
        for item in result.items:
            stats["fetched"] += 1
            url = canonical_url(item.url)
            if url in known:
                continue
            if item.published_at and item.published_at < cutoff:
                stats["skipped_old"] += 1
                continue
            content = normalize_whitespace(item.content)[: cfg.max_content_chars]
            rows.append({
                "source_id": src["id"], "title": item.title[:300], "url": url, "canonical_url": url,
                "author": (item.author or None) and item.author[:120], "content": content or None,
                "summary": excerpt(content) if content else None, "published_at": iso(item.published_at),
                "content_hash": content_hash(item.title, content), "metadata": item.metadata,
                "ingestion_status": "INGESTED",
            })
            known.add(url)
        if rows:
            upsert(db, "raw_articles", rows, on_conflict="url", ignore_duplicates=True)
            stats["new"] += len(rows)
        try:
            db.table("sources").update(health).eq("id", src["id"]).execute()
        except Exception as exc:  # noqa: BLE001
            log.warning("source health update failed", source=src["slug"], error=str(exc)[:200])
        log.info("source ingested", source=src["slug"], items=len(result.items), new=len(rows))

    log.info("ingestion complete", **stats)
    return stats
