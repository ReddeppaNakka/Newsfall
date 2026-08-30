import Link from "next/link";
import type { EventWithEntities, WatchItem } from "@/lib/intelligence-types";
import { WATCH_KIND_LABEL } from "@/lib/format";
import IntelligenceCard from "./IntelligenceCard";

/**
 * Homepage intelligence block: a handful of exceptional developments as premium
 * editorial cards (ranked by intelligence value, not timestamp), then a slim
 * "what to watch" strip. Renders nothing when there are no events, so the legacy
 * homepage is untouched pre-migration and in preview mode.
 */
export default function TopIntelligence({ events, watch }: { events: EventWithEntities[]; watch: WatchItem[] }) {
  if (!events.length) return null;
  const [hero, ...rest] = events;
  return (
    <section className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Top intelligence</p>
          <h2 className="mt-1 font-serif text-2xl font-medium tracking-tight text-zinc-100 sm:text-3xl">What actually matters right now</h2>
        </div>
        <Link href="/intelligence" className="shrink-0 py-2 text-sm font-medium text-zinc-400 transition hover:text-white">
          All intelligence →
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <IntelligenceCard event={hero} hero />
        {rest.slice(0, 5).map((e) => (
          <IntelligenceCard key={e.id} event={e} />
        ))}
      </div>

      {watch.length > 0 && (
        <div className="mt-6 rounded-2xl border border-white/[0.08] bg-[#0d0f14] px-5 py-4">
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">What to watch</span>
            {watch.slice(0, 4).map((w) => (
              <Link
                key={w.id}
                href={w.event ? `/events/${w.event.slug}` : "/intelligence"}
                className="text-sm text-zinc-300 transition hover:text-white"
                title={w.reason ?? undefined}
              >
                <span className="mr-1.5 text-[10px] uppercase tracking-wide text-zinc-600">{WATCH_KIND_LABEL[w.kind]}</span>
                {w.title}
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
