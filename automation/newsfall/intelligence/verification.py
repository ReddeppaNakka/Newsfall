"""
Evidence verification + contradiction detection (Parts 11, 12, 4-phase).

For every event touched recently:
  1. cross-check each substantive claim against the OTHER articles in the event
     (stance via the fast model, bounded per run);
  2. recompute the claim's status from its evidence using the verification ladder;
  3. roll claim evidence up to event-level confidence, independence, primary
     confirmation and contradiction flags.

The ladder (pure functions below) is deterministic and unit-tested; the LLM only
supplies stances, never statuses.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from ..config import PipelineConfig
from ..db import upsert
from ..llm import LLMService
from ..log import get_logger
from ..sources.registry import TYPE_RANK, credibility_for

log = get_logger("verification")

HIGH_QUALITY = 0.65
VERIFIABLE_TYPES = ("FACT", "REPORTED", "RUMOR")


def claim_status_from_evidence(claim_type: str, evidence: list[dict]) -> tuple[str, float]:
    """evidence rows: {stance, credibility_weight, source_type, is_primary_source, source_key}.
    Returns (status, confidence). Pure, unit-tested."""
    if claim_type in ("OPINION", "PREDICTION"):
        return "UNVERIFIED", 0.3
    supports = [e for e in evidence if e.get("stance") == "SUPPORTS"]
    contradicts = [e for e in evidence if e.get("stance") == "CONTRADICTS"]
    primary = [e for e in supports if e.get("is_primary_source") and (e.get("source_type") in ("OFFICIAL", "GOVERNMENT", "RESEARCH", "FINANCIAL"))]
    hq_keys = {e.get("source_key") for e in supports if float(e.get("credibility_weight") or 0) >= HIGH_QUALITY}
    non_social = [e for e in supports if e.get("source_type") not in ("COMMUNITY", "SOCIAL")]

    support_weight = sum(float(e.get("credibility_weight") or 0) for e in supports)
    contra_weight = sum(float(e.get("credibility_weight") or 0) for e in contradicts)

    if contradicts and supports:
        if contra_weight > support_weight * 1.5 and not primary:
            return "DISPUTED", round(min(0.4, support_weight / (support_weight + contra_weight)), 3)
        if primary and contra_weight < support_weight:
            return "CONFIRMED", round(min(0.9, 0.6 + 0.1 * len(hq_keys)), 3)
        return "DISPUTED", round(support_weight / (support_weight + contra_weight), 3)
    if contradicts and not supports:
        return "FALSE" if contra_weight >= 1.2 else "DISPUTED", round(min(0.6, contra_weight / 2), 3)
    if primary:
        return "CONFIRMED", round(min(0.97, 0.85 + 0.03 * len(hq_keys)), 3)
    if len(hq_keys) >= 2:
        return "PARTIALLY_CONFIRMED", round(min(0.85, 0.55 + 0.1 * len(hq_keys)), 3)
    if non_social:
        base = 0.35 if claim_type == "RUMOR" else 0.5
        return "REPORTED", round(min(0.65, base + 0.1 * max(float(e.get("credibility_weight") or 0) for e in non_social)), 3)
    return "UNVERIFIED", 0.2


def event_confidence(claims: list[dict], source_rows: list[dict]) -> dict:
    """Roll-up: {confidence_score, independent_source_count, primary_source_confirmed, has_contradiction}."""
    keys = {(s.get("organization") or s.get("domain") or s.get("id")) for s in source_rows if s}
    primary = any(s.get("is_primary_source") and s.get("source_type") in ("OFFICIAL", "GOVERNMENT", "RESEARCH", "FINANCIAL") for s in source_rows)
    has_contra = any(c.get("status") in ("DISPUTED", "FALSE") for c in claims)
    substantive = [c for c in claims if c.get("claim_type") in VERIFIABLE_TYPES]
    if substantive:
        top = sorted((float(c.get("confidence") or 0) for c in substantive), reverse=True)[:3]
        base = sum(top) / len(top)
    else:
        best_rank = max((TYPE_RANK.get(s.get("source_type") or "", 1) for s in source_rows), default=1)
        base = 0.25 + 0.1 * best_rank
    independence_bonus = min(0.15, 0.05 * max(0, len(keys) - 1))
    conf = min(0.98, base + independence_bonus + (0.1 if primary else 0.0))
    if has_contra:
        conf = min(conf, 0.55)
    return {"confidence_score": round(conf, 3), "independent_source_count": len(keys),
            "primary_source_confirmed": primary, "has_contradiction": has_contra}


def _touched_events(db, hours: int = 36) -> list[dict]:
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    return (db.table("events").select("id,slug,title,status").gte("last_updated_at", since)
            .in_("status", ["ACTIVE", "UPDATED", "CONTRADICTED"]).limit(400).execute().data or [])


def run_verification(db, cfg: PipelineConfig, llm: LLMService) -> dict:
    stats = {"events": 0, "claims_updated": 0, "stances_checked": 0, "contradictions": 0}
    stance_budget = 120
    for ev in _touched_events(db):
        stats["events"] += 1
        links = db.table("event_articles").select("article_id").eq("event_id", ev["id"]).execute().data or []
        article_ids = [l["article_id"] for l in links]
        if not article_ids:
            continue
        articles = (db.table("raw_articles").select("id,title,content,source_id,sources(id,name,organization,domain,source_type,credibility_score,is_primary_source)")
                    .in_("id", article_ids).execute().data or [])
        by_id = {a["id"]: a for a in articles}
        claims = db.table("claims").select("id,article_id,claim_text,claim_type,status,confidence").eq("event_id", ev["id"]).execute().data or []
        evidence = db.table("claim_evidence").select("claim_id,article_id,stance,credibility_weight").in_("claim_id", [c["id"] for c in claims]).execute().data if claims else []
        ev_by_claim: dict[str, list[dict]] = {}
        for e in evidence or []:
            ev_by_claim.setdefault(e["claim_id"], []).append(e)

        # 1) cross-source stance checks (only when the event has >1 article)
        if len(articles) > 1 and llm.enabled:
            for c in claims:
                if c["claim_type"] not in VERIFIABLE_TYPES or stance_budget <= 0:
                    continue
                checked = {e["article_id"] for e in ev_by_claim.get(c["id"], [])}
                for a in articles:
                    if a["id"] in checked or stance_budget <= 0 or llm.budget_left() < 5:
                        continue
                    if len(ev_by_claim.get(c["id"], [])) >= 4:
                        break
                    verdict = llm.claim_stance(c["claim_text"], a["title"], a.get("content") or "")
                    stance_budget -= 1
                    stats["stances_checked"] += 1
                    if not verdict:
                        continue
                    src = a.get("sources") or {}
                    row = {"claim_id": c["id"], "article_id": a["id"], "source_id": src.get("id"), "excerpt": verdict.excerpt,
                           "stance": verdict.stance, "credibility_weight": credibility_for(src, c["claim_type"]), "confidence": verdict.confidence}
                    upsert(db, "claim_evidence", [row], on_conflict="claim_id,article_id")
                    ev_by_claim.setdefault(c["id"], []).append(row)

        # 2) recompute claim statuses
        for c in claims:
            rows = []
            for e in ev_by_claim.get(c["id"], []):
                src = (by_id.get(e["article_id"]) or {}).get("sources") or {}
                rows.append({"stance": e["stance"], "credibility_weight": e.get("credibility_weight"),
                             "source_type": src.get("source_type"), "is_primary_source": src.get("is_primary_source"),
                             "source_key": src.get("organization") or src.get("domain") or src.get("id")})
            status, conf = claim_status_from_evidence(c["claim_type"], rows)
            if status != c["status"] or abs(conf - float(c.get("confidence") or 0)) > 0.02:
                db.table("claims").update({"status": status, "confidence": conf}).eq("id", c["id"]).execute()
                c["status"], c["confidence"] = status, conf
                stats["claims_updated"] += 1

        # 3) event roll-up
        roll = event_confidence(claims, [a.get("sources") or {} for a in articles])
        roll.update({"article_count": len(articles), "source_count": len({a.get("source_id") for a in articles if a.get("source_id")})})
        if roll["has_contradiction"]:
            roll["status"] = "CONTRADICTED"
            stats["contradictions"] += 1
        elif ev["status"] == "CONTRADICTED":
            roll["status"] = "UPDATED"
        db.table("events").update(roll).eq("id", ev["id"]).execute()

    log.info("verification complete", **stats)
    return stats
