/**
 * Typed server-side data access for the intelligence layer.
 *
 * Every query is wrapped in `safe()` so a database without migration 001 (or preview
 * mode, whose mock client lacks most builder methods) yields empty results instead of
 * a crash — the legacy pages must never break because intelligence data is absent.
 */
import "server-only";
import { supabase } from "./supabase";
import { rankScore } from "./category";
import type {
  ArticlePublic, Claim, Entity, EntityRef, EventWithEntities, IntelEvent, IntelligenceReport,
  Relationship, WatchItem,
} from "./intelligence-types";

async function safe<T>(fn: () => PromiseLike<{ data: unknown; error: unknown }>, fallback: T): Promise<T> {
  try {
    const { data, error } = await fn();
    if (error) return fallback;
    return (data ?? fallback) as T;
  } catch {
    return fallback;
  }
}

const EVENT_COLS =
  "id,slug,title,event_type,summary,status,occurred_at,first_seen_at,last_updated_at,importance_score," +
  "confidence_score,score_breakdown,why_it_matters,industry_impact,intelligence_summary,what_to_watch," +
  "scenarios,article_count,source_count,independent_source_count,primary_source_confirmed,has_contradiction,analyzed_at";

const ENTITY_REF = "id,slug,name,entity_type,influence_score";

type EventEntityRow = { role: string; entities: EntityRef | null };

function withEntities(rows: (IntelEvent & { event_entities?: EventEntityRow[] })[]): EventWithEntities[] {
  return rows.map(({ event_entities, ...e }) => ({
    ...e,
    entities: (event_entities ?? [])
      .filter((r) => r.entities)
      .map((r) => ({ ...(r.entities as EntityRef), role: r.role }))
      .sort((a, b) => b.influence_score - a.influence_score),
  }));
}

export interface EventFilters {
  limit?: number;
  offset?: number;
  minImportance?: number;
  minConfidence?: number;
  type?: string;
  status?: string;
  sinceDays?: number;
  entityId?: string;
  analyzedOnly?: boolean;
}

export async function listEvents(f: EventFilters = {}): Promise<EventWithEntities[]> {
  const limit = Math.min(f.limit ?? 20, 100);
  const rows = await safe<(IntelEvent & { event_entities?: EventEntityRow[] })[]>(() => {
    let q = supabase
      .from("events")
      .select(`${EVENT_COLS}, event_entities(role, entities(${ENTITY_REF}))`)
      .order("importance_score", { ascending: false })
      .order("last_updated_at", { ascending: false })
      .range(f.offset ?? 0, (f.offset ?? 0) + limit - 1);
    if (f.minImportance != null) q = q.gte("importance_score", f.minImportance);
    if (f.minConfidence != null) q = q.gte("confidence_score", f.minConfidence);
    if (f.type) q = q.eq("event_type", f.type);
    if (f.status) q = q.eq("status", f.status);
    if (f.analyzedOnly) q = q.not("analyzed_at", "is", null);
    if (f.sinceDays) q = q.gte("last_updated_at", new Date(Date.now() - f.sinceDays * 86400000).toISOString());
    return q;
  }, []);
  let events = withEntities(rows);
  if (f.entityId) events = events.filter((e) => e.entities.some((x) => x.id === f.entityId));
  return events;
}

/** Homepage cards: ranked by intelligence value (importance, confidence, corroboration, recency). */
export async function listRankedEvents(limit = 6, sinceDays = 14): Promise<EventWithEntities[]> {
  const rows = await listEvents({ limit: 40, sinceDays });
  const now = Date.now();
  return rows.sort((a, b) => rankScore(b, now) - rankScore(a, now)).slice(0, limit);
}

export async function getTopEvent(): Promise<EventWithEntities | null> {
  const [e] = await listEvents({ limit: 1, sinceDays: 7, analyzedOnly: true });
  if (e) return e;
  const [fallback] = await listEvents({ limit: 1, sinceDays: 7 });
  return fallback ?? null;
}

export async function getEventBySlug(slug: string): Promise<EventWithEntities | null> {
  const row = await safe<(IntelEvent & { event_entities?: EventEntityRow[] }) | null>(
    () =>
      supabase
        .from("events")
        .select(`${EVENT_COLS}, event_entities(role, entities(${ENTITY_REF}))`)
        .eq("slug", slug)
        .maybeSingle(),
    null,
  );
  return row ? withEntities([row])[0] : null;
}

export async function getEventArticles(eventId: string): Promise<(ArticlePublic & { is_primary: boolean; similarity: number | null })[]> {
  const links = await safe<{ article_id: string; is_primary: boolean; similarity: number | null }[]>(
    () => supabase.from("event_articles").select("article_id,is_primary,similarity").eq("event_id", eventId),
    [],
  );
  if (!links.length) return [];
  const articles = await safe<ArticlePublic[]>(
    () => supabase.from("articles_public").select("*").in("id", links.map((l) => l.article_id)),
    [],
  );
  const byId = new Map(links.map((l) => [l.article_id, l]));
  return articles
    .map((a) => ({ ...a, is_primary: byId.get(a.id)?.is_primary ?? false, similarity: byId.get(a.id)?.similarity ?? null }))
    .sort((a, b) => (b.credibility_score ?? 0) - (a.credibility_score ?? 0));
}

export async function getEventClaims(eventId: string): Promise<Claim[]> {
  type Row = Omit<Claim, "evidence" | "subject" | "object"> & {
    subject: Claim["subject"];
    object: Claim["object"];
    claim_evidence: (Omit<Claim["evidence"][number], "source"> & { sources: Claim["evidence"][number]["source"] })[];
  };
  const rows = await safe<Row[]>(
    () =>
      supabase
        .from("claims")
        .select(
          "id,claim_text,claim_type,status,confidence,source_context," +
            "subject:entities!claims_subject_entity_id_fkey(name,slug)," +
            "object:entities!claims_object_entity_id_fkey(name,slug)," +
            "claim_evidence(id,claim_id,article_id,stance,excerpt,credibility_weight,confidence,sources(name,source_type,credibility_score,is_primary_source))",
        )
        .eq("event_id", eventId)
        .order("confidence", { ascending: false }),
    [],
  );
  return rows.map(({ claim_evidence, ...c }) => ({
    ...c,
    evidence: (claim_evidence ?? []).map(({ sources, ...e }) => ({ ...e, source: sources ?? null })),
  }));
}

export async function getRelatedEvents(event: EventWithEntities, limit = 6): Promise<IntelEvent[]> {
  const ids = event.entities.slice(0, 6).map((e) => e.id);
  if (!ids.length) return [];
  const links = await safe<{ event_id: string }[]>(
    () => supabase.from("event_entities").select("event_id").in("entity_id", ids).neq("event_id", event.id).limit(200),
    [],
  );
  const counts = new Map<string, number>();
  for (const l of links) counts.set(l.event_id, (counts.get(l.event_id) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([id]) => id);
  if (!top.length) return [];
  const rows = await safe<IntelEvent[]>(
    () => supabase.from("events").select(EVENT_COLS).in("id", top).order("importance_score", { ascending: false }).limit(limit),
    [],
  );
  return rows;
}

export async function getEventWatchItems(eventId: string): Promise<WatchItem[]> {
  return safe<WatchItem[]>(
    () => supabase.from("watch_items").select("*").eq("event_id", eventId).eq("status", "OPEN").order("confidence", { ascending: false }),
    [],
  );
}

export async function listWatchItems(limit = 12): Promise<WatchItem[]> {
  return safe<WatchItem[]>(
    () =>
      supabase
        .from("watch_items")
        .select("*, event:events(slug,title)")
        .eq("status", "OPEN")
        .order("confidence", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(limit),
    [],
  );
}

export async function listEntities(opts: { type?: string; q?: string; limit?: number } = {}): Promise<Entity[]> {
  return safe<Entity[]>(() => {
    let q = supabase.from("entities").select("*").order("influence_score", { ascending: false }).limit(Math.min(opts.limit ?? 60, 200));
    if (opts.type) q = q.eq("entity_type", opts.type);
    if (opts.q) q = q.ilike("name", `%${opts.q}%`);
    return q;
  }, []);
}

export async function getEntityBySlug(slug: string): Promise<Entity | null> {
  return safe<Entity | null>(() => supabase.from("entities").select("*").eq("slug", slug).maybeSingle(), null);
}

export async function getEntityEvents(entityId: string, limit = 20): Promise<(IntelEvent & { role: string })[]> {
  const rows = await safe<{ role: string; events: IntelEvent | null }[]>(
    () => supabase.from("event_entities").select(`role, events(${EVENT_COLS})`).eq("entity_id", entityId).limit(200),
    [],
  );
  return rows
    .filter((r) => r.events)
    .map((r) => ({ ...(r.events as IntelEvent), role: r.role }))
    .sort((a, b) => (b.occurred_at ?? b.first_seen_at).localeCompare(a.occurred_at ?? a.first_seen_at))
    .slice(0, limit);
}

export async function getEntityRelationships(entityId: string): Promise<Relationship[]> {
  const sel =
    `id,relationship_type,confidence,status,valid_from,` +
    `source:entities!entity_relationships_source_entity_id_fkey(${ENTITY_REF}),` +
    `target:entities!entity_relationships_target_entity_id_fkey(${ENTITY_REF})`;
  const [out, inn] = await Promise.all([
    safe<Relationship[]>(() => supabase.from("entity_relationships").select(sel).eq("source_entity_id", entityId).limit(50), []),
    safe<Relationship[]>(() => supabase.from("entity_relationships").select(sel).eq("target_entity_id", entityId).limit(50), []),
  ]);
  return [...out, ...inn].sort((a, b) => b.confidence - a.confidence);
}

export async function getEntityClaims(entityId: string, limit = 12): Promise<Claim[]> {
  const rows = await safe<(Omit<Claim, "evidence"> & { claim_evidence: unknown[] })[]>(
    () =>
      supabase
        .from("claims")
        .select(
          "id,claim_text,claim_type,status,confidence,source_context," +
            "subject:entities!claims_subject_entity_id_fkey(name,slug)," +
            "object:entities!claims_object_entity_id_fkey(name,slug)",
        )
        .or(`subject_entity_id.eq.${entityId},object_entity_id.eq.${entityId}`)
        .order("confidence", { ascending: false })
        .limit(limit),
    [],
  );
  return rows.map((r) => ({ ...r, evidence: [] }));
}

export async function getLatestBriefing(): Promise<IntelligenceReport | null> {
  return safe<IntelligenceReport | null>(
    () => supabase.from("intelligence_reports").select("*").eq("kind", "DAILY").order("period_start", { ascending: false }).limit(1).maybeSingle(),
    null,
  );
}

export async function getEventsBySlugs(slugs: string[]): Promise<Pick<IntelEvent, "slug" | "title" | "importance_score">[]> {
  if (!slugs.length) return [];
  return safe(() => supabase.from("events").select("slug,title,importance_score").in("slug", slugs), []);
}

export async function countEvents(): Promise<number> {
  try {
    const { count } = await supabase.from("events").select("id", { count: "exact", head: true });
    return count ?? 0;
  } catch {
    return 0;
  }
}
