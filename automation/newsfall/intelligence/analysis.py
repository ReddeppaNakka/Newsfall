"""
Intelligence generation (Parts 14, 15, 26, 27 — phase 5).

For events above the importance threshold that are new or updated since their last
analysis: one reasoning-model call (premium for very high importance) produces
why-it-matters, industry impact, affected entities, evidence-stated relationships,
what-to-watch items, and scenarios. Output is validated, persisted, and the event
is rescored with the AI magnitude/impact signals.
"""

from __future__ import annotations

from datetime import datetime, timezone

from ..config import PipelineConfig
from ..db import upsert
from ..llm import LLMService
from ..log import get_logger
from ..processing.entities import EntityResolver
from .scoring import run_scoring

log = get_logger("analysis")


def _candidates(db, cfg: PipelineConfig) -> list[dict]:
    rows = (db.table("events").select("*").gte("importance_score", cfg.analysis_min_importance)
            .in_("status", ["ACTIVE", "UPDATED", "CONTRADICTED"]).order("importance_score", desc=True)
            .limit(200).execute().data or [])
    out = []
    for e in rows:
        analyzed = e.get("analyzed_at")
        if not analyzed or (e.get("last_updated_at") or "") > analyzed:
            out.append(e)
    return out[: cfg.max_events_analyzed_per_run]


def run_analysis(db, cfg: PipelineConfig, llm: LLMService) -> dict:
    stats = {"analyzed": 0, "relationships": 0, "watch_items": 0, "skipped": 0}
    if not llm.enabled:
        return stats
    events = _candidates(db, cfg)
    if not events:
        return stats
    resolver = EntityResolver(db)

    for ev in events:
        if llm.budget_left() < 2:
            log.warning("LLM budget low — stopping analysis", analyzed=stats["analyzed"])
            break
        links = db.table("event_articles").select("article_id,is_primary").eq("event_id", ev["id"]).execute().data or []
        ids = [l["article_id"] for l in links]
        arts = (db.table("raw_articles").select("id,title,content,url,published_at,sources(name,source_type,credibility_score,is_primary_source)")
                .in_("id", ids).order("published_at", desc=True).limit(8).execute().data or []) if ids else []
        # Highest-credibility evidence first so the model anchors on primary sources.
        arts.sort(key=lambda a: float(((a.get("sources") or {}).get("credibility_score")) or 0), reverse=True)
        articles = [{"title": a["title"], "content": a.get("content"), "source_name": (a.get("sources") or {}).get("name"),
                     "source_type": (a.get("sources") or {}).get("source_type"),
                     "credibility": float(((a.get("sources") or {}).get("credibility_score")) or 0)} for a in arts]
        ents = db.table("event_entities").select("entity_id,entities(id,name,entity_type)").eq("event_id", ev["id"]).execute().data or []
        entity_names = [(e.get("entities") or {}).get("name") for e in ents if e.get("entities")]
        claims = db.table("claims").select("claim_text,status,claim_type").eq("event_id", ev["id"]).limit(15).execute().data or []

        premium = float(ev.get("importance_score") or 0) >= cfg.premium_analysis_min_importance
        analysis = llm.analyze_event(title=ev["title"], event_type=ev["event_type"], articles=articles,
                                     entities=[n for n in entity_names if n], claims=claims, premium=premium)
        if analysis is None:
            stats["skipped"] += 1
            continue

        # Relationships stated by the evidence.
        rel_rows = []
        for r in analysis.relationships[:10]:
            s, t = resolver.resolve(r.source), resolver.resolve(r.target)
            if s and t and s != t:
                rel_rows.append({"source_entity_id": s, "target_entity_id": t, "relationship_type": r.type,
                                 "confidence": r.confidence, "evidence_event_id": ev["id"],
                                 "evidence_article_id": arts[0]["id"] if arts else None,
                                 "valid_from": ev.get("occurred_at"), "status": "ACTIVE"})
        upsert(db, "entity_relationships", rel_rows, on_conflict="source_entity_id,target_entity_id,relationship_type")
        stats["relationships"] += len(rel_rows)

        # Affected entities (resolve only — never create entities from analysis prose).
        affected = [{"event_id": ev["id"], "entity_id": eid, "role": "AFFECTED"}
                    for eid in {resolver.resolve(n) for n in analysis.affected_entities[:10]} if eid]
        upsert(db, "event_entities", affected, on_conflict="event_id,entity_id", ignore_duplicates=True)

        # Watch items.
        watch_rows = []
        for w in analysis.what_to_watch[:5]:
            related = [eid for eid in {resolver.resolve(n) for n in analysis.affected_entities[:6]} if eid]
            watch_rows.append({"title": w.title, "reason": w.reason, "kind": w.kind, "event_id": ev["id"],
                               "related_entity_ids": related, "confidence": w.confidence,
                               "expected_timeframe": w.expected_timeframe, "status": "OPEN"})
        upsert(db, "watch_items", watch_rows, on_conflict="event_id,title")
        stats["watch_items"] += len(watch_rows)

        now = datetime.now(timezone.utc).isoformat()
        db.table("events").update({
            "title": analysis.event_title[:140], "event_type": analysis.event_type, "summary": analysis.summary,
            "why_it_matters": analysis.why_it_matters, "industry_impact": analysis.industry_impact,
            "intelligence_summary": " ".join(analysis.uncertainties)[:900] or None,
            "what_to_watch": [w.title for w in analysis.what_to_watch][:5],
            "scenarios": [s.model_dump() for s in analysis.scenarios[:3]],
            "score_breakdown": {**(ev.get("score_breakdown") or {}), "magnitude": analysis.magnitude,
                                "industry_impact": analysis.industry_impact_score},
            "analysis_model": llm.model_for("premium" if premium else "reasoning"), "analyzed_at": now,
            "last_updated_at": now,
        }).eq("id", ev["id"]).execute()
        if ids:
            db.table("raw_articles").update({"ingestion_status": "PUBLISHED"}).in_("id", ids).execute()
        stats["analyzed"] += 1
        log.info("event analyzed", slug=ev["slug"], premium=premium)

    run_scoring(db, cfg)  # fold the AI signals into the composite score
    log.info("analysis complete", **stats)
    return stats
