"""
Daily intelligence briefing (Part 25). Synthesises the day's events, people of
influence and open watch items into one structured report (intelligence_reports).
Idempotent on (kind, period_start).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from ..config import PipelineConfig
from ..llm import LLMService
from ..log import get_logger

log = get_logger("briefing")


def run_daily_briefing(db, cfg: PipelineConfig, llm: LLMService) -> dict:
    stats = {"created": 0}
    if not cfg.daily_briefing or not llm.enabled:
        return stats
    now = datetime.now(timezone.utc)
    period_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    existing = db.table("intelligence_reports").select("id").eq("kind", "DAILY").eq("period_start", period_start.isoformat()).execute().data
    if existing:
        return stats

    since = (now - timedelta(hours=36)).isoformat()
    events = (db.table("events").select("slug,title,event_type,importance_score,confidence_score,summary,why_it_matters")
              .gte("last_updated_at", since).order("importance_score", desc=True).limit(25).execute().data or [])
    if len(events) < 3:
        log.info("too few events for a briefing", events=len(events))
        return stats

    people = (db.table("entities").select("name,influence_score,description").eq("entity_type", "PERSON")
              .order("influence_score", desc=True).limit(8).execute().data or [])
    watch = (db.table("watch_items").select("title,reason,kind").eq("status", "OPEN")
             .order("confidence", desc=True).limit(10).execute().data or [])

    brief = llm.daily_briefing(now.strftime("%Y-%m-%d"), events, people, watch)
    if brief is None:
        return stats
    db.table("intelligence_reports").upsert({
        "kind": "DAILY", "period_start": period_start.isoformat(), "period_end": now.isoformat(),
        "title": brief.title, "content": brief.model_dump(), "model": llm.model_for("reasoning"),
    }, on_conflict="kind,period_start").execute()
    stats["created"] = 1
    log.info("daily briefing created", title=brief.title)
    return stats
