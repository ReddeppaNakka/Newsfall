/**
 * Server-only AI gateway for the web app (chat + embeddings).
 *
 * Mirrors automation/newsfall/llm.py: OpenRouter when OPENROUTER_API_KEY is set,
 * otherwise the legacy OpenAI-compatible LLM_* config (Groq). Model names come only
 * from env. Never import from a client component — no NEXT_PUBLIC prefix anywhere.
 */
import "server-only";

const OPENROUTER = "https://openrouter.ai/api/v1";

export interface AIConfig {
  apiKey: string | undefined;
  baseUrl: string;
  provider: "openrouter" | "openai-compatible";
  fastModel: string;
  reasoningModel: string;
  embeddingModel: string;
  embeddingBaseUrl: string;
  embeddingApiKey: string | undefined;
  embeddingDim: number;
}

export function aiConfig(): AIConfig {
  const or = process.env.OPENROUTER_API_KEY;
  const legacyKey = process.env.LLM_API_KEY;
  const legacyBase = process.env.LLM_BASE_URL || "https://api.groq.com/openai/v1";
  const legacyModel = process.env.LLM_MODEL || "openai/gpt-oss-120b";
  const provider = or ? "openrouter" : "openai-compatible";
  const apiKey = or || legacyKey;
  const baseUrl = or ? OPENROUTER : legacyBase;
  return {
    apiKey,
    baseUrl,
    provider,
    fastModel: process.env.LLM_FAST_MODEL || (or ? "google/gemini-2.5-flash-lite" : legacyModel),
    reasoningModel: process.env.LLM_REASONING_MODEL || (or ? "google/gemini-2.5-flash" : legacyModel),
    embeddingModel: process.env.EMBEDDING_MODEL || "openai/text-embedding-3-small",
    embeddingBaseUrl: process.env.EMBEDDING_BASE_URL || baseUrl,
    embeddingApiKey: process.env.EMBEDDING_API_KEY || apiKey,
    embeddingDim: Number(process.env.EMBEDDING_DIM || 1536),
  };
}

function parseJson(raw: string): Record<string, unknown> | null {
  let s = raw.trim();
  if (s.startsWith("```")) s = s.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" ? v : null;
  } catch {
    const a = s.indexOf("{"), b = s.lastIndexOf("}");
    if (a === -1 || b <= a) return null;
    try {
      return JSON.parse(s.slice(a, b + 1));
    } catch {
      return null;
    }
  }
}

/** JSON-mode chat completion. Returns null on any failure (callers degrade gracefully). */
export async function chatJson(
  role: "fast" | "reasoning",
  system: string,
  user: string,
  opts?: { maxTokens?: number; timeoutMs?: number; temperature?: number },
): Promise<Record<string, unknown> | null> {
  const cfg = aiConfig();
  if (!cfg.apiKey) return null;
  const model = role === "fast" ? cfg.fastModel : cfg.reasoningModel;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${cfg.apiKey}`,
  };
  if (cfg.provider === "openrouter") {
    headers["HTTP-Referer"] = "https://github.com/ReddeppaNakka/Newsfall";
    headers["X-Title"] = "Newsfall Intelligence";
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          temperature: opts?.temperature ?? 0.2,
          max_tokens: opts?.maxTokens ?? 1200,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
        signal: AbortSignal.timeout(opts?.timeoutMs ?? 30000),
      });
      if (resp.status === 429) {
        const wait = Number(resp.headers.get("retry-after")) || 2 ** attempt;
        await new Promise((r) => setTimeout(r, Math.min(wait, 5) * 1000));
        continue;
      }
      if (!resp.ok) return null;
      const data = await resp.json();
      const raw = data?.choices?.[0]?.message?.content;
      return typeof raw === "string" ? parseJson(raw) : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Embed a query. Returns the vector + model tag so callers only compare like with like.
 * Falls back to the same feature-hashing scheme as the Python pipeline (`hash-v1`) so
 * search still works against hashed rows when no embedding API is configured.
 */
export async function embedQuery(text: string): Promise<{ vector: number[]; model: string }> {
  const cfg = aiConfig();
  if (cfg.embeddingApiKey) {
    try {
      const resp = await fetch(`${cfg.embeddingBaseUrl}/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.embeddingApiKey}` },
        body: JSON.stringify({ model: cfg.embeddingModel, input: text.slice(0, 8000) }),
        signal: AbortSignal.timeout(15000),
      });
      if (resp.ok) {
        const data = await resp.json();
        const vec = data?.data?.[0]?.embedding;
        if (Array.isArray(vec) && vec.length === cfg.embeddingDim) return { vector: vec, model: cfg.embeddingModel };
      }
    } catch {
      /* fall through to hashed */
    }
  }
  return { vector: hashedEmbedding(text, cfg.embeddingDim), model: "hash-v1" };
}

/** Port of newsfall/text.py::hashed_embedding (md5 feature hashing, unigrams + bigrams). */
export function hashedEmbedding(text: string, dim: number): number[] {
  const toks = (text.toLowerCase().match(/[a-z0-9]+/g) ?? []) as string[];
  const feats = [...toks, ...toks.slice(0, -1).map((t, i) => `${t}_${toks[i + 1]}`)];
  const vec = new Array<number>(dim).fill(0);
  for (const f of feats) {
    const h = md5Hex(f);
    const big = BigInt("0x" + h);
    const idx = Number(big % BigInt(dim));
    const sign = ((big >> BigInt(64)) & BigInt(1)) === BigInt(1) ? 1 : -1;
    vec[idx] += sign;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return norm ? vec.map((v) => v / norm) : vec;
}

function md5Hex(input: string): string {
  // Node runtime (route handlers / server components) — crypto is available.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHash } = require("crypto") as typeof import("crypto");
  return createHash("md5").update(input, "utf8").digest("hex");
}
