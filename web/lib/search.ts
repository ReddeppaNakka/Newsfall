/**
 * Server-only web search via Tavily (https://tavily.com) — a search API built for
 * grounding LLM answers. Returns a short synthesized answer plus source snippets so
 * the brief can be written from REAL, current, citable information instead of the
 * model's memory. Returns null when no key is set (feature degrades gracefully).
 */
import "server-only";

export interface SearchResult {
  title: string;
  url: string;
  content: string;
}
export interface SearchResponse {
  answer: string;
  results: SearchResult[];
  images: string[]; // relevant image URLs (Tavily include_images)
}

export async function webSearch(
  query: string,
  opts?: { depth?: "basic" | "advanced"; maxResults?: number },
): Promise<SearchResponse | null> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return null;
  try {
    const resp = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        api_key: key, // also accepted in body (older API) — harmless with the header
        query,
        search_depth: opts?.depth ?? "basic",
        max_results: opts?.maxResults ?? 5,
        include_answer: true,
        include_images: true, // relevant images for the deep-dive gallery
      }),
      signal: AbortSignal.timeout(opts?.depth === "advanced" ? 15000 : 10000),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const results: SearchResult[] = Array.isArray(data?.results)
      ? data.results
          .map((r: Record<string, unknown>) => ({
            title: String(r.title ?? ""),
            url: String(r.url ?? ""),
            content: String(r.content ?? ""),
          }))
          .filter((r: SearchResult) => r.url)
      : [];
    // Tavily returns `images` as an array of URL strings (or {url,description} objects
    // if descriptions are enabled). Normalise to https URLs and dedupe.
    const images: string[] = Array.isArray(data?.images)
      ? Array.from(
          new Set(
            data.images
              .map((im: unknown) =>
                typeof im === "string" ? im : String((im as Record<string, unknown>)?.url ?? ""),
              )
              .filter((u: string) => u.startsWith("http")),
          ),
        )
      : [];
    return { answer: typeof data?.answer === "string" ? data.answer : "", results, images };
  } catch {
    return null;
  }
}
