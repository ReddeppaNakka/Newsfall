/**
 * Generates (and caches) a structured "brief" for a technology — the rich detail
 * shown in the topic popup.
 *
 * When a Tavily key is configured, the brief is written from REAL web search results
 * (with source links to verify), so it's genuine and current. Without a key it falls
 * back to the model's own knowledge (clearly less reliable for new/obscure tools).
 *
 * Cached for 24h per slug+version via unstable_cache; failures are never cached.
 */
import "server-only";
import { unstable_cache } from "next/cache";
import { llmJson } from "./llm";
import { webSearch } from "./search";
import type { Technology, Update } from "./types";

export interface Source {
  title: string;
  url: string;
}

export interface Brief {
  overview: string;
  created_by: string;
  released: string;
  pricing: string;
  features: string[];
  advantages: string[];
  disadvantages: string[];
  use_cases: string[];
  alternatives: string[];
  value: string;
  grounded: boolean; // true = written from web sources
  sources: Source[];
  images: string[]; // relevant image URLs for the deep-dive gallery
}

/** Extra, deeper sections shown ONLY on the full "/topic" deep-dive page. */
export interface Faq {
  q: string;
  a: string;
}
export interface DeepBrief extends Brief {
  deep_overview: string; // 2-3 detailed paragraphs
  how_it_works: string[];
  key_concepts: string[]; // "Term — explanation"
  how_to_get_started: string[];
  comparison: string; // nuanced paragraph vs alternatives
  who_is_it_for: string[];
  faqs: Faq[];
}

const asStr = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const asList = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => (x as string).trim())
    : [];
const asFaqs = (v: unknown): Faq[] =>
  Array.isArray(v)
    ? v
        .map((x) => {
          const o = (x ?? {}) as Record<string, unknown>;
          return { q: asStr(o.q), a: asStr(o.a) };
        })
        .filter((f) => f.q && f.a)
    : [];

async function generate(tech: Technology, updatesContext: string): Promise<Brief | null> {
  // 1) Search the web for real, current facts about this tool.
  const query =
    `${tech.name}${tech.tagline ? ` (${tech.tagline})` : ""} — what it is, ` +
    `which company or person created it, key features, pricing, alternatives, pros and cons`;
  const search = await webSearch(query);
  const grounded = !!(search && (search.answer || search.results.length));
  const sources: Source[] = (search?.results ?? [])
    .slice(0, 5)
    .map((r) => ({ title: r.title, url: r.url }));
  const images: string[] = (search?.images ?? []).slice(0, 6);

  // Keep the source context compact so it fits comfortably in the free-tier
  // tokens-per-minute budget (and returns faster). Truncate each result, cap total.
  const sourceText = grounded
    ? [search!.answer, ...search!.results.slice(0, 5).map((r) => `[${r.title}] ${r.content.slice(0, 400)}`)]
        .filter(Boolean)
        .join("\n\n")
        .slice(0, 2800)
    : "";

  // 2) Ask the LLM to write the structured brief.
  const schema = `{
  "overview": "<2-4 sentence plain-English explanation>",
  "created_by": "<the company or person that created it>",
  "released": "<when it launched / latest version + rough date>",
  "pricing": "<pricing model: free / open-source / paid tiers / etc.>",
  "features": ["<key feature>", "..."],
  "advantages": ["<advantage, incl. improvements over previous versions or rivals>", "..."],
  "disadvantages": ["<real limitation or drawback>", "..."],
  "use_cases": ["<concrete scenario a developer would use it for>", "..."],
  "alternatives": ["<competing/similar tool>", "..."],
  "value": "<1-2 sentences on why it matters>"
}`;

  const prompt = grounded
    ? `You are a precise technology analyst writing a factual briefing for an entry-level engineer.
Using ONLY the web sources provided below, return STRICT JSON:
${schema}

Rules:
- Base EVERY statement on the sources. Do not use outside knowledge and never invent facts, version numbers, dates, prices, or company names.
- If the sources genuinely don't cover a field, use "Not publicly documented" for text fields and [] for lists. Do not guess.
- 3-6 items per list; short, clear, beginner-friendly.

Tool: ${tech.name} (category: ${tech.category})

WEB SOURCES:
${sourceText}

Return ONLY the JSON object.`
    : `You are a technology analyst. Based on what you reliably know, return STRICT JSON:
${schema}

Rules:
- Be accurate. For anything you are unsure about (especially a niche or very new tool), use "Not publicly documented" / [] rather than inventing specifics. Never fabricate versions, dates, prices, or company names.
- 3-6 items per list; beginner-friendly.

Tool name: ${tech.name}
Category: ${tech.category}
${tech.current_version ? `Version: ${tech.current_version}` : ""}
${tech.tagline ? `Tagline: ${tech.tagline}` : ""}
${tech.description ? `Description: ${tech.description}` : ""}
${updatesContext ? `Recent updates:\n${updatesContext}` : ""}

Return ONLY the JSON object.`;

  const data = await llmJson(prompt);
  if (!data) return null;

  const brief: Brief = {
    overview: asStr(data.overview),
    created_by: asStr(data.created_by),
    released: asStr(data.released),
    pricing: asStr(data.pricing),
    features: asList(data.features),
    advantages: asList(data.advantages),
    disadvantages: asList(data.disadvantages),
    use_cases: asList(data.use_cases),
    alternatives: asList(data.alternatives),
    value: asStr(data.value),
    grounded,
    sources,
    images,
  };
  if (!brief.overview && !brief.features.length) return null;
  return brief;
}

export async function getBrief(tech: Technology, updates: Update[]): Promise<Brief | null> {
  const context = updates
    .slice(0, 6)
    .map((u) => `- ${u.title}${u.summary ? `: ${u.summary}` : ""}`)
    .join("\n");

  // Key by slug + version so a new release regenerates. Throw on failure so a transient
  // rate limit / search hiccup isn't cached for 24h — the next open just retries.
  const cached = unstable_cache(
    async () => {
      const b = await generate(tech, context);
      if (!b) throw new Error("brief-unavailable");
      return b;
    },
    ["tech-brief-v3", tech.slug, tech.current_version ?? "na"],
    { revalidate: 86400 },
  );
  try {
    return await cached();
  } catch {
    return null;
  }
}

// --------------------------------------------------------------------------- //
// DEEP brief — the richer version shown only on the full /topic deep-dive page.
// A deeper web search (advanced, more sources) + a longer, more detailed LLM
// analysis with extra sections the compact popup brief doesn't have.
// --------------------------------------------------------------------------- //
async function generateDeep(tech: Technology, updatesContext: string): Promise<DeepBrief | null> {
  const query =
    `${tech.name}${tech.tagline ? ` (${tech.tagline})` : ""} — detailed explanation, how it works, ` +
    `key concepts, features, pricing details, how to get started, comparison with alternatives, pros and cons`;
  const search = await webSearch(query, { depth: "advanced", maxResults: 8 });
  const grounded = !!(search && (search.answer || search.results.length));
  const sources: Source[] = (search?.results ?? []).slice(0, 6).map((r) => ({ title: r.title, url: r.url }));
  const images: string[] = (search?.images ?? []).slice(0, 6);

  // Deeper page → afford a larger source budget than the compact popup brief.
  const sourceText = grounded
    ? [search!.answer, ...search!.results.slice(0, 6).map((r) => `[${r.title}] ${r.content.slice(0, 700)}`)]
        .filter(Boolean)
        .join("\n\n")
        .slice(0, 5000)
    : "";

  const schema = `{
  "overview": "<3-5 sentence plain-English summary>",
  "deep_overview": "<2-3 detailed paragraphs: what it is, the problem it solves, and the bigger picture>",
  "how_it_works": ["<step or mechanism explaining how it works under the hood>", "..."],
  "created_by": "<company or person>",
  "released": "<launch / latest version + date>",
  "pricing": "<detailed pricing incl. tiers and specific numbers if available>",
  "features": ["<6-10 key features>", "..."],
  "advantages": ["<4-8 advantages>", "..."],
  "disadvantages": ["<3-6 real limitations>", "..."],
  "use_cases": ["<5-8 concrete real-world scenarios>", "..."],
  "key_concepts": ["<Term — one-line explanation of a concept a learner must know>", "..."],
  "how_to_get_started": ["<concrete first step to start using/learning it>", "..."],
  "alternatives": ["<competing/similar tool>", "..."],
  "comparison": "<a nuanced paragraph comparing it to its main alternatives — when to pick this vs. them>",
  "who_is_it_for": ["<ideal user / persona / role>", "..."],
  "faqs": [{"q": "<common question a beginner would ask>", "a": "<clear, concise answer>"}],
  "value": "<2-3 sentences on why it matters>"
}`;

  const prompt = grounded
    ? `You are a precise technology analyst writing an IN-DEPTH briefing for an entry-level engineer who wants to truly understand this tool. Be thorough and specific — this is a detailed page, not a summary.
Using ONLY the web sources provided below, return STRICT JSON:
${schema}

Rules:
- Base EVERY statement on the sources. Never invent facts, versions, dates, prices, or names.
- Be detailed and concrete. Prefer specifics (numbers, examples) over vague statements.
- If the sources genuinely don't cover a field, use "Not publicly documented" for text and [] for lists. Do not guess.
- Provide 4-8 FAQs and the requested list sizes; keep each item clear and beginner-friendly.

Tool: ${tech.name} (category: ${tech.category})

WEB SOURCES:
${sourceText}

Return ONLY the JSON object.`
    : `You are a technology analyst writing an IN-DEPTH, detailed briefing. Based on what you reliably know, return STRICT JSON:
${schema}

Rules:
- Be accurate and detailed. For anything uncertain (niche/new tool), use "Not publicly documented" / [] rather than inventing. Never fabricate versions, dates, prices, or names.
- Provide 4-8 FAQs and the requested list sizes; beginner-friendly.

Tool name: ${tech.name}
Category: ${tech.category}
${tech.current_version ? `Version: ${tech.current_version}` : ""}
${tech.tagline ? `Tagline: ${tech.tagline}` : ""}
${tech.description ? `Description: ${tech.description}` : ""}
${updatesContext ? `Recent updates:\n${updatesContext}` : ""}

Return ONLY the JSON object.`;

  const data = await llmJson(prompt, { maxTokens: 2200, timeoutMs: 25000 });
  if (!data) return null;

  const brief: DeepBrief = {
    overview: asStr(data.overview),
    deep_overview: asStr(data.deep_overview),
    how_it_works: asList(data.how_it_works),
    created_by: asStr(data.created_by),
    released: asStr(data.released),
    pricing: asStr(data.pricing),
    features: asList(data.features),
    advantages: asList(data.advantages),
    disadvantages: asList(data.disadvantages),
    use_cases: asList(data.use_cases),
    key_concepts: asList(data.key_concepts),
    how_to_get_started: asList(data.how_to_get_started),
    alternatives: asList(data.alternatives),
    comparison: asStr(data.comparison),
    who_is_it_for: asList(data.who_is_it_for),
    faqs: asFaqs(data.faqs),
    value: asStr(data.value),
    grounded,
    sources,
    images,
  };
  if (!brief.overview && !brief.deep_overview && !brief.features.length) return null;
  return brief;
}

export async function getDeepBrief(tech: Technology, updates: Update[]): Promise<DeepBrief | null> {
  const context = updates
    .slice(0, 6)
    .map((u) => `- ${u.title}${u.summary ? `: ${u.summary}` : ""}`)
    .join("\n");

  const cached = unstable_cache(
    async () => {
      const b = await generateDeep(tech, context);
      if (!b) throw new Error("deep-brief-unavailable");
      return b;
    },
    ["tech-deepbrief-v1", tech.slug, tech.current_version ?? "na"],
    { revalidate: 86400 },
  );
  try {
    return await cached();
  } catch {
    return null;
  }
}
