/**
 * Server-only LLM helper. Calls an OpenAI-compatible chat endpoint (Groq by default)
 * and parses a strict-JSON reply. Never import this into a client component —
 * LLM_API_KEY must never reach the browser (no NEXT_PUBLIC prefix).
 */
import "server-only";

const LLM_API_KEY = process.env.LLM_API_KEY;
const LLM_BASE_URL = process.env.LLM_BASE_URL || "https://api.groq.com/openai/v1";
const LLM_MODEL = process.env.LLM_MODEL || "llama-3.3-70b-versatile";

export async function llmJson(
  prompt: string,
  opts?: { maxTokens?: number; timeoutMs?: number },
): Promise<Record<string, unknown> | null> {
  if (!LLM_API_KEY) return null; // no key configured (e.g. preview mode) → caller falls back

  // Retry on rate limits (429) — free LLM tiers cap requests/minute. Keep backoff short
  // so a user-facing popup never spins for long; per-request timeout prevents hangs.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await fetch(`${LLM_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${LLM_API_KEY}`,
        },
        body: JSON.stringify({
          model: LLM_MODEL,
          temperature: 0.3,
          max_tokens: opts?.maxTokens ?? 800,
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: prompt }],
        }),
        signal: AbortSignal.timeout(opts?.timeoutMs ?? 15000),
      });

      if (resp.status === 429) {
        const wait = Number(resp.headers.get("retry-after")) || 2 ** attempt;
        await new Promise((r) => setTimeout(r, Math.min(wait, 4) * 1000));
        continue;
      }
      if (!resp.ok) return null;

      const data = await resp.json();
      const raw = data?.choices?.[0]?.message?.content;
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null; // timeout or network error — caller falls back gracefully
    }
  }
  return null; // exhausted retries
}
