"""
Importance engine (Part 13). Deterministic signals + bounded AI signals → 0..100.

    importance = 25·magnitude + 20·entity_influence + 15·industry_impact
               + 15·cross_source + 10·credibility + 10·novelty + 5·recency

`magnitude` / `industry_impact` come from validated LLM output (0..1) — everything
else is computed from the database. The LLM is never the only input.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from ..config import PipelineConfig
from ..log import get_logger
from ..text import parse_datetime

log = get_logger("scoring")

WEIGHTS = {"magnitude": 25, "entity_influence": 20, "industry_impact": 15, "cross_source": 15,
           "credibility": 10, "novelty": 10, "recency": 5}

# Fallback industry-impact prior by event type when no analysis exists yet.
TYPE_IMPACT_PRIOR = {
    "ACQUISITION": 0.75, "REGULATION": 0.7, "MODEL_RELEASE": 0.65, "CHIP_DEVELOPMENT": 0.65,
    "INFRASTRUCTURE_EXPANSION": 0.6, "FUNDING": 0.5, "IPO": 0.6, "EARNINGS": 0.5, "LAWSUIT": 0.5,
    "SECURITY_INCIDENT": 0.55, "LEADERSHIP_CHANGE": 0.45, "PARTNERSHIP": 0.45, "INVESTMENT": 0.5,
    "PRODUCT_LAUNCH": 0.4, "RESEARCH_BREAKTHROUGH": 0.5, "OPEN_SOURCE_RELEASE": 0.35, "LAYOFF": 0.4,
    "POLICY_STATEMENT": 0.35, "OTHER": 0.25,
}


def cross_source_signal(independent_sources: int) -> float:
    return {0: 0.0, 1: 0.2, 2: 0.55, 3: 0.8}.get(independent_sources, 1.0)


def novelty_signal(first_seen: datetime | None, now: datetime | None = None) -> float:
    now = now or datetime.now(timezone.utc)
    if not first_seen:
        return 0.5
    age_days = max(0.0, (now - first_seen).total_seconds() / 86400)
    if age_days <= 1:
        return 1.0
    if age_days <= 3:
        return 0.7
    if age_days <= 7:
        return 0.4
    return 0.2


def recency_signal(last_updated: datetime | None, now: datetime | None = None) -> float:
    now = now or datetime.now(timezone.utc)
    if not last_updated:
        return 0.3
    hours = max(0.0, (now - last_updated).total_seconds() / 3600)
    return max(0.0, 1.0 - hours / 72)


def compute_importance(signals: dict[str, float]) -> tuple[float, dict]:
    """signals ∈ [0,1] per WEIGHTS key. Returns (score 0..100, breakdown). Pure, unit-tested."""
    breakdown = {}
    total = 0.0
    for key, w in WEIGHTS.items():
        v = max(0.0, min(1.0, float(signals.get(key, 0.0))))
        breakdown[key] = round(v, 3)
        total += w * v
    breakdown["score"] = round(total, 2)
    return round(total, 2), breakdown


def _signals_for(ev: dict, entity_influence: float, max_credibility: float, now: datetime) -> dict:
    bd = ev.get("score_breakdown") or {}
    return {
        "magnitude": float(bd.get("magnitude", 0.3)),
        "entity_influence": entity_influence / 100.0,
        "industry_impact": float(bd.get("industry_impact", TYPE_IMPACT_PRIOR.get(ev.get("event_type") or "OTHER", 0.25))),
        "cross_source": cross_source_signal(int(ev.get("independent_source_count") or 0)),
        "credibility": max_credibility,
        "novelty": novelty_signal(parse_datetime(ev.get("first_seen_at")), now),
        "recency": recency_signal(parse_datetime(ev.get("last_updated_at")), now),
    }


def run_scoring(db, cfg: PipelineConfig, llm=None, *, days: int = 14) -> dict:
    stats = {"scored": 0}
    now = datetime.now(timezone.utc)
    since = (now - timedelta(days=days)).isoformat()
    events = (db.table("events").select("id,event_type,score_breakdown,independent_source_count,first_seen_at,last_updated_at")
              .gte("last_updated_at", since).limit(1000).execute().data or [])
    if not events:
        return stats
    ids = [e["id"] for e in events]

    # Max entity influence per event.
    infl: dict[str, float] = {}
    ent_rows = []
    for i in range(0, len(ids), 200):
        ent_rows += db.table("event_entities").select("event_id,entities(influence_score)").in_("event_id", ids[i:i + 200]).execute().data or []
    for r in ent_rows:
        s = float(((r.get("entities") or {}).get("influence_score")) or 0)
        infl[r["event_id"]] = max(infl.get(r["event_id"], 0.0), s)

    # Max source credibility per event.
    cred: dict[str, float] = {}
    art_rows = []
    for i in range(0, len(ids), 200):
        art_rows += db.table("event_articles").select("event_id,raw_articles(sources(credibility_score))").in_("event_id", ids[i:i + 200]).execute().data or []
    for r in art_rows:
        s = float((((r.get("raw_articles") or {}).get("sources") or {}).get("credibility_score")) or 0.5)
        cred[r["event_id"]] = max(cred.get(r["event_id"], 0.0), s)

    for ev in events:
        signals = _signals_for(ev, infl.get(ev["id"], 0.0), cred.get(ev["id"], 0.5), now)
        score, breakdown = compute_importance(signals)
        breakdown["magnitude"] = signals["magnitude"]
        breakdown["industry_impact"] = signals["industry_impact"]
        db.table("events").update({"importance_score": score, "score_breakdown": {**(ev.get("score_breakdown") or {}), **breakdown}}).eq("id", ev["id"]).execute()
        stats["scored"] += 1
    log.info("scoring complete", **stats)
    return stats
