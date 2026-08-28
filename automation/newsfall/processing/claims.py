"""
Claim extraction (Part 8). ENTITIES_EXTRACTED → CLAIMS_EXTRACTED

Every claim is stored independently with its originating article as the first
evidence row. The initial status is derived from the claim type AND the source type —
an official source stating a fact starts CONFIRMED, a news report starts REPORTED,
'reportedly' starts UNVERIFIED. Verification later moves claims along the ladder.
"""

from __future__ import annotations

from ..config import PipelineConfig
from ..db import upsert
from ..llm import LLMService
from ..log import get_logger
from ..sources.registry import credibility_for
from ..text import alias_key, short_hash
from .entities import EntityResolver

log = get_logger("claims")


def initial_status(claim_type: str, source_type: str, is_primary: bool) -> str:
    """Pure, unit-tested. The starting rung on the verification ladder."""
    if claim_type in ("OPINION", "PREDICTION"):
        return "UNVERIFIED"
    if claim_type == "RUMOR":
        return "UNVERIFIED"
    if claim_type == "FACT" and is_primary and source_type in ("OFFICIAL", "GOVERNMENT", "RESEARCH", "FINANCIAL"):
        return "CONFIRMED"
    if source_type in ("COMMUNITY", "SOCIAL"):
        return "UNVERIFIED"
    return "REPORTED"


def claim_hash(text: str) -> str:
    return short_hash(alias_key(text), 16)


def run_claim_extraction(db, cfg: PipelineConfig, llm: LLMService) -> dict:
    stats = {"processed": 0, "claims": 0, "failed": 0}
    rows = (db.table("raw_articles").select("id,title,content,source_id,sources(id,name,source_type,credibility_score,is_primary_source)")
            .eq("ingestion_status", "ENTITIES_EXTRACTED").order("published_at", desc=True)
            .limit(cfg.max_articles_per_run).execute().data or [])
    if not rows:
        return stats
    if not llm.enabled:
        return stats

    resolver = EntityResolver(db)
    for art in rows:
        if llm.budget_left() < 1:
            break
        src = art.get("sources") or {}
        try:
            ext = llm.extract_claims(art["title"], art.get("content") or "", src.get("name") or "unknown", src.get("source_type") or "NEWS")
        except Exception as exc:  # noqa: BLE001
            db.table("raw_articles").update({"ingestion_status": "FAILED", "error": str(exc)[:300]}).eq("id", art["id"]).execute()
            stats["failed"] += 1
            continue
        if ext is None:
            # LLM unavailable: keep the article moving; it still has entities and can cluster.
            db.table("raw_articles").update({"ingestion_status": "CLAIMS_EXTRACTED", "error": "claims: llm unavailable"}).eq("id", art["id"]).execute()
            stats["failed"] += 1
            continue

        claim_rows = []
        for c in ext.claims[:8]:
            subj = resolver.resolve(c.subject) if c.subject else None
            obj = resolver.resolve(c.object) if c.object else None
            claim_rows.append({
                "article_id": art["id"], "claim_text": c.claim.strip(), "claim_type": c.claim_type,
                "status": initial_status(c.claim_type, src.get("source_type") or "NEWS", bool(src.get("is_primary_source"))),
                "subject_entity_id": subj, "object_entity_id": obj, "confidence": c.confidence,
                "source_context": c.source_context, "claim_hash": claim_hash(c.claim),
            })
        # Idempotent on (article_id, claim_hash).
        by_hash = {r["claim_hash"]: r for r in claim_rows}
        inserted = []
        if by_hash:
            res = db.table("claims").upsert(list(by_hash.values()), on_conflict="article_id,claim_hash").execute()
            inserted = res.data or []
        evidence = [{
            "claim_id": cl["id"], "article_id": art["id"], "source_id": src.get("id"),
            "excerpt": cl.get("source_context"), "stance": "SUPPORTS",
            "credibility_weight": credibility_for(src, cl.get("claim_type")), "confidence": cl.get("confidence", 0.5),
        } for cl in inserted]
        upsert(db, "claim_evidence", evidence, on_conflict="claim_id,article_id")
        db.table("raw_articles").update({"ingestion_status": "CLAIMS_EXTRACTED", "error": None}).eq("id", art["id"]).execute()
        stats["claims"] += len(inserted)
        stats["processed"] += 1

    log.info("claim extraction complete", **stats)
    return stats
