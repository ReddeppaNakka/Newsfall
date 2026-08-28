"use client";

import Link from "next/link";
import { useState } from "react";
import type { AskResponse } from "@/lib/intelligence-types";

const EXAMPLES = [
  "What are NVIDIA's biggest competitive threats?",
  "Which AI companies received major funding recently?",
  "What are the biggest developments in AI infrastructure this week?",
  "Explain the relationship between Microsoft and OpenAI.",
];

/**
 * Ask Newsfall — a question box that reasons ONLY over Newsfall's evidence base.
 * The answer is rendered as: answer → key evidence → related events → related
 * entities → confidence → uncertainties → what to watch. Never a free chat.
 */
export default function AskNewsfall({ initialQuestion = "" }: { initialQuestion?: string }) {
  const [q, setQ] = useState(initialQuestion);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<AskResponse | null>(null);

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    setRes(null);
    try {
      const r = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || `Request failed (${r.status})`);
      setRes((await r.json()) as AskResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
        className="glass flex flex-col gap-2 rounded-2xl p-2 sm:flex-row sm:items-center"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask about companies, people, technologies, or events…"
          className="min-h-[44px] flex-1 bg-transparent px-3 text-[15px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
          aria-label="Question"
        />
        <button
          type="submit"
          disabled={loading || !q.trim()}
          className="min-h-[44px] rounded-xl bg-zinc-100 px-5 text-sm font-semibold text-zinc-900 transition hover:bg-white disabled:opacity-40"
        >
          {loading ? "Analysing…" : "Ask"}
        </button>
      </form>

      {!res && !loading && (
        <div className="mt-4 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => {
                setQ(ex);
                ask(ex);
              }}
              className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-white/25 hover:text-zinc-200"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="mt-6 space-y-3" aria-live="polite">
          <div className="h-4 w-2/3 animate-pulse rounded bg-white/10" />
          <div className="h-4 w-full animate-pulse rounded bg-white/10" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-white/10" />
          <p className="text-xs text-zinc-600">Retrieving evidence, events and entities from the Newsfall knowledge base…</p>
        </div>
      )}

      {error && <p className="mt-6 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p>}

      {res && (
        <div className="mt-8 space-y-8">
          <section>
            <Heading>Answer</Heading>
            <div className="text-[15px] leading-relaxed text-zinc-200 whitespace-pre-line">{res.answer}</div>
            <div className="mt-3 flex items-center gap-3 text-xs">
              <span className="text-zinc-500">Confidence</span>
              <span className={res.confidence === "HIGH" ? "text-emerald-300" : res.confidence === "MEDIUM" ? "text-amber-300" : "text-zinc-400"}>
                {res.confidence}
              </span>
              {!res.grounded && <span className="text-zinc-500">· limited evidence in the knowledge base — treat with caution</span>}
            </div>
          </section>

          {res.key_evidence.length > 0 && (
            <section>
              <Heading>Key evidence</Heading>
              <ol className="space-y-2">
                {res.key_evidence.map((h) => (
                  <li key={`${h.kind}-${h.id}`} className="text-sm">
                    <a href={h.href} target={h.kind === "article" ? "_blank" : undefined} rel="noreferrer" className="text-zinc-100 hover:underline underline-offset-4">
                      {h.title}
                    </a>
                    {h.meta?.source ? <span className="text-zinc-500"> — {String(h.meta.source)}</span> : null}
                    {h.snippet && <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{h.snippet}</p>}
                  </li>
                ))}
              </ol>
            </section>
          )}

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {res.related_events.length > 0 && (
              <section>
                <Heading>Related events</Heading>
                <ul className="space-y-1.5">
                  {res.related_events.map((h) => (
                    <li key={h.id}>
                      <Link href={h.href} className="text-sm text-zinc-200 hover:underline underline-offset-4">{h.title}</Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {res.related_entities.length > 0 && (
              <section>
                <Heading>Related entities</Heading>
                <div className="flex flex-wrap gap-1.5">
                  {res.related_entities.map((h) => (
                    <Link key={h.id} href={h.href} className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-zinc-200 hover:border-white/25">
                      {h.title}
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </div>

          {res.uncertainties.length > 0 && (
            <section>
              <Heading>Uncertainties &amp; counterpoints</Heading>
              <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-400">
                {res.uncertainties.map((u, i) => <li key={i}>{u}</li>)}
              </ul>
            </section>
          )}

          {res.what_to_watch.length > 0 && (
            <section>
              <Heading>What to watch next</Heading>
              <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-300">
                {res.what_to_watch.map((u, i) => <li key={i}>{u}</li>)}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">{children}</h2>;
}
