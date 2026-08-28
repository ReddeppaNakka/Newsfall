import Link from "next/link";
import type { EventWithEntities, WatchItem } from "@/lib/intelligence-types";
import { EVENT_TYPE_LABEL, WATCH_KIND_LABEL, relativeTime } from "@/lib/format";
import EntityChip from "./EntityChip";
import EventCard from "./EventCard";
import { ConfidenceMeter, ImportanceMeter, SectionTitle, Tag } from "./Scores";

/**
 * Homepage intelligence block: the single most important verified development,
 * then the next few, then what to watch. Renders nothing when there are no events
 * (pre-migration databases and preview mode keep the legacy homepage intact).
 */
export default function TopIntelligence({
  top,
  next,
  watch,
}: {
  top: EventWithEntities | null;
  next: EventWithEntities[];
  watch: WatchItem[];
}) {
  if (!top) return null;
  return (
    <section className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Newsfall Intelligence</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-zinc-100 sm:text-2xl">The signal behind the noise</h2>
        </div>
        <Link href="/intelligence" className="shrink-0 py-2 text-sm font-medium text-zinc-300 hover:text-white">
          Full feed →
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Top intelligence */}
        <article className="glass rounded-2xl p-5 lg:col-span-3 sm:p-7">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
            <span className="font-medium uppercase tracking-wide text-zinc-300">Top intelligence</span>
            <span>·</span>
            <span>{EVENT_TYPE_LABEL[top.event_type]}</span>
            <span>·</span>
            <time>{relativeTime(top.last_updated_at)}</time>
            {top.primary_source_confirmed && <Tag tone="good">Primary source</Tag>}
            {top.has_contradiction && <Tag tone="warn">Contradiction</Tag>}
          </div>
          <h3 className="mt-3 text-2xl font-semibold leading-tight tracking-tight text-white sm:text-3xl">
            <Link href={`/events/${top.slug}`} className="hover:underline decoration-zinc-600 underline-offset-4">
              {top.title}
            </Link>
          </h3>
          {top.why_it_matters ? (
            <div className="mt-4">
              <SectionTitle>Why it matters</SectionTitle>
              <p className="text-[15px] leading-relaxed text-zinc-300">{top.why_it_matters}</p>
            </div>
          ) : (
            top.summary && <p className="mt-4 text-[15px] leading-relaxed text-zinc-300">{top.summary}</p>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-white/5 pt-4">
            <ImportanceMeter score={Number(top.importance_score)} />
            <ConfidenceMeter value={Number(top.confidence_score)} />
            <span className="text-sm text-zinc-500">{top.independent_source_count} independent sources</span>
          </div>
          {top.entities.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {top.entities.slice(0, 8).map((e) => (
                <EntityChip key={e.id} entity={e} role={e.role} />
              ))}
            </div>
          )}
        </article>

        {/* Next + watch */}
        <div className="flex flex-col gap-4 lg:col-span-2">
          {next.slice(0, 2).map((e) => (
            <EventCard key={e.id} event={e} compact />
          ))}
          {watch.length > 0 && (
            <div className="glass rounded-xl p-4">
              <SectionTitle>What to watch</SectionTitle>
              <ul className="space-y-2.5">
                {watch.slice(0, 4).map((w) => (
                  <li key={w.id} className="text-sm">
                    <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                      <span className="uppercase tracking-wide">{WATCH_KIND_LABEL[w.kind]}</span>
                      {w.expected_timeframe && <span>· {w.expected_timeframe}</span>}
                    </div>
                    {w.event ? (
                      <Link href={`/events/${w.event.slug}`} className="text-zinc-200 hover:text-white">{w.title}</Link>
                    ) : (
                      <span className="text-zinc-200">{w.title}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
