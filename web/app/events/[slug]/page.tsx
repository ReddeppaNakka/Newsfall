import Link from "next/link";
import { notFound } from "next/navigation";
import { getEventArticles, getEventBySlug, getEventClaims, getEventWatchItems, getRelatedEvents } from "@/lib/intelligence";
import {
  CLAIM_STATUS_CLASS, CLAIM_STATUS_LABEL, CLAIM_TYPE_LABEL, EVENT_TYPE_LABEL, STANCE_CLASS, WATCH_KIND_LABEL,
  formatDate, humanize, relativeTime,
} from "@/lib/format";
import EntityChip from "@/components/intel/EntityChip";
import EventCard from "@/components/intel/EventCard";
import { ConfidenceMeter, ImportanceMeter, SectionTitle, Tag } from "@/components/intel/Scores";

export const revalidate = 60;

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params) {
  const { slug } = await params;
  const ev = await getEventBySlug(slug);
  return { title: ev ? `${ev.title} — Newsfall` : "Event — Newsfall", description: ev?.why_it_matters ?? ev?.summary ?? undefined };
}

/**
 * /events/[slug] — one real-world event: what happened, why it matters, who is involved,
 * the evidence (with source credibility and stance), contradictions, related events and
 * what to watch. Every AI statement on this page is traceable to the articles listed.
 */
export default async function EventPage({ params }: Params) {
  const { slug } = await params;
  const ev = await getEventBySlug(slug);
  if (!ev) notFound();

  const [articles, claims, related, watch] = await Promise.all([
    getEventArticles(ev.id), getEventClaims(ev.id), getRelatedEvents(ev), getEventWatchItems(ev.id),
  ]);
  const contradictions = claims.filter((c) => c.status === "DISPUTED" || c.status === "FALSE" || c.evidence.some((e) => e.stance === "CONTRADICTS"));
  const timeline = [...articles].filter((a) => a.published_at).sort((a, b) => a.published_at!.localeCompare(b.published_at!));
  const bd = ev.score_breakdown ?? {};

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <Link href="/intelligence" className="-my-1 inline-flex min-h-[40px] items-center text-sm text-zinc-500 transition hover:text-zinc-300">
        ← Intelligence feed
      </Link>

      {/* Header */}
      <header className="mt-5 sm:mt-6">
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
          <span className="font-medium uppercase tracking-wide text-zinc-400">{EVENT_TYPE_LABEL[ev.event_type]}</span>
          <span>·</span>
          <span>{ev.occurred_at ? formatDate(ev.occurred_at) : `first seen ${formatDate(ev.first_seen_at)}`}</span>
          <span>·</span>
          <span>updated {relativeTime(ev.last_updated_at)}</span>
          <Tag tone={ev.status === "CONTRADICTED" ? "warn" : "neutral"}>{humanize(ev.status)}</Tag>
          {ev.primary_source_confirmed && <Tag tone="good">Primary source confirmed</Tag>}
        </div>
        <h1 className="mt-3 text-2xl font-bold leading-tight tracking-tight text-white sm:text-4xl">{ev.title}</h1>
        {ev.summary && <p className="mt-4 text-[15px] leading-relaxed text-zinc-300 sm:text-base">{ev.summary}</p>}

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Importance"><ImportanceMeter score={Number(ev.importance_score)} /></Stat>
          <Stat label="Confidence"><ConfidenceMeter value={Number(ev.confidence_score)} /></Stat>
          <Stat label="Independent sources"><span className="font-mono text-sm text-zinc-100">{ev.independent_source_count}</span><span className="ml-2 text-xs text-zinc-500">of {ev.article_count} articles</span></Stat>
          <Stat label="Evidence quality">
            <span className="text-sm text-zinc-100">{ev.primary_source_confirmed ? "Primary" : ev.independent_source_count >= 2 ? "Corroborated" : "Single source"}</span>
          </Stat>
        </div>
        {Object.keys(bd).length > 0 && (
          <details className="mt-3 text-xs text-zinc-500">
            <summary className="cursor-pointer hover:text-zinc-300">How the importance score is computed</summary>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono">
              {(["magnitude", "entity_influence", "industry_impact", "cross_source", "credibility", "novelty", "recency"] as const).map((k) =>
                bd[k] != null ? <span key={k}>{k}={Number(bd[k]).toFixed(2)}</span> : null,
              )}
            </div>
            <p className="mt-1">Deterministic signals (sources, credibility, novelty, entity influence) combined with bounded AI estimates of magnitude and industry impact.</p>
          </details>
        )}
      </header>

      {/* Entities */}
      {ev.entities.length > 0 && (
        <section className="mt-8">
          <SectionTitle>Key entities</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {ev.entities.map((e) => <EntityChip key={e.id} entity={e} role={e.role} />)}
          </div>
        </section>
      )}

      {/* Why it matters / impact */}
      {(ev.why_it_matters || ev.industry_impact) && (
        <section className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
          {ev.why_it_matters && (
            <div className="glass rounded-2xl p-5">
              <SectionTitle>Why it matters</SectionTitle>
              <p className="text-sm leading-relaxed text-zinc-200">{ev.why_it_matters}</p>
            </div>
          )}
          {ev.industry_impact && (
            <div className="glass rounded-2xl p-5">
              <SectionTitle>Industry impact</SectionTitle>
              <p className="text-sm leading-relaxed text-zinc-200">{ev.industry_impact}</p>
            </div>
          )}
        </section>
      )}
      {ev.intelligence_summary && (
        <p className="mt-4 text-xs leading-relaxed text-zinc-500"><span className="font-semibold text-zinc-400">Uncertainties: </span>{ev.intelligence_summary}</p>
      )}

      {/* Claims + evidence */}
      {claims.length > 0 && (
        <section className="mt-10">
          <SectionTitle hint={`${claims.length} claims`}>Claims &amp; evidence</SectionTitle>
          <ul className="space-y-3">
            {claims.map((c) => (
              <li key={c.id} className="glass rounded-xl p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ${CLAIM_STATUS_CLASS[c.status]}`}>{CLAIM_STATUS_LABEL[c.status]}</span>
                  <span className="text-[11px] uppercase tracking-wide text-zinc-500">{CLAIM_TYPE_LABEL[c.claim_type]}</span>
                  <span className="ml-auto font-mono text-xs text-zinc-500">{Math.round(c.confidence * 100)}%</span>
                </div>
                <p className="mt-2 text-sm text-zinc-100">{c.claim_text}</p>
                {(c.subject || c.object) && (
                  <p className="mt-1 text-xs text-zinc-500">
                    {c.subject && <Link href={`/entities/${c.subject.slug}`} className="hover:text-zinc-300">{c.subject.name}</Link>}
                    {c.subject && c.object && " → "}
                    {c.object && <Link href={`/entities/${c.object.slug}`} className="hover:text-zinc-300">{c.object.name}</Link>}
                  </p>
                )}
                {c.evidence.length > 0 && (
                  <ul className="mt-3 space-y-1.5 border-t border-white/5 pt-3">
                    {c.evidence.map((e) => (
                      <li key={e.id} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                        <span className={`font-medium ${STANCE_CLASS[e.stance]}`}>{humanize(e.stance)}</span>
                        <span className="text-zinc-300">{e.source?.name ?? "Unknown source"}</span>
                        <span className="text-zinc-600">{e.source?.source_type?.toLowerCase()} · credibility {Math.round(e.credibility_weight * 100)}%{e.source?.is_primary_source ? " · primary" : ""}</span>
                        {e.excerpt && <span className="basis-full text-zinc-500">“{e.excerpt}”</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Contradictions */}
      {contradictions.length > 0 && (
        <section className="mt-10">
          <SectionTitle>Contradictions</SectionTitle>
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100/90">
            <p className="mb-2 text-xs text-amber-300/80">Sources disagree on the following. Newsfall keeps both sides and does not merge them.</p>
            <ul className="list-disc space-y-1 pl-5">
              {contradictions.map((c) => <li key={c.id}>{c.claim_text} <span className="text-amber-300/70">({CLAIM_STATUS_LABEL[c.status]})</span></li>)}
            </ul>
          </div>
        </section>
      )}

      {/* Source coverage + timeline */}
      {articles.length > 0 && (
        <section className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-5">
          <div className="md:col-span-3">
            <SectionTitle hint={`${articles.length} articles`}>Source coverage</SectionTitle>
            <ul className="glass divide-y divide-white/5 rounded-xl">
              {articles.map((a) => (
                <li key={a.id} className="px-4 py-3">
                  <a href={a.url} target="_blank" rel="noreferrer" className="text-sm text-zinc-100 hover:underline underline-offset-4">{a.title}</a>
                  <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-zinc-500">
                    <span className="text-zinc-300">{a.source_name ?? "Unknown"}</span>
                    <span>{a.source_type?.toLowerCase()}</span>
                    {a.credibility_score != null && <span>· credibility {Math.round(Number(a.credibility_score) * 100)}%</span>}
                    {a.is_primary_source && <span className="text-emerald-300">· primary</span>}
                    {a.is_primary && <span>· seeded this event</span>}
                    {a.published_at && <span>· {formatDate(a.published_at)}</span>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="md:col-span-2">
            <SectionTitle>Timeline</SectionTitle>
            <ol className="relative border-l border-white/10 pl-4">
              {timeline.map((a) => (
                <li key={a.id} className="mb-4 last:mb-0">
                  <span className="absolute -left-[5px] mt-1.5 h-2 w-2 rounded-full bg-zinc-400" />
                  <time className="text-[11px] text-zinc-500">{formatDate(a.published_at)}</time>
                  <p className="text-xs text-zinc-300">{a.source_name}: <a href={a.url} target="_blank" rel="noreferrer" className="text-zinc-200 hover:underline">{a.title}</a></p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {/* Scenarios */}
      {ev.scenarios?.length > 0 && (
        <section className="mt-10">
          <SectionTitle hint="evidence-based possibilities, not predictions">Possible next developments</SectionTitle>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {ev.scenarios.map((s, i) => (
              <div key={i} className="glass rounded-xl p-4 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-zinc-100">{s.scenario}</p>
                  <span className={`shrink-0 text-[11px] font-medium ${s.confidence === "HIGH" ? "text-emerald-300" : s.confidence === "MEDIUM" ? "text-amber-300" : "text-zinc-400"}`}>{s.confidence}</span>
                </div>
                {s.supporting.length > 0 && <p className="mt-2 text-xs text-zinc-400"><span className="text-emerald-300/80">Supporting: </span>{s.supporting.join("; ")}</p>}
                {s.counter.length > 0 && <p className="mt-1 text-xs text-zinc-400"><span className="text-rose-300/80">Against: </span>{s.counter.join("; ")}</p>}
                {s.signals.length > 0 && <p className="mt-1 text-xs text-zinc-500"><span className="text-zinc-400">Signals: </span>{s.signals.join("; ")}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* What to watch */}
      {(watch.length > 0 || ev.what_to_watch?.length > 0) && (
        <section className="mt-10">
          <SectionTitle>What to watch next</SectionTitle>
          <ul className="space-y-2">
            {watch.map((w) => (
              <li key={w.id} className="glass rounded-xl px-4 py-3 text-sm">
                <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                  <span className="uppercase tracking-wide">{WATCH_KIND_LABEL[w.kind]}</span>
                  {w.expected_timeframe && <span>· {w.expected_timeframe}</span>}
                  <span className="ml-auto font-mono">{Math.round(w.confidence * 100)}%</span>
                </div>
                <p className="mt-0.5 text-zinc-100">{w.title}</p>
                {w.reason && <p className="mt-0.5 text-xs text-zinc-500">{w.reason}</p>}
              </li>
            ))}
            {watch.length === 0 && ev.what_to_watch.map((w, i) => <li key={i} className="glass rounded-xl px-4 py-3 text-sm text-zinc-100">{w}</li>)}
          </ul>
        </section>
      )}

      {/* Related events */}
      {related.length > 0 && (
        <section className="mt-10">
          <SectionTitle>Related events</SectionTitle>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {related.map((r) => <EventCard key={r.id} event={r} compact />)}
          </div>
        </section>
      )}

      <footer className="mt-12 border-t border-white/5 pt-6 text-xs text-zinc-600">
        Analysis generated by Newsfall from the sources listed above{ev.analyzed_at ? ` on ${formatDate(ev.analyzed_at)}` : ""}. Importance and confidence are computed from source credibility, independence and corroboration — not from the model alone.
      </footer>
    </main>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white/[0.04] px-3.5 py-2.5 ring-1 ring-white/5">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 flex items-center">{children}</div>
    </div>
  );
}
