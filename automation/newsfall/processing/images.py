"""
Editorial images: backfill og:image for articles that lack one and propagate the
primary source's image to events without an image. No LLM. Idempotent.
"""

from __future__ import annotations

from ..config import PipelineConfig
from ..ingestion.fetchers import fetch_og_image
from ..log import get_logger

log = get_logger("images")


def run_images(db, cfg: PipelineConfig, llm=None) -> dict:
    stats = {"articles_checked": 0, "images_found": 0, "events_updated": 0}

    rows = (db.table("raw_articles").select("id,url,metadata")
            .not_.in_("ingestion_status", ["DUPLICATE", "FAILED", "SKIPPED"])
            .order("published_at", desc=True).limit(600).execute().data or [])
    todo = [r for r in rows if "image_url" not in (r.get("metadata") or {})][: cfg.max_images_per_run]
    for r in todo:
        stats["articles_checked"] += 1
        img = fetch_og_image(r["url"])
        meta = dict(r.get("metadata") or {})
        meta["image_url"] = img  # None is recorded too, so we never re-fetch a page without an image
        if img:
            stats["images_found"] += 1
        db.table("raw_articles").update({"metadata": meta}).eq("id", r["id"]).execute()

    events = db.table("events").select("id").is_("image_url", "null").limit(500).execute().data or []
    for ev in events:
        links = (db.table("event_articles").select("is_primary,raw_articles(metadata,sources(credibility_score))")
                 .eq("event_id", ev["id"]).execute().data or [])
        candidates = []
        for l in links:
            a = l.get("raw_articles") or {}
            img = (a.get("metadata") or {}).get("image_url")
            if img:
                cred = float(((a.get("sources") or {}).get("credibility_score")) or 0)
                candidates.append((1 if l.get("is_primary") else 0, cred, img))
        if candidates:
            candidates.sort(reverse=True)
            db.table("events").update({"image_url": candidates[0][2]}).eq("id", ev["id"]).execute()
            stats["events_updated"] += 1

    log.info("images complete", **stats)
    return stats
