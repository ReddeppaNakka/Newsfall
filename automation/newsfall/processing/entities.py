"""
Entity extraction + resolution (Parts 6, 7).

NORMALIZED → ENTITIES_EXTRACTED | SKIPPED

Per article: one cheap classification call (event type / magnitude / is_event) and one
entity-extraction call. Extracted names are resolved deterministically through the
alias table before anything new is created, so "Nvidia Corp." and "NVIDIA" are one entity.
TECHNOLOGY / PRODUCT entities are bridged to the legacy `technologies` table by slug/name.
"""

from __future__ import annotations

import re

from ..config import PipelineConfig
from ..db import upsert
from ..llm import LLMService
from ..log import get_logger
from ..text import alias_key, short_hash, slugify

log = get_logger("entities")


_DOMAIN_RE = re.compile(r"^[a-z0-9-]+(\.[a-z0-9-]+)+$")


def official_url_from_domain(domain: str | None) -> str | None:
    """'nvidia.com' → 'https://nvidia.com'; rejects anything that is not a bare hostname."""
    if not domain:
        return None
    d = domain.strip().lower().removeprefix("https://").removeprefix("http://").split("/")[0].removeprefix("www.")
    return f"https://{d}" if _DOMAIN_RE.match(d) and len(d) <= 100 else None


def enrich_entity_domains(db, llm: LLMService, *, limit: int = 100, batch: int = 25) -> int:
    """Backfill official_url for the most-mentioned entities lacking one (organisations/products only)."""
    rows = (db.table("entities").select("id,name,entity_type").is_("official_url", "null")
            .in_("entity_type", ["COMPANY", "STARTUP", "INVESTOR", "FUND", "RESEARCH_LAB", "ORGANIZATION", "GOVERNMENT", "PRODUCT", "TECHNOLOGY"])
            .order("mention_count", desc=True).limit(limit).execute().data or [])
    updated = 0
    for i in range(0, len(rows), batch):
        chunk = rows[i:i + batch]
        if llm.budget_left() < 1:
            break
        res = llm.entity_domains([r["name"] for r in chunk])
        if not res:
            continue
        by_name = {alias_key(k): v for k, v in res.domains.items()}
        for r in chunk:
            url = official_url_from_domain(by_name.get(alias_key(r["name"])))
            if url:
                db.table("entities").update({"official_url": url}).eq("id", r["id"]).execute()
                updated += 1
    log.info("entity domains enriched", updated=updated, checked=len(rows))
    return updated


class EntityResolver:
    """In-memory alias index over `entity_aliases` + `entities`, with create-on-miss."""

    def __init__(self, db):
        self.db = db
        self.alias_to_id: dict[str, str] = {}
        self.id_to_entity: dict[str, dict] = {}
        self.slugs: set[str] = set()
        self.tech_by_key: dict[str, str] = {}
        self._load()

    def _load(self) -> None:
        start, page = 0, 1000
        while True:
            rows = self.db.table("entities").select("id,slug,name,entity_type,aliases,technology_id").range(start, start + page - 1).execute().data or []
            for e in rows:
                self.id_to_entity[e["id"]] = e
                self.slugs.add(e["slug"])
                self.alias_to_id.setdefault(alias_key(e["name"]), e["id"])
                for a in e.get("aliases") or []:
                    self.alias_to_id.setdefault(alias_key(a), e["id"])
            if len(rows) < page:
                break
            start += page
        start = 0
        while True:
            rows = self.db.table("entity_aliases").select("entity_id,alias_normalized").range(start, start + page - 1).execute().data or []
            for a in rows:
                self.alias_to_id.setdefault(a["alias_normalized"], a["entity_id"])
            if len(rows) < page:
                break
            start += page
        for t in self.db.table("technologies").select("id,slug,name").execute().data or []:
            self.tech_by_key[alias_key(t["name"])] = t["id"]
            self.tech_by_key[alias_key(t["slug"].replace("-", " "))] = t["id"]

    def resolve(self, name: str, aliases: list[str] | None = None) -> str | None:
        for candidate in [name, *(aliases or [])]:
            key = alias_key(candidate)
            if key and key in self.alias_to_id:
                return self.alias_to_id[key]
        return None

    def get_or_create(self, name: str, entity_type: str, aliases: list[str] | None = None,
                      description: str | None = None, official_domain: str | None = None) -> str:
        found = self.resolve(name, aliases)
        if found:
            self._add_aliases(found, [name, *(aliases or [])])
            return found
        key = alias_key(name)
        if not key:
            raise ValueError("empty entity name")
        base = slugify(name)
        slug = base if base not in self.slugs else f"{base}-{entity_type.lower()}"
        if slug in self.slugs:
            slug = f"{base}-{short_hash(key, 6)}"
        row = {
            "slug": slug, "name": name.strip()[:120], "entity_type": entity_type,
            "aliases": sorted({a.strip() for a in (aliases or []) if a and a.strip() and alias_key(a) != key})[:12],
            "description": description,
            "official_url": official_url_from_domain(official_domain),
            "technology_id": self.tech_by_key.get(key) if entity_type in ("TECHNOLOGY", "PRODUCT") else None,
        }
        try:
            created = self.db.table("entities").insert(row).execute().data[0]
        except Exception as exc:  # noqa: BLE001 — slug race / stale index → adopt or re-slug
            if "23505" not in str(exc) and "duplicate key" not in str(exc):
                raise
            existing = self.db.table("entities").select("id,slug,name,entity_type,aliases").eq("slug", slug).execute().data
            if existing and alias_key(existing[0]["name"]) == key:
                created = existing[0]
            else:
                row["slug"] = f"{base}-{short_hash(key + entity_type, 6)}"
                created = self.db.table("entities").insert(row).execute().data[0]
        eid = created["id"]
        self.id_to_entity[eid] = created
        self.slugs.add(slug)
        self.alias_to_id[key] = eid
        self._add_aliases(eid, [name, *(aliases or [])])
        log.info("entity created", entity=name, type=entity_type, slug=slug)
        return eid

    def _add_aliases(self, entity_id: str, names: list[str]) -> None:
        rows = []
        for n in names:
            k = alias_key(n)
            if not k or len(k) < 2:
                continue
            if k in self.alias_to_id:
                continue
            self.alias_to_id[k] = entity_id
            rows.append({"entity_id": entity_id, "alias": n.strip()[:120], "alias_normalized": k})
        if rows:
            upsert(self.db, "entity_aliases", rows, on_conflict="alias_normalized", ignore_duplicates=True)


def run_entity_extraction(db, cfg: PipelineConfig, llm: LLMService) -> dict:
    stats = {"processed": 0, "skipped_irrelevant": 0, "mentions": 0, "failed": 0}
    rows = (db.table("raw_articles").select("id,title,content,source_id,metadata,sources(name,source_type)")
            .eq("ingestion_status", "NORMALIZED").not_.is_("embedding", "null")
            .order("published_at", desc=True).limit(cfg.max_articles_per_run).execute().data or [])
    if not rows:
        return stats
    if not llm.enabled:
        log.warning("no LLM configured — entity extraction skipped")
        return stats
    if not rows:
        stats["domains_enriched"] = enrich_entity_domains(db, llm, limit=50)
        return stats

    resolver = EntityResolver(db)
    for art in rows:
        if llm.budget_left() < 1:
            log.warning("LLM budget low — stopping entity extraction", processed=stats["processed"])
            break
        src = art.get("sources") or {}
        content = art.get("content") or ""
        try:
            # One call returns entities AND the classification signals (event type/title/magnitude).
            ext = llm.extract_entities(art["title"], content, src.get("name") or "unknown")
        except Exception as exc:  # noqa: BLE001 — one bad article never stops the run
            log.error("extraction crashed", article=art["id"], error=str(exc)[:200])
            db.table("raw_articles").update({"ingestion_status": "FAILED", "error": str(exc)[:300]}).eq("id", art["id"]).execute()
            stats["failed"] += 1
            continue

        if ext is None:
            db.table("raw_articles").update({"ingestion_status": "FAILED", "error": "llm unavailable"}).eq("id", art["id"]).execute()
            stats["failed"] += 1
            continue

        meta = dict(art.get("metadata") or {})
        meta["classification"] = {
            "is_event": ext.is_event, "event_type": ext.event_type,
            "event_title": (ext.event_title or art["title"])[:140], "magnitude": ext.magnitude,
        }
        if ext and not ext.is_relevant:
            db.table("raw_articles").update({"ingestion_status": "SKIPPED", "metadata": meta,
                                             "error": f"irrelevant: {ext.relevance_reason or ''}"[:200]}).eq("id", art["id"]).execute()
            stats["skipped_irrelevant"] += 1
            continue

        mentions = []
        for ent in (ext.entities if ext else []):
            try:
                eid = resolver.get_or_create(ent.name, ent.type, ent.aliases, official_domain=ent.official_domain)
            except Exception as exc:  # noqa: BLE001 — one unresolvable entity never aborts the stage
                log.warning("entity resolution failed", entity=ent.name, error=str(exc)[:200])
                continue
            mentions.append({"article_id": art["id"], "entity_id": eid, "mention_type": ent.mention_type,
                             "confidence": ent.confidence, "context": (ent.context or None) and ent.context[:300]})
        # De-duplicate by entity (two aliases may resolve to one entity).
        uniq = {m["entity_id"]: m for m in mentions}
        upsert(db, "entity_mentions", list(uniq.values()), on_conflict="article_id,entity_id")
        stats["mentions"] += len(uniq)
        db.table("raw_articles").update({"ingestion_status": "ENTITIES_EXTRACTED", "metadata": meta, "error": None}).eq("id", art["id"]).execute()
        stats["processed"] += 1

    # Cheap batch backfill so top entities get real logos in the UI.
    stats["domains_enriched"] = enrich_entity_domains(db, llm, limit=50)
    log.info("entity extraction complete", **stats)
    return stats
