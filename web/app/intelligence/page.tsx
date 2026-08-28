import Link from "next/link";
import { getEventsBySlugs, getLatestBriefing, listEntities, listEvents, listWatchItems } from "@/lib/intelligence";
import { EVENT_TYPE_LABEL, WATCH_KIND_LABEL, formatDate } from "@/lib/format";
import EventCard from "@/components/intel/EventCard";
import EntityChip from "@/components/intel/EntityChip";
import { SectionTitle } from "@/components/intel/Scores";
import type { EventType } from "@/lib/intelligence-types";

export const revalidate = 60;

export const metadata = {
  title: "Intelligence Feed — Newsfall",
  description: "Verified, evidence-linked technology and industry intelligence, ranked by importance and confidence.",
};

const TECH_TYPES: EventType[] = ["MODEL_RELEASE", "PRODUCT_LAUNCH", "OPEN_SOURCE_RELEASE", "RESEARCH_BREAKTHROUGH", "CHIP_DEVELOPMENT", "INFRASTRUCTURE_EXPANSION", "SECURITY_INCIDENT"];
const INDUSTRY_TYPES: EventType[] = ["FUNDING", "ACQUISITION", "PARTNERSHIP", "INVESTMENT", "EARNINGS", "IPO", "REGULATION", "LAWSUIT", "LAYOFF", "POLICY_STATEMENT", "LEADERSHIP_CHANGE"];

export default async function IntelligencePage({ searchParams }: { searchParams: Promise<{ type?: string; days?: string }> }) {
  const { type, days } = await searchParams;
  const sinceDays = Number(days) || 14;
  const [all, briefing, watch, people] = await Promise.all([
    listEvents({ limit: 60, sinceDays, type: type || undefined }),
    getLatestBriefing(),
    listWatchItems(8),
    listEntities({ type: "PERSON", limit: 8 }),
  ]);
  const briefingEvents = briefing
    ? await getEventsBySlugs(Object.values(briefing.content).flatMap((s) => (s && typeof s === "object" && "event_slugs" in s ? s.event_slugs : [])))
    : [];
  const bySlug = new Map(briefingEvents.map((e) => [e.slug, e]));

  const tech = type ? [] : all.filter((e) => TECH_TYPES.includes(e.event_type)).slice(0, 8);
  const industry = type ? [] : all.filter((e) => INDUSTRY_TYPES.includes(e.event_type)).slice(0, 8);
  const influence = type ? [] : all.filter((e) => e.entities.some((x) => x.entity_type === "PERSON" && x.role !== "MENTIONED")).slice(0, 6);
  const emerging = type ? [] : all.filter((e) => e.independent_source_count <= 1 && e.importance_score >= 35).slice(0, 6);

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8 sm:px-6 sm:py-14">
      <Link href="/" className="-my-1 inline-flex min-h-[40px] items-center text-sm text-zinc-500 transition hover:text-zinc-300">
        ← Back to Newsfall
      </Link>

      <header className="mb-8 mt-5 flex flex-wrap items-end justify-between gap-4 sm:mt-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Newsfall Intelligence</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-zinc-50 sm:text-4xl">The signal behind the noise</h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-zinc-400">
            Events, not articles. Each item is clustered from multiple sources, scored for importance, and given an
            evidence-derived confidence. {all.length} events in the last {sinceDays} days.
          </p>
        </div>
        <Link href="/ask" className="rounded-xl bg-zinc-100 px-4 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-white">
          Ask Newsfall
        </Link>
      </header>

      {/* Type filter */}
      <div className="no-scrollbar mb-8 flex gap-2 overflow-x-auto pb-1">
        <FilterChip href="/intelligence" active={!type} label="All" />
        {[...TECH_TYPES, ...INDUSTRY_TYPES].map((t) => (
          <FilterChip key={t} href={`/intelligence?type=${t}`} active={type === t} label={EVENT_TYPE_LABEL[t]} />
        ))}
      </div>

      {all.length === 0 && (
        <p className="glass rounded-xl px-5 py-6 text-sm text-zinc-400">
          No events yet. Run the intelligence pipeline (<code className="text-zinc-300">python -m newsfall.run</code>) after applying
          <code className="text-zinc-300"> supabase/migrations/001_intelligence_foundation.sql</code>.
        </p>
      )}

      {type ? (
        <Grid events={all} />
      ) : (
        <div className="space-y-12">
          {briefing && (
            <section className="glass rounded-2xl p-5 sm:p-7">
              <SectionTitle hint={formatDate(briefing.period_start)}>Today&apos;s intelligence briefing</SectionTitle>
              <h2 className="text-xl font-semibold tracking-tight text-zinc-50 sm:text-2xl">{briefing.title}</h2>
              <div className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-2">
                {(["most_important", "why_it_matters", "industry_shift", "people_of_influence", "emerging_signals", "what_to_watch"] as const).map((k) => {
                  const s = briefing.content[k];
                  if (!s) return null;
                  return (
                    <div key={k}>
                      <h3 className="text-sm font-semibold text-zinc-200">{s.heading}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-zinc-400">{s.body}</p>
                      {s.event_slugs?.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                          {s.event_slugs.map((slug) => bySlug.get(slug) && (
                            <Link key={slug} href={`/events/${slug}`} className="text-xs text-zinc-300 underline decoration-zinc-700 underline-offset-4 hover:text-white">
                              {bySlug.get(slug)!.title}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <Section title="Top intelligence" hint="ranked by importance × confidence">
            <Grid events={all.slice(0, 6)} />
          </Section>
          {tech.length > 0 && <Section title="Technology intelligence"><Grid events={tech} /></Section>}
          {industry.length > 0 && <Section title="Industry intelligence"><Grid events={industry} /></Section>}

          {(influence.length > 0 || people.length > 0) && (
            <Section title="Influence intelligence" hint="people who move technology, capital or policy">
              {people.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-1.5">
                  {people.map((p) => <EntityChip key={p.id} entity={p} />)}
                </div>
              )}
              <Grid events={influence} />
            </Section>
          )}

          {(watch.length > 0 || emerging.length > 0) && (
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
              <Section title="What to watch">
                <ul className="glass divide-y divide-white/5 rounded-xl">
                  {watch.map((w) => (
                    <li key={w.id} className="px-4 py-3">
                      <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                        <span className="uppercase tracking-wide">{WATCH_KIND_LABEL[w.kind]}</span>
                        {w.expected_timeframe && <span>· {w.expected_timeframe}</span>}
                        <span className="ml-auto font-mono">{Math.round(w.confidence * 100)}%</span>
                      </div>
                      {w.event ? (
                        <Link href={`/events/${w.event.slug}`} className="mt-0.5 block text-sm text-zinc-100 hover:underline underline-offset-4">{w.title}</Link>
                      ) : (
                        <p className="mt-0.5 text-sm text-zinc-100">{w.title}</p>
                      )}
                      {w.reason && <p className="mt-0.5 text-xs text-zinc-500">{w.reason}</p>}
                    </li>
                  ))}
                  {watch.length === 0 && <li className="px-4 py-3 text-sm text-zinc-500">Nothing open yet.</li>}
                </ul>
              </Section>
              <Section title="Emerging signals" hint="single-source — not yet corroborated">
                <div className="space-y-3">
                  {emerging.map((e) => <EventCard key={e.id} event={e} compact />)}
                  {emerging.length === 0 && <p className="text-sm text-zinc-500">No uncorroborated signals right now.</p>}
                </div>
              </Section>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

function FilterChip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link href={href} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs transition ${active ? "border-white/30 bg-white/10 text-white" : "border-white/10 text-zinc-400 hover:border-white/25 hover:text-zinc-200"}`}>
      {label}
    </Link>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <SectionTitle hint={hint}>{title}</SectionTitle>
      {children}
    </section>
  );
}

function Grid({ events }: { events: Parameters<typeof EventCard>[0]["event"][] }) {
  if (!events.length) return null;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {events.map((e) => <EventCard key={e.id} event={e} />)}
    </div>
  );
}
