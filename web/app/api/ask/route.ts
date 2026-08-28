import { NextResponse } from "next/server";
import { chatJson } from "@/lib/ai";
import { search } from "@/lib/retrieval";
import type { AskResponse, SearchHit } from "@/lib/intelligence-types";

export const maxDuration = 60;

/**
 * POST /api/ask { question }
 *
 * Retrieval-grounded answer over Newsfall's own knowledge base (Part 21):
 *   1. retrieve events / articles / entities (vector + lexical)
 *   2. build a numbered evidence context
 *   3. ask the reasoning model for a structured answer that cites evidence ids
 *   4. map citations back to hits so the UI can link them
 * The model is told to acknowledge uncertainty and never to present speculation as fact.
 */
export async function POST(req: Request) {
  let question = "";
  try {
    question = String((await req.json())?.question ?? "").trim();
  } catch {
    /* fallthrough */
  }
  if (question.length < 3) return NextResponse.json({ error: "question is required" }, { status: 400 });
  if (question.length > 500) return NextResponse.json({ error: "question too long" }, { status: 400 });

  const hits = await search(question, { limit: 24 });
  const events = hits.filter((h) => h.kind === "event").slice(0, 8);
  const articles = hits.filter((h) => h.kind === "article").slice(0, 8);
  const entities = hits.filter((h) => h.kind === "entity").slice(0, 6);
  const grounded = events.length + articles.length >= 2;

  const ids = new Map<string, SearchHit>();
  const ctx: string[] = [];
  events.forEach((e, i) => {
    const id = `E${i + 1}`;
    ids.set(id, e);
    ctx.push(`[${id}] EVENT: ${e.title} (importance ${Number(e.meta?.importance ?? 0).toFixed(0)}/100, confidence ${Math.round(Number(e.meta?.confidence ?? 0) * 100)}%)\n${e.snippet ?? ""}`);
  });
  articles.forEach((a, i) => {
    const id = `A${i + 1}`;
    ids.set(id, a);
    ctx.push(`[${id}] ARTICLE: ${a.title}${a.meta?.source ? ` — ${a.meta.source}` : ""}${a.meta?.published_at ? ` (${String(a.meta.published_at).slice(0, 10)})` : ""}\n${a.snippet ?? ""}`);
  });
  entities.forEach((e, i) => {
    const id = `N${i + 1}`;
    ids.set(id, e);
    ctx.push(`[${id}] ENTITY: ${e.title} (${e.meta?.type ?? ""}, influence ${Number(e.meta?.influence ?? 0).toFixed(0)})\n${e.snippet ?? ""}`);
  });

  const system =
    "You are Newsfall, an evidence-driven technology-industry intelligence analyst. Answer ONLY from the numbered " +
    "evidence provided. Cite evidence ids (E1, A2, N3) inline in the answer. If the evidence is thin or conflicting, say so " +
    "explicitly and lower the confidence. Never present rumor, prediction, or speculation as fact; label it. Do not use outside " +
    "knowledge to assert facts — you may use it only to frame uncertainty. Be concise, specific, and calm.";
  const user =
    `QUESTION: ${question}\n\nEVIDENCE:\n${ctx.join("\n\n") || "(no evidence found in the knowledge base)"}\n\n` +
    "Return JSON: {\"answer\": string (3-8 sentences with inline citations), \"confidence\": \"LOW\"|\"MEDIUM\"|\"HIGH\", " +
    "\"key_evidence\": [evidence ids most relied on], \"uncertainties\": [string], \"what_to_watch\": [string]}";

  const data = await chatJson("reasoning", system, user, { maxTokens: 1000, timeoutMs: 45000 });
  if (!data) {
    return NextResponse.json({ error: "The analyst is unavailable right now (no AI provider configured or request failed)." }, { status: 503 });
  }

  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => String(x).trim()) : []);
  const conf = ["LOW", "MEDIUM", "HIGH"].includes(String(data.confidence)) ? (data.confidence as AskResponse["confidence"]) : "LOW";
  const cited = list(data.key_evidence).map((id) => ids.get(id.toUpperCase())).filter((h): h is SearchHit => !!h);
  const keyEvidence = cited.length ? cited : [...events.slice(0, 3), ...articles.slice(0, 3)];

  const body: AskResponse = {
    answer: str(data.answer) || "I could not find enough evidence in the Newsfall knowledge base to answer this.",
    confidence: grounded ? conf : "LOW",
    key_evidence: keyEvidence.filter((h) => h.kind !== "entity"),
    related_events: events,
    related_entities: entities,
    uncertainties: list(data.uncertainties),
    what_to_watch: list(data.what_to_watch),
    grounded,
  };
  return NextResponse.json(body);
}
