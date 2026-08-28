/**
 * Semantic + lexical retrieval over the Newsfall knowledge base (Part 20).
 *
 * Vector search uses the pgvector RPCs from migration 001; it only compares vectors of
 * the same embedding model as the query. Lexical search (trigram ilike) always runs
 * too, so results exist even before embeddings do. Used by /api/search and /api/ask.
 */
import "server-only";
import { supabase } from "./supabase";
import { embedQuery } from "./ai";
import type { SearchHit } from "./intelligence-types";

type Rpc = "match_events" | "match_articles" | "match_entities";

async function rpc<T>(name: Rpc, args: Record<string, unknown>): Promise<T[]> {
  try {
    const client = supabase as unknown as { rpc?: (fn: string, a: Record<string, unknown>) => PromiseLike<{ data: T[] | null; error: unknown }> };
    if (!client.rpc) return [];
    const { data, error } = await client.rpc(name, args);
    return error ? [] : (data ?? []);
  } catch {
    return [];
  }
}

async function lexical(q: string): Promise<SearchHit[]> {
  const like = `%${q.replace(/[%_]/g, " ").trim()}%`;
  const out: SearchHit[] = [];
  try {
    const [ev, en, ar] = await Promise.all([
      supabase.from("events").select("id,slug,title,why_it_matters,summary,importance_score,confidence_score").ilike("title", like).order("importance_score", { ascending: false }).limit(8),
      supabase.from("entities").select("id,slug,name,entity_type,description,influence_score").ilike("name", like).order("influence_score", { ascending: false }).limit(8),
      supabase.from("articles_public").select("id,title,url,summary,source_name,published_at").ilike("title", like).order("published_at", { ascending: false }).limit(8),
    ]);
    for (const e of ev.data ?? []) out.push({ kind: "event", id: e.id, title: e.title, href: `/events/${e.slug}`, snippet: e.why_it_matters ?? e.summary, score: 0.5, meta: { importance: e.importance_score, confidence: e.confidence_score, slug: e.slug } });
    for (const e of en.data ?? []) out.push({ kind: "entity", id: e.id, title: e.name, href: `/entities/${e.slug}`, snippet: e.description, score: 0.5, meta: { type: e.entity_type, influence: e.influence_score } });
    for (const a of ar.data ?? []) out.push({ kind: "article", id: a.id, title: a.title, href: a.url, snippet: a.summary, score: 0.45, meta: { source: a.source_name, published_at: a.published_at } });
  } catch {
    /* preview mode / missing tables */
  }
  return out;
}

export async function search(q: string, opts?: { sinceDays?: number; limit?: number }): Promise<SearchHit[]> {
  const query = q.trim().slice(0, 500);
  if (!query) return [];
  const { vector, model } = await embedQuery(query);
  const since = opts?.sinceDays ? new Date(Date.now() - opts.sinceDays * 86400000).toISOString() : null;
  // Hashed vectors are noisier → lower threshold; API vectors → tighter.
  const threshold = model === "hash-v1" ? 0.12 : 0.35;

  const [events, articles, entities, lex] = await Promise.all([
    rpc<{ id: string; slug: string; title: string; summary: string | null; importance_score: number; confidence_score: number; similarity: number; event_type: string }>(
      "match_events", { query_embedding: vector, match_threshold: threshold, match_count: 12, since }),
    rpc<{ id: string; title: string; url: string; summary: string | null; published_at: string | null; similarity: number; source_id: string | null }>(
      "match_articles", { query_embedding: vector, match_threshold: threshold, match_count: 12, since }),
    rpc<{ id: string; slug: string; name: string; entity_type: string; description: string | null; influence_score: number; similarity: number }>(
      "match_entities", { query_embedding: vector, match_threshold: threshold, match_count: 8 }),
    lexical(query),
  ]);

  const hits: SearchHit[] = [
    ...events.map((e) => ({ kind: "event" as const, id: e.id, title: e.title, href: `/events/${e.slug}`, snippet: e.summary, score: e.similarity, meta: { importance: e.importance_score, confidence: e.confidence_score, slug: e.slug, type: e.event_type } })),
    ...articles.map((a) => ({ kind: "article" as const, id: a.id, title: a.title, href: a.url, snippet: a.summary, score: a.similarity, meta: { published_at: a.published_at } })),
    ...entities.map((e) => ({ kind: "entity" as const, id: e.id, title: e.name, href: `/entities/${e.slug}`, snippet: e.description, score: e.similarity, meta: { type: e.entity_type, influence: e.influence_score } })),
    ...lex,
  ];

  // Merge duplicates (vector + lexical) keeping the best score.
  const best = new Map<string, SearchHit>();
  for (const h of hits) {
    const key = `${h.kind}:${h.id}`;
    const prev = best.get(key);
    if (!prev || h.score > prev.score) best.set(key, { ...h, meta: { ...(prev?.meta ?? {}), ...(h.meta ?? {}) } });
  }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, opts?.limit ?? 30);
}
