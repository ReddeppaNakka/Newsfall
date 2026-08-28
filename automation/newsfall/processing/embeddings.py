"""
Embedding stage (Part 30): NORMALIZED articles without a vector get one, then a
semantic near-duplicate check against recent articles of the SAME embedding model.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from ..config import PipelineConfig
from ..db import pg_to_vec, vec_to_pg
from ..llm import LLMService
from ..log import get_logger
from ..text import cosine

log = get_logger("embeddings")


def embedding_text(title: str, content: str | None) -> str:
    return f"{title}\n\n{(content or '')[:3000]}"


def run_embeddings(db, cfg: PipelineConfig, llm: LLMService) -> dict:
    stats = {"embedded": 0, "semantic_duplicates": 0, "model": None}
    rows = (db.table("raw_articles").select("id,title,content,source_id,published_at")
            .eq("ingestion_status", "NORMALIZED").is_("embedding", "null")
            .limit(cfg.max_articles_per_run).execute().data or [])
    if not rows:
        return stats

    vectors, model = llm.embed([embedding_text(r["title"], r.get("content")) for r in rows])
    stats["model"] = model

    since = (datetime.now(timezone.utc) - timedelta(days=3)).isoformat()
    recent = (db.table("raw_articles").select("id,embedding").eq("embedding_model", model)
              .not_.is_("embedding", "null").gte("created_at", since)
              .neq("ingestion_status", "DUPLICATE").limit(1500).execute().data or [])
    recent_vecs = [(r["id"], pg_to_vec(r["embedding"])) for r in recent]
    recent_vecs = [(i, v) for i, v in recent_vecs if v]

    for row, vec in zip(rows, vectors):
        dup_of = None
        for other_id, other_vec in recent_vecs:
            if other_id != row["id"] and cosine(vec, other_vec) >= cfg.embedding_similarity_dup:
                dup_of = other_id
                break
        patch = {"embedding": vec_to_pg(vec), "embedding_model": model}
        if dup_of:
            patch.update({"ingestion_status": "DUPLICATE", "duplicate_of": dup_of})
            stats["semantic_duplicates"] += 1
        else:
            recent_vecs.append((row["id"], vec))
            stats["embedded"] += 1
        db.table("raw_articles").update(patch).eq("id", row["id"]).execute()

    log.info("embeddings complete", **stats)
    return stats
