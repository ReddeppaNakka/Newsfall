import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getEntityClaims, getEventArticles, getEventBySlug, getEventClaims, getEventWatchItems, getRelatedEvents,
} from "@/lib/intelligence";
import type { ArticlePublic, Claim, EntityRef, IntelEvent, WatchItem } from "@/lib/intelligence-types";
import { categoryFor } from "@/lib/category";
import {
  CLAIM_STATUS_CLASS, CLAIM_STATUS_LABEL, CLAIM_TYPE_LABEL, ENTITY_TYPE_LABEL, EVENT_TYPE_LABEL, WATCH_KIND_LABEL,
  confidenceLabel, formatDate, humanize, relativeTime,
} from "@/lib/format";
import EntityChip from "@/components/intel/EntityChip";
import EventCard from "@/components/intel/EventCard";

export const revalidate = 60;

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params) {
  const { slug } = await params;
  const ev = await getEventBySlug(slug);
  return { title: ev ? `${ev.title} — Newsfall` : "Event — Newsfall", description: ev?.why_it_matters ?? ev?.summary ?? undefined };
}

/**
 * /events/[slug] — headline → understanding.
 *
 * Order (Part 19A): what happened → why it matters → who is involved → what the
 * evidence says (sources + consensus) → how it connects (bigger picture, timeline)
 * → what we don't know → what to watch → related intelligence.
 * Everything here is precomputed by the pipeline; no AI runs at request time.
 */
export default async function EventPage({ params }: Params) {
  const { slug } = await params;
  const ev = await getEventBySlug(slug);
  if (!ev) notFound();

  const [articles, claims, related, watch] = await Promise.all([
    getEventArticles(ev.id), getEventClaims(ev.id), getRelatedEvents(ev, 8), getEventWatchItems(ev.id),
  ]);
  const topEntity = ev.entities[0];
  const relatedClaims = topEntity ? (await getEntityClaims(topEntity.id, 8)).filter((c) => !claims.some((x) => x.id === c.id)).slice(0, 5) : [];

  const cat = categoryFor(ev.event_type);
  const consensus = sourceConsensus(articles, claims);
  const confirmed = claims.filter((c) => c.status === "CONFIRMED" || c.status === "PARTIALLY_CONFIRMED");
  const reported = claims.filter((c) => c.status === "REPORTED");
  const contested = claims.filter((c) => c.status === "DISPUTED" || c.status === "FALSE");
  const uncertainties = [
    ...(ev.intelligence_summary ? ev.intelligence_summary.split(/(?<=[.!?])\s+/).filter(Boolean) : []),
    ...claims.filter((c) => c.status === "UNVERIFIED" && c.claim_type !== "OPINION").slice(0, 3).map((c) => `Unverified: ${c.claim_text}`),
    ...(contested.length ? [`Sources disagree on ${contested.length} claim${contested.length > 1 ? "s" : ""} (see evidence).`] : []),
    ...(!ev.primary_source_confirmed ? ["No primary (official) source has confirmed this yet."] : []),
  ].slice(0, 6);
  const timeline = timelineFor(ev, related);
  const primaryArticle = articles.find((a) => a.is_primary) ?? articles[0];
  const people = ev.entities.filter((e) => e.entity_type === "PERSON");
  const companies = ev.entities.filter((e) => ["COMPANY", "STARTUP", "INVESTOR", "FUND", "ORGANIZATION", "RESEARCH_LAB", "GOVERNMENT"].includes(e.entity_type));
  const technologies = ev.entities.filter((e) => ["TECHNOLOGY", "PRODUCT", "INDUSTRY"].includes(e.entity_type));
  const watchByKind = groupWatch(watch, ev.what_to_watch);

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <Link href="/" className="-my-1 inline-flex min-h-[40px] items-center text-sm text-zinc-500 transition hover:text-zinc-300">
        ← Newsfall
      </Link>

      {/* 1. HERO */}
      <header className="mt-6">
        <div className="flex items-start justify-between gap-6">
          <div>
            <span className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${cat.text}`}>{cat.label}</span>
            <span className={`mt-1.5 block h-px w-7 ${cat.rule} opacity-70`} />
          </div>
          <div className={`flex shrink-0 flex-col items-center rounded-lg border px-3 py-1.5 ${cat.badge}`}>
            <span className="font-mono text-2xl font-medium leading-none tabular-nums">{Math.round(Number(ev.importance_score))}</span>
            <span className="mt-1 text-[9px] font-semibold uppercase tracking-[0.14em] opacity-80">Importance</span>
          </div>
        </div>
        <h1 className="mt-5 font-serif text-3xl font-medium leading-[1.15] tracking-tight text-white sm:text-[2.6rem]">{ev.title}</h1>
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-zinc-400">
          <span className="flex items-center gap-1.5 text-zinc-200">
            <Shield /> {confidenceLabel(Number(ev.confidence_score))} confidence · {Math.round(Number(ev.confidence_score) * 100)}%
          </span>
          <span>{humanize(ev.status)}</span>
          <span>{ev.occurred_at ? formatDate(ev.occurred_at) : `first seen ${formatDate(ev.first_seen_at)}`}</span>
          <span>updated {relativeTime(ev.last_updated_at)}</span>
        </div>
        {ev.entities.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {ev.entities.slice(0, 8).map((e) => <EntityChip key={e.id} entity={e} role={e.role} />)}
          </div>
        )}
      </header>

      {/* 2. WHAT HAPPENED */}
      <Section n="01" title="What happened">
        <p className="font-serif text-[19px] leading-relaxed text-zinc-100">{ev.summary ?? primaryArticle?.summary ?? "No summary available yet."}</p>
        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Fact label="When" value={ev.occurred_at ? formatDate(ev.occurred_at) : "Unknown"} />
          <Fact label="Type" value={EVENT_TYPE_LABEL[ev.event_type]} />
          <Fact label="Confirmed claims" value={`${confirmed.length} of ${claims.length}`} />
          <Fact label="Reported only" value={String(reported.length)} />
        </dl>
        {confirmed.length > 0 && (
          <ul className="mt-5 space-y-2">
            {confirmed.slice(0, 4).map((c) => (
              <li key={c.id} className="flex gap-3 text-sm text-zinc-300">
                <span className="mt-[3px] shrink-0 text-emerald-300"><Check /></span>
                <span>{c.claim_text}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* 3. WHY IT MATTERS */}
      {(ev.why_it_matters || ev.industry_impact) && (
        <Section n="02" title="Why it matters">
          {ev.why_it_matters && <p className="text-[16px] leading-relaxed text-zinc-200">{ev.why_it_matters}</p>}
          {ev.industry_impact && (
            <div className="mt-5 border-l-2 border-white/10 pl-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Industry impact</p>
              <p className="mt-1.5 text-[15px] leading-relaxed text-zinc-300">{ev.industry_impact}</p>
            </div>
          )}
        </Section>
      )}

      {/* 4. KEY ENTITIES */}
      {ev.entities.length > 0 && (
        <Section n="03" title="Who is involved">
          <ul className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.08]">
            {ev.entities.slice(0, 10).map((e) => (
              <li key={e.id}>
                <Link href={`/entities/${e.slug}`} className="flex items-center gap-4 px-4 py-3 transition hover:bg-white/[0.04]">
                  <span className="min-w-0 flex-1 text-sm font-medium text-zinc-100">{e.name}</span>
                  <span className="text-xs text-zinc-500">{ENTITY_TYPE_LABEL[e.entity_type]} · {humanize(e.role)}</span>
                  <span className="font-mono text-xs text-zinc-500">{Math.round(Number(e.influence_score))}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* 5. EVIDENCE */}
      {articles.length > 0 && (
        <Section n="04" title="What the evidence says" hint={`${articles.length} ${articles.length === 1 ? "source" : "sources"}`}>
          <ul className="space-y-3">
            {articles.map((a) => {
              const supports = claims.filter((c) => c.evidence.some((e) => e.article_id === a.id && e.stance === "SUPPORTS")).slice(0, 2);
              const contradicts = claims.filter((c) => c.evidence.some((e) => e.article_id === a.id && e.stance === "CONTRADICTS")).slice(0, 2);
              return (
                <li key={a.id} className="rounded-xl border border-white/[0.08] p-4">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="font-medium text-zinc-100">{a.source_name ?? "Unknown source"}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${sourceTone(a)}`}>{sourceKind(a)}</span>
                    {a.published_at && <span className="text-zinc-500">{formatDate(a.published_at)}</span>}
                    {a.credibility_score != null && <span className="text-zinc-500">credibility {Math.round(Number(a.credibility_score) * 100)}%</span>}
                    <a href={a.url} target="_blank" rel="noreferrer" className="ml-auto text-zinc-300 underline decoration-zinc-700 underline-offset-4 hover:text-white">
                      Read original ↗
                    </a>
                  </div>
                  <p className="mt-2 text-sm text-zinc-200">{a.title}</p>
                  {supports.length > 0 && (
                    <p className="mt-2 text-xs text-zinc-400"><span className="text-emerald-300/90">Supports: </span>{supports.map((c) => c.claim_text).join(" · ")}</p>
                  )}
                  {contradicts.length > 0 && (
                    <p className="mt-1 text-xs text-zinc-400"><span className="text-rose-300/90">Contradicts: </span>{contradicts.map((c) => c.claim_text).join(" · ")}</p>
                  )}
                </li>
              );
            })}
          </ul>

          {/* 6. SOURCE CONSENSUS */}
          <div className="mt-6 rounded-xl border border-white/[0.08] bg-white/[0.02] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Source consensus</p>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <Stat n={articles.length} label="analysed" />
              <Stat n={consensus.support} label="support" tone="text-emerald-300" />
              {consensus.partial > 0 && <Stat n={consensus.partial} label="partially support" tone="text-teal-300" />}
              {consensus.contradict > 0 && <Stat n={consensus.contradict} label="contradict" tone="text-rose-300" />}
              {consensus.unverified > 0 && <Stat n={consensus.unverified} label="unverified" tone="text-zinc-400" />}
            </div>
            <div className="mt-4 flex items-center gap-4">
              <span className="font-mono text-3xl tabular-nums text-zinc-50">{Math.round(Number(ev.confidence_score) * 100)}%</span>
              <div className="text-xs leading-relaxed text-zinc-500">
                Confidence is computed from source credibility, independent-source count ({ev.independent_source_count}),
                primary-source confirmation ({ev.primary_source_confirmed ? "yes" : "no"}), evidence agreement and claim certainty — not from a model&apos;s self-assessment.
              </div>
            </div>
          </div>

          {/* Claims detail */}
          {claims.length > 0 && (
            <details className="mt-4 group">
              <summary className="cursor-pointer text-sm text-zinc-400 hover:text-zinc-200">All {claims.length} extracted claims and their status</summary>
              <ul className="mt-3 space-y-2">
                {claims.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-start gap-2 rounded-lg border border-white/[0.06] px-3 py-2 text-sm">
                    <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ${CLAIM_STATUS_CLASS[c.status]}`}>{CLAIM_STATUS_LABEL[c.status]}</span>
                    <span className="text-[11px] uppercase tracking-wide text-zinc-500">{CLAIM_TYPE_LABEL[c.claim_type]}</span>
                    <span className="basis-full text-zinc-200">{c.claim_text}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Section>
      )}

      {/* 7 + 8. BIGGER PICTURE / TIMELINE */}
      {timeline.length > 1 && (
        <Section n="05" title="The bigger picture" hint="related Newsfall events, chronologically">
          <ol className="relative border-l border-white/10 pl-5">
            {timeline.map((t) => (
              <li key={t.id} className="mb-5 last:mb-0">
                <span className={`absolute -left-[5px] mt-1.5 h-2 w-2 rounded-full ${t.id === ev.id ? cat.rule : "bg-zinc-600"}`} />
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                  <time>{formatDate(t.occurred_at ?? t.first_seen_at)}</time>
                  <span>· {EVENT_TYPE_LABEL[t.event_type]}</span>
                  {t.id === ev.id && <span className={`font-semibold uppercase tracking-wide ${cat.text}`}>this event</span>}
                </div>
                {t.id === ev.id ? (
                  <p className="text-sm font-medium text-zinc-100">{t.title}</p>
                ) : (
                  <Link href={`/events/${t.slug}`} className="text-sm text-zinc-300 hover:text-white hover:underline underline-offset-4">{t.title}</Link>
                )}
              </li>
            ))}
          </ol>
        </Section>
      )}

      {/* 10. UNCERTAINTIES */}
      {uncertainties.length > 0 && (
        <Section n="06" title="What we don't know yet">
          <ul className="space-y-2">
            {uncertainties.map((u, i) => (
              <li key={i} className="flex gap-3 text-sm text-zinc-300">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300/80" />
                <span>{u}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* 9. WHAT TO WATCH */}
      {(watchByKind.known.length + watchByKind.emerging.length + watchByKind.possible.length + ev.scenarios.length) > 0 && (
        <Section n="07" title="What to watch next">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <WatchGroup title="Known upcoming" items={watchByKind.known} />
            <WatchGroup title="Emerging signals" items={watchByKind.emerging} />
            <WatchGroup title="Possible next developments" items={watchByKind.possible} />
          </div>
          {ev.scenarios.length > 0 && (
            <div className="mt-6 space-y-3">
              {ev.scenarios.map((s, i) => (
                <div key={i} className="rounded-xl border border-white/[0.08] p-4 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-zinc-100"><span className="mr-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Possible next development</span>{s.scenario}</p>
                    <span className={`shrink-0 text-[11px] font-semibold ${s.confidence === "HIGH" ? "text-emerald-300" : s.confidence === "MEDIUM" ? "text-amber-300" : "text-zinc-400"}`}>{s.confidence}</span>
                  </div>
                  {s.supporting.length > 0 && <p className="mt-2 text-xs text-zinc-400"><span className="text-emerald-300/80">For: </span>{s.supporting.join("; ")}</p>}
                  {s.counter.length > 0 && <p className="mt-1 text-xs text-zinc-400"><span className="text-rose-300/80">Against: </span>{s.counter.join("; ")}</p>}
                  {s.signals.length > 0 && <p className="mt-1 text-xs text-zinc-500"><span className="text-zinc-400">Signals: </span>{s.signals.join("; ")}</p>}
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* 11. RELATED INTELLIGENCE */}
      {(related.length + people.length + companies.length + technologies.length + relatedClaims.length) > 0 && (
        <Section n="08" title="Related intelligence">
          {related.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {related.slice(0, 4).map((r) => <EventCard key={r.id} event={r} compact />)}
            </div>
          )}
          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
            <RelatedList title="Companies & organisations" items={companies} />
            <RelatedList title="People" items={people} />
            <RelatedList title="Technologies" items={technologies} />
          </div>
          {relatedClaims.length > 0 && topEntity && (
            <div className="mt-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Related claims about {topEntity.name}</p>
              <ul className="mt-2 space-y-1.5">
                {relatedClaims.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-start gap-2 text-sm">
                    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1 ${CLAIM_STATUS_CLASS[c.status]}`}>{CLAIM_STATUS_LABEL[c.status]}</span>
                    <span className="text-zinc-300">{c.claim_text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>
      )}

      <footer className="mt-14 border-t border-white/[0.06] pt-6 text-xs leading-relaxed text-zinc-600">
        Newsfall is an intelligence layer over the sources above, not a replacement for them — every source has a
        &ldquo;Read original&rdquo; link. Analysis{ev.analyzed_at ? ` generated ${formatDate(ev.analyzed_at)}` : " pending"}; importance and confidence are computed from
        evidence, not asserted by a model.
      </footer>
    </main>
  );
}

/* ----------------------------------------------------------------------------- helpers */

function sourceConsensus(articles: ArticlePublic[], claims: Claim[]) {
  let support = 0, partial = 0, contradict = 0, unverified = 0;
  for (const a of articles) {
    const stances = claims.flatMap((c) => c.evidence.filter((e) => e.article_id === a.id).map((e) => e.stance));
    if (stances.includes("CONTRADICTS")) contradict++;
    else if (stances.includes("SUPPORTS")) support++;
    else if (stances.length) partial++;
    else unverified++;
  }
  return { support, partial, contradict, unverified };
}

function timelineFor(ev: IntelEvent, related: IntelEvent[]): IntelEvent[] {
  const key = (e: IntelEvent) => e.occurred_at ?? e.first_seen_at;
  return [...related.slice(0, 6), ev].sort((a, b) => key(a).localeCompare(key(b)));
}

function groupWatch(items: WatchItem[], fallback: string[]) {
  const known = items.filter((w) => w.kind === "UPCOMING_KNOWN_EVENT");
  const emerging = items.filter((w) => w.kind === "EMERGING_SIGNAL");
  const possible = items.filter((w) => w.kind === "SPECULATIVE_POSSIBILITY");
  if (!items.length && fallback.length) {
    return { known: [], emerging: fallback.map((t, i) => ({ id: `f${i}`, title: t, reason: null, expected_timeframe: null, confidence: 0.4 } as WatchItem)), possible: [] };
  }
  return { known, emerging, possible };
}

function sourceKind(a: ArticlePublic): string {
  if (a.is_primary_source) return "Official / primary";
  switch (a.source_type) {
    case "NEWS": case "FINANCIAL": return "Independent reporting";
    case "RESEARCH": return "Research";
    case "COMMUNITY": case "SOCIAL": return "Community signal";
    case "DEVELOPER": case "BLOG": return "Developer source";
    case "SECURITY": case "GOVERNMENT": return "Official / primary";
    default: return "Source";
  }
}

function sourceTone(a: ArticlePublic): string {
  if (a.is_primary_source || ["GOVERNMENT", "SECURITY"].includes(a.source_type ?? "")) return "bg-emerald-500/10 text-emerald-300";
  if (["COMMUNITY", "SOCIAL"].includes(a.source_type ?? "")) return "bg-zinc-500/15 text-zinc-300";
  if (a.source_type === "RESEARCH") return "bg-violet-500/10 text-violet-300";
  return "bg-sky-500/10 text-sky-300";
}

function Section({ n, title, hint, children }: { n: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <div className="mb-4 flex items-baseline gap-3">
        <span className="font-mono text-[11px] text-zinc-600">{n}</span>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">{title}</h2>
        {hint && <span className="ml-auto text-xs text-zinc-600">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/[0.06] px-3 py-2">
      <dt className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-0.5 text-zinc-100">{value}</dd>
    </div>
  );
}

function Stat({ n, label, tone = "text-zinc-100" }: { n: number; label: string; tone?: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className={`font-mono text-lg tabular-nums ${tone}`}>{n}</span>
      <span className="text-xs uppercase tracking-wide text-zinc-500">{label}</span>
    </span>
  );
}

function WatchGroup({ title, items }: { title: string; items: WatchItem[] }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{title}</p>
      {items.length === 0 ? (
        <p className="mt-2 text-xs text-zinc-600">None identified.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {items.map((w) => (
            <li key={w.id} className="text-sm">
              <p className="text-zinc-200">{w.title}</p>
              <p className="text-xs text-zinc-500">
                {w.expected_timeframe ? `${w.expected_timeframe} · ` : ""}{Math.round(w.confidence * 100)}%{w.reason ? ` · ${w.reason}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RelatedList({ title, items }: { title: string; items: (EntityRef & { role: string })[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{title}</p>
      <ul className="mt-2 space-y-1">
        {items.slice(0, 6).map((e) => (
          <li key={e.id}><Link href={`/entities/${e.slug}`} className="text-sm text-zinc-300 hover:text-white hover:underline underline-offset-4">{e.name}</Link></li>
        ))}
      </ul>
    </div>
  );
}

function Shield() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3 4.5 6v5.5c0 4.7 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.8 7.5-9.5V6L12 3Z" /><path d="m9.5 12 1.8 1.8L15 10" />
    </svg>
  );
}

function Check() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m5 12 4.5 4.5L19 7" />
    </svg>
  );
}
