"""
What-to-watch maintenance (Part 26). Watch items are created by the analysis stage;
this stage keeps them honest: resolves items whose underlying claim got confirmed or
falsified, and expires stale OPEN items.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from ..config import PipelineConfig
from ..log import get_logger

log = get_logger("watch")

EXPIRE_AFTER_DAYS = 30


def run_watch_maintenance(db, cfg: PipelineConfig, llm=None) -> dict:
    stats = {"expired": 0, "resolved": 0}
    cutoff = (datetime.now(timezone.utc) - timedelta(days=EXPIRE_AFTER_DAYS)).isoformat()
    stale = db.table("watch_items").select("id").eq("status", "OPEN").lt("created_at", cutoff).execute().data or []
    if stale:
        db.table("watch_items").update({"status": "EXPIRED"}).in_("id", [s["id"] for s in stale]).execute()
        stats["expired"] = len(stale)

    linked = db.table("watch_items").select("id,claim_id,claims(status)").eq("status", "OPEN").not_.is_("claim_id", "null").execute().data or []
    done = [w["id"] for w in linked if (w.get("claims") or {}).get("status") in ("CONFIRMED", "FALSE", "SUPERSEDED")]
    if done:
        db.table("watch_items").update({"status": "RESOLVED"}).in_("id", done).execute()
        stats["resolved"] = len(done)

    log.info("watch maintenance complete", **stats)
    return stats
