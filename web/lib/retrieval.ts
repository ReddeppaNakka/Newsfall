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

const STOPWORDS = new Set(["the", "a", "an", "is", "are", "was", "were", "be", "of", "in", "on", "at", "to", "for", "and", "or",
  "what", "which", "who", "how", "why", "when", "does", "do", "did", "has", "have", "with", "about", "this", "that", "recent",
  "recently", "latest", "new", "biggest", "major", "between", "its", "their", "there", "into"]);

/** Significant query terms for lexical matching (drops stopwords, keeps ≥2-char tokens). */
export function queryTerms(q: string): string[] {
  const toks = (q.toLowerCase().match(/[a-z0-9][a-z0-9.+-]*/g) ?? []) as string[];
  return [...new Set(toks.filter((t) => t.length >= 2 && !STOPWORDS.has(t)))].slice(0, 8);
}

function termScore(text: string, terms: string[]): number {
  const hay = text.toLowerCase();
  const hits = terms.filter((t) => hay.includes(t)).length;
  return terms.length ? hits / terms.length : 0;
}

/** Per-term ilike OR across the main text columns, ranked by fraction of terms matched. */
async function lexical(q: string): Promise<SearchHit[]> {
  const terms = queryTerms(q);
  if (!terms.length) return [];
  const safe = (t: string) => t.replace(/[%_,()]/g, "");
  const orFor = (cols: string[]) => cols.flatMap((c) => terms.map((t) => `${c}.ilike.%${safe(t)}%`)).join(",");
  const out: SearchHit[] = [];
  try {
    const [ev, en, ar] = await Promise.all([
      supabase.from("events").select("id,slug,title,why_it_matters,summary,importance_score,confidence_score,event_type").or(orFor(["title", "summary"])).order("importance_score", { ascending: false }).limit(30),
      supabase.from("entities").select("id,slug,name,entity_type,description,influence_score,aliases").or(orFor(["name"])).order("influence_score", { ascending: false }).limit(20),
      supabase.from("articles_public").select("id,title,url,summary,source_name,published_at").or(orFor(["title"])).order("published_at", { ascending: false }).limit(30),
    ]);
    for (const e of ev.data ?? []) {
      const s = termScore(`${e.title} ${e.summary ?? ""}`, terms);
      if (s > 0) out.push({ kind: "event", id: e.id, title: e.title, href: `/events/${e.slug}`, snippet: e.why_it_matters ?? e.summary, score: 0.3 + 0.5 * s, meta: { importance: e.importance_score, confidence: e.confidence_score, slug: e.slug, type: e.event_type } });
    }
    for (const e of en.data ?? []) {
      const s = termScore(`${e.name} ${(e.aliases ?? []).join(" ")}`, terms);
      if (s > 0) out.push({ kind: "entity", id: e.id, title: e.name, href: `/entities/${e.slug}`, snippet: e.description, score: 0.3 + 0.5 * s, meta: { type: e.entity_type, influence: e.influence_score } });
    }
    for (const a of ar.data ?? []) {
      const s = termScore(a.title, terms);
      if (s > 0) out.push({ kind: "article", id: a.id, title: a.title, href: a.url, snippet: a.summary, score: 0.25 + 0.5 * s, meta: { source: a.source_name, published_at: a.published_at } });
    }
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
