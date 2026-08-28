"""
Influence scoring (Part 14). Deterministic, evidence-based 0..100 per entity:

    influence = 35·event_weight + 25·mentions + 20·relationships + 20·type_prior

where event_weight is the importance-weighted count of events the entity is involved
in over the last 90 days, mentions is a log-scaled mention count, relationships is a
log-scaled degree in the relationship graph, and type_prior reflects the structural
capacity of the entity type to move technology, capital or policy.
"""

from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone

from ..config import PipelineConfig
from ..log import get_logger

log = get_logger("influence")

TYPE_PRIOR = {"PERSON": 0.6, "COMPANY": 0.7, "INVESTOR": 0.6, "FUND": 0.55, "GOVERNMENT": 0.8,
              "RESEARCH_LAB": 0.5, "STARTUP": 0.4, "ORGANIZATION": 0.45, "TECHNOLOGY": 0.35,
              "PRODUCT": 0.3, "INDUSTRY": 0.3}


def _log_scale(n: float, cap: float) -> float:
    return min(1.0, math.log1p(max(0.0, n)) / math.log1p(cap))


def compute_influence(entity_type: str, event_importances: list[float], mention_count: int, degree: int) -> float:
    """Pure, unit-tested."""
    ev_weight = _log_scale(sum(i / 100.0 for i in event_importances), 6.0)
    mentions = _log_scale(mention_count, 60.0)
    rels = _log_scale(degree, 25.0)
    prior = TYPE_PRIOR.get(entity_type, 0.3)
    return round(100 * (0.35 * ev_weight + 0.25 * mentions + 0.20 * rels + 0.20 * prior * (0.5 + 0.5 * max(ev_weight, mentions))), 2)


def run_influence(db, cfg: PipelineConfig, llm=None, *, days: int = 90) -> dict:
    stats = {"entities": 0}
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    ev_rows = db.table("event_entities").select("entity_id,events(importance_score,last_updated_at)").execute().data or []
    imps: dict[str, list[float]] = {}
    for r in ev_rows:
        e = r.get("events") or {}
        if (e.get("last_updated_at") or "") >= since:
            imps.setdefault(r["entity_id"], []).append(float(e.get("importance_score") or 0))

    mention_rows = db.table("entity_mentions").select("entity_id").gte("created_at", since).limit(20000).execute().data or []
    mentions: dict[str, int] = {}
    for r in mention_rows:
        mentions[r["entity_id"]] = mentions.get(r["entity_id"], 0) + 1

    rel_rows = db.table("entity_relationships").select("source_entity_id,target_entity_id").eq("status", "ACTIVE").limit(20000).execute().data or []
    degree: dict[str, int] = {}
    for r in rel_rows:
        degree[r["source_entity_id"]] = degree.get(r["source_entity_id"], 0) + 1
        degree[r["target_entity_id"]] = degree.get(r["target_entity_id"], 0) + 1

    touched = set(imps) | set(mentions) | set(degree)
    if not touched:
        return stats
    ids = list(touched)
    for i in range(0, len(ids), 200):
        ents = db.table("entities").select("id,entity_type,influence_score,mention_count").in_("id", ids[i:i + 200]).execute().data or []
        for e in ents:
            score = compute_influence(e["entity_type"], imps.get(e["id"], []), mentions.get(e["id"], 0), degree.get(e["id"], 0))
            mc = mentions.get(e["id"], 0)
            if abs(score - float(e.get("influence_score") or 0)) > 0.05 or mc != e.get("mention_count"):
                db.table("entities").update({"influence_score": score, "mention_count": mc}).eq("id", e["id"]).execute()
                stats["entities"] += 1
    log.info("influence complete", **stats)
    return stats
