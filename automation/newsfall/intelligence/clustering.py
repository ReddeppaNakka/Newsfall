"""
Event clustering (Parts 9, 10). CLAIMS_EXTRACTED → CLUSTERED

Hybrid decision for every new event-bearing article:

    score = 0.55·cosine + 0.30·entity_jaccard + 0.10·time_proximity + 0.05·type_match

    score >= cluster_accept  → attach deterministically
    score <= cluster_reject  → new event
    otherwise                → ask the reasoning model (grey zone only)

Candidates are recent ACTIVE/UPDATED events sharing the article's embedding model.
Articles classified as non-events (tutorials, opinion) are marked CLUSTERED with no event.
"""

from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone

from ..config import PipelineConfig
from ..db import pg_to_vec, upsert, vec_to_pg
from ..llm import LLMService
from ..log import get_logger
from ..text import cosine, jaccard, parse_datetime, short_hash, slugify

log = get_logger("clustering")


def time_proximity(a: datetime | None, b: datetime | None, window_days: int) -> float:
    if not a or not b:
        return 0.5
    days = abs((a - b).total_seconds()) / 86400
    return max(0.0, 1.0 - days / max(window_days, 1))


def cluster_score(cos: float, ent_jac: float, t_prox: float, type_match: bool) -> float:
    """Pure, unit-tested composite similarity."""
    return round(0.55 * cos + 0.30 * ent_jac + 0.10 * t_prox + (0.05 if type_match else 0.0), 4)


def event_slug(title: str, key: str) -> str:
    return f"{slugify(title, 60)}-{short_hash(key, 6)}"


def _load_candidates(db, model: str, window_days: int) -> list[dict]:
    since = (datetime.now(timezone.utc) - timedelta(days=window_days)).isoformat()
    events = (db.table("events").select("id,slug,title,summary,event_type,occurred_at,embedding,embedding_model")
              .in_("status", ["ACTIVE", "UPDATED", "CONTRADICTED"]).eq("embedding_model", model)
              .gte("last_updated_at", since).limit(600).execute().data or [])
    if not events:
        return []
    ids = [e["id"] for e in events]
    ents: dict[str, set[str]] = {i: set() for i in ids}
    for chunk_start in range(0, len(ids), 200):
        rows = db.table("event_entities").select("event_id,entity_id").in_("event_id", ids[chunk_start:chunk_start + 200]).execute().data or []
        for r in rows:
            ents[r["event_id"]].add(r["entity_id"])
    for e in events:
        e["_vec"] = pg_to_vec(e.get("embedding"))
        e["_entities"] = ents[e["id"]]
        e["_when"] = parse_datetime(e.get("occurred_at"))
    return [e for e in events if e["_vec"]]


def _attach(db, event: dict, art: dict, entity_ids: set[str], similarity: float, how: str) -> None:
    upsert(db, "event_articles", [{"event_id": event["id"], "article_id": art["id"], "similarity": round(similarity, 3),
                                   "attached_by": how}], on_conflict="event_id,article_id", ignore_duplicates=True)
    new_ents = [{"event_id": event["id"], "entity_id": eid, "role": "INVOLVED"} for eid in entity_ids - event["_entities"]]
    upsert(db, "event_entities", new_ents, on_conflict="event_id,entity_id", ignore_duplicates=True)
    event["_entities"] |= entity_ids
    db.table("claims").update({"event_id": event["id"]}).eq("article_id", art["id"]).execute()
    when = parse_datetime(art.get("published_at"))
    patch = {"last_updated_at": datetime.now(timezone.utc).isoformat(), "status": "UPDATED"}
    if when and (not event["_when"] or when < event["_when"]):
        patch["occurred_at"] = when.isoformat()
        event["_when"] = when
    db.table("events").update(patch).eq("id", event["id"]).execute()


def _create(db, art: dict, entity_ids: set[str], cls: dict, vec: list[float], model: str) -> dict:
    title = (cls.get("event_title") or art["title"]).strip()[:140]
    slug = event_slug(title, art["id"])
    row = {
        "slug": slug, "title": title, "event_type": cls.get("event_type") or "OTHER",
        "summary": art.get("summary"), "status": "ACTIVE", "occurred_at": art.get("published_at"),
        "embedding": vec_to_pg(vec), "embedding_model": model,
        "score_breakdown": {"magnitude": cls.get("magnitude", 0.3)},
    }
    ev = db.table("events").insert(row).execute().data[0]
    upsert(db, "event_articles", [{"event_id": ev["id"], "article_id": art["id"], "similarity": 1.0,
                                   "is_primary": True, "attached_by": "seed"}], on_conflict="event_id,article_id", ignore_duplicates=True)
    upsert(db, "event_entities", [{"event_id": ev["id"], "entity_id": e, "role": "INVOLVED"} for e in entity_ids],
           on_conflict="event_id,entity_id", ignore_duplicates=True)
    db.table("claims").update({"event_id": ev["id"]}).eq("article_id", art["id"]).execute()
    ev["_vec"], ev["_entities"], ev["_when"] = vec, set(entity_ids), parse_datetime(art.get("published_at"))
    log.info("event created", slug=slug, type=row["event_type"])
    return ev


def run_clustering(db, cfg: PipelineConfig, llm: LLMService) -> dict:
    stats = {"processed": 0, "attached": 0, "created": 0, "non_events": 0, "llm_verified": 0}
    rows = (db.table("raw_articles").select("id,title,summary,published_at,metadata,embedding,embedding_model")
            .eq("ingestion_status", "CLAIMS_EXTRACTED").order("published_at", desc=False)
            .limit(cfg.max_articles_per_run).execute().data or [])
    if not rows:
        return stats

    mentions = db.table("entity_mentions").select("article_id,entity_id,mention_type").in_("article_id", [r["id"] for r in rows]).execute().data or []
    ents_by_article: dict[str, set[str]] = {}
    for m in mentions:
        if m["mention_type"] in ("SUBJECT", "ACTOR", "TARGET", "MENTIONED"):
            ents_by_article.setdefault(m["article_id"], set()).add(m["entity_id"])
    entity_names: dict[str, str] = {}
    all_ids = list({e for s in ents_by_article.values() for e in s})
    for i in range(0, len(all_ids), 200):
        for e in db.table("entities").select("id,name").in_("id", all_ids[i:i + 200]).execute().data or []:
            entity_names[e["id"]] = e["name"]

    candidates_by_model: dict[str, list[dict]] = {}
    for art in rows:
        cls = (art.get("metadata") or {}).get("classification") or {}
        vec = pg_to_vec(art.get("embedding"))
        model = art.get("embedding_model") or "hash-v1"
        art_entities = ents_by_article.get(art["id"], set())
        stats["processed"] += 1

        if not cls.get("is_event", True) or not vec:
            db.table("raw_articles").update({"ingestion_status": "CLUSTERED"}).eq("id", art["id"]).execute()
            stats["non_events"] += 1
            continue

        if model not in candidates_by_model:
            candidates_by_model[model] = _load_candidates(db, model, cfg.cluster_window_days)
        candidates = candidates_by_model[model]
        when = parse_datetime(art.get("published_at"))

        scored = []
        for ev in candidates:
            cos = cosine(vec, ev["_vec"])
            if cos < 0.3:
                continue
            s = cluster_score(cos, jaccard(art_entities, ev["_entities"]), time_proximity(when, ev["_when"], cfg.cluster_window_days),
                              (ev.get("event_type") == cls.get("event_type")))
            scored.append((s, cos, ev))
        scored.sort(key=lambda t: t[0], reverse=True)
        best = scored[0] if scored else None

        target = None
        how = "deterministic"
        if best and best[0] >= cfg.cluster_accept:
            target = best[2]
        elif best and best[0] > cfg.cluster_reject:
            # Grey zone: consult the reasoning model on the top candidates only.
            for s, cos, ev in scored[: min(3, cfg.cluster_candidates)]:
                if s <= cfg.cluster_reject or llm.budget_left() < 1:
                    break
                shared = [entity_names.get(e, "?") for e in (art_entities & ev["_entities"])][:6]
                verdict = llm.cluster_verify(art["title"], art.get("summary") or "", ev["title"], ev.get("summary") or "", shared)
                stats["llm_verified"] += 1
                if verdict and verdict.same_event and verdict.confidence >= 0.6:
                    target, how, best = ev, "llm", (s, cos, ev)
                    break

        if target:
            _attach(db, target, art, art_entities, best[1], how)
            stats["attached"] += 1
        else:
            ev = _create(db, art, art_entities, cls, vec, model)
            candidates.append(ev)
            stats["created"] += 1
        db.table("raw_articles").update({"ingestion_status": "CLUSTERED"}).eq("id", art["id"]).execute()

    log.info("clustering complete", **stats)
    return stats
