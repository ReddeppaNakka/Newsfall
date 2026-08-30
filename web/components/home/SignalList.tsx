import Link from "next/link";
import type { EventWithEntities } from "@/lib/intelligence-types";
import { categoryFor, subtitleFor } from "@/lib/category";
import { confidenceLabel } from "@/lib/format";
import EditorialVisual from "./EditorialVisual";
import SectionHeading from "./SectionHeading";

/** THE SIGNALS WE'RE WATCHING — a horizontal editorial list, not a card grid. */
export default function SignalList({ events }: { events: EventWithEntities[] }) {
  if (!events.length) return null;
  return (
    <section className="flex flex-col rounded-lg border border-white/[0.07] bg-surface p-5 sm:p-6">
      <SectionHeading title="THE SIGNALS WE'RE WATCHING" icon={<BarsIcon />} />
      <ul className="divide-y divide-white/[0.06]">
        {events.map((e) => {
          const cat = categoryFor(e.event_type);
          const conf = Number(e.confidence_score);
          const sources = e.source_count || e.article_count;
          return (
            <li key={e.id}>
              <Link href={`/events/${e.slug}`} className="group flex gap-4 py-4 first:pt-0 last:pb-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60 sm:gap-5">
                <EditorialVisual src={e.image_url} eventType={e.event_type} className="hidden h-[84px] w-[128px] shrink-0 rounded-md sm:block" sizes="128px" />
                <div className="min-w-0 flex-1">
                  <p className={`text-[10px] font-semibold tracking-[0.18em] ${cat.text}`}>{cat.label.toUpperCase()}</p>
                  <h3 className="mt-1 text-[16px] font-medium leading-snug text-zinc-50 group-hover:text-white">{e.title}</h3>
                  {subtitleFor(e, 120) && <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-zinc-500">{subtitleFor(e, 120)}</p>}
                  <p className="mt-2 flex items-center gap-2 text-[11px] text-zinc-500">
                    <span>{sources} {sources === 1 ? "source" : "sources"}</span>
                    <span className="text-zinc-700">·</span>
                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${conf >= 0.75 ? "bg-emerald-400" : conf >= 0.45 ? "bg-amber-400" : "bg-zinc-500"}`} />
                    <span>{confidenceLabel(conf)} confidence</span>
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <div className={`font-sans text-[26px] font-medium leading-none tabular-nums ${cat.text}`}>{Math.round(Number(e.importance_score))}</div>
                  <div className="mt-1 text-[8px] font-semibold tracking-[0.18em] text-zinc-500">SIGNIFICANCE</div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      <Link href="/intelligence" className="group mt-5 flex items-center gap-1.5 text-[12px] text-violet-300 transition hover:text-violet-200">
        View all signals <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
      </Link>
    </section>
  );
}

function BarsIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" aria-hidden>
      <path d="M5 19V13M10 19V5M15 19v-8M20 19v-4" />
    </svg>
  );
}
