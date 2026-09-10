/**
 * Server-only LLM helper used by the topic brief / deep-dive (lib/brief.ts).
 *
 * Thin wrapper over the unified gateway in lib/ai.ts, so the brief uses the same
 * provider as Ask Newsfall: OpenRouter (fast model) when OPENROUTER_API_KEY is set,
 * otherwise the legacy OpenAI-compatible LLM_* (Groq) config. Previously this file
 * read only LLM_API_KEY, so with an OpenRouter-only setup every brief came back null.
 *
 * Never import this into a client component — keys must never reach the browser.
 */
import "server-only";
import { chatJson } from "./ai";

const SYSTEM =
  "You are a precise technology analyst. Reply with a single JSON object that matches the requested shape exactly — no prose, no markdown fences.";

export async function llmJson(
  prompt: string,
  opts?: { maxTokens?: number; timeoutMs?: number },
): Promise<Record<string, unknown> | null> {
  // Returns null when no provider is configured or the call fails — callers degrade gracefully.
  return chatJson("fast", SYSTEM, prompt, {
    maxTokens: opts?.maxTokens ?? 800,
    timeoutMs: opts?.timeoutMs ?? 15000,
    temperature: 0.3,
  });
}
