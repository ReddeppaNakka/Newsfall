"""
Orchestrator (Part 31). Runs the stages in order, each isolated: a failing stage is
logged and recorded, and the remaining stages still run (later stages simply find
less work). Idempotent end-to-end — running twice produces no duplicate intelligence.
"""

from __future__ import annotations

import traceback
from typing import Callable

from .config import PipelineConfig, load_llm_config, load_pipeline_config
from .db import get_db, record_pipeline_run
from .ingestion import run_ingestion
from .intelligence import (run_analysis, run_clustering, run_daily_briefing, run_influence, run_scoring,
                           run_verification, run_watch_maintenance)
from .llm import LLMService
from .log import get_logger
from .processing import run_claim_extraction, run_embeddings, run_entity_extraction, run_normalize

log = get_logger("orchestrator")

Stage = Callable[..., dict]

STAGES: list[tuple[str, Stage]] = [
    ("ingest", run_ingestion),
    ("normalize", run_normalize),
    ("embed", run_embeddings),
    ("entities", run_entity_extraction),
    ("claims", run_claim_extraction),
    ("cluster", run_clustering),
    ("verify", run_verification),
    ("influence", run_influence),
    ("score", run_scoring),
    ("analyze", run_analysis),
    ("watch", run_watch_maintenance),
    ("report", run_daily_briefing),
]

GROUPS = {
    "ingest": ["ingest"],
    "process": ["normalize", "embed", "entities", "claims"],
    "cluster": ["cluster"],
    "verify": ["verify", "influence", "score"],
    "analyze": ["analyze", "watch"],
    "report": ["report"],
}


def run_pipeline(db=None, *, only: list[str] | None = None) -> dict:
    cfg = load_pipeline_config()
    if not cfg.enabled:
        log.info("intelligence pipeline disabled (INTELLIGENCE_ENABLED=0)")
        return {"disabled": True}
    db = db or get_db()
    run_id = record_pipeline_run(db, None, status="RUNNING", stats={})
    llm = LLMService(load_llm_config(), db=db, run_id=run_id)
    if not llm.enabled:
        log.warning("no LLM API key configured — AI stages will be skipped (ingestion/dedupe still run)")

    selected = set(only) if only else {name for name, _ in STAGES}
    stats: dict = {}
    failures = 0
    for name, fn in STAGES:
        if name not in selected:
            continue
        try:
            with log.timed(f"stage {name}") as fields:
                # Stages accept (db, cfg, llm); some ignore llm.
                result = fn(db, cfg, llm)
                stats[name] = result
                fields.update({k: v for k, v in (result or {}).items() if not isinstance(v, (dict, list))})
        except Exception as exc:  # noqa: BLE001 — isolate stage failures
            failures += 1
            stats[name] = {"error": str(exc)[:300]}
            log.error(f"stage {name} failed", error=str(exc)[:300])
            log.debug(traceback.format_exc())

    stats["llm"] = {"calls": llm.calls, "failures": llm.failures, "provider": llm.cfg.provider,
                    "fast": llm.cfg.fast_model, "reasoning": llm.cfg.reasoning_model}
    status = "SUCCESS" if failures == 0 else ("PARTIAL" if failures < len(selected) else "FAILED")
    record_pipeline_run(db, run_id, status=status, stats=stats)
    log.info("pipeline finished", status=status, llm_calls=llm.calls)
    return stats
