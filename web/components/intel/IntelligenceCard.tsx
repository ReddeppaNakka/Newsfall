import Link from "next/link";
import type { EventWithEntities } from "@/lib/intelligence-types";
import { categoryFor, subtitleFor } from "@/lib/category";
import { confidenceLabel, relativeTime } from "@/lib/format";

/**
 * Premium editorial intelligence card — the homepage unit.
 *
 * Shows only curiosity-level information (category, importance, headline, one-line
 * subtitle, entities, sources, confidence). The whole card is one link to the event
 * page; nothing essential is hover-only; focus ring for keyboard users.
 */
export default function IntelligenceCard({
  event,
  hero = false,
}: {
  event: EventWithEntities;
  hero?: boolean;
}) {
  const cat = categoryFor(event.event_type);
  const subtitle = subtitleFor(event, hero ? 190 : 140);
  const entities = event.entities.filter((e) => e.role !== "MENTIONED").slice(0, 3);
  const shown = entities.length ? entities : event.entities.slice(0, 3);
  const conf = confidenceLabel(Number(event.confidence_score));

  return (
    <Link
      href={`/events/${event.slug}`}
      aria-label={`${event.title} — explore intelligence`}
      className={`group relative flex flex-col rounded-2xl border border-white/[0.08] bg-[#0d0f14] p-5 transition duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-[#10131a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 sm:p-6 ${
        hero ? "md:col-span-2 md:p-8" : ""
      }`}
    >
      {/* Top row: category + importance */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <span className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${cat.text}`}>{cat.label}</span>
          <span className={`mt-1.5 block h-px w-7 ${cat.rule} opacity-70`} />
        </div>
        <div className={`flex shrink-0 flex-col items-center rounded-lg border px-3 py-1.5 ${cat.badge}`}>
          <span className="font-mono text-2xl font-medium leading-none tabular-nums">{Math.round(Number(event.importance_score))}</span>
          <span className="mt-1 text-[9px] font-semibold uppercase tracking-[0.14em] opacity-80">Importance</span>
        </div>
      </div>

      {/* Meta line */}
      <div className="mt-5 flex items-center gap-2 text-xs text-zinc-500">
        <time>{relativeTime(event.last_updated_at)}</time>
        {event.status === "CONTRADICTED" && <span className="text-amber-300/90">· sources disagree</span>}
        {event.status === "UPDATED" && <span>· updated</span>}
      </div>

      {/* Headline */}
      <h3
        className={`mt-2 font-serif font-medium leading-[1.2] tracking-tight text-zinc-50 decoration-zinc-600 underline-offset-4 group-hover:underline ${
          hero ? "text-2xl sm:text-3xl md:text-[2.1rem]" : "text-xl sm:text-2xl"
        }`}
      >
        {event.title}
      </h3>

      {subtitle && <p className="mt-3 text-[14px] leading-relaxed text-zinc-400">{subtitle}</p>}

      {/* Entities */}
      {shown.length > 0 && (
        <p className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] font-medium uppercase tracking-wide text-zinc-300">
          {shown.map((e, i) => (
            <span key={e.id} className="flex items-center gap-2.5">
              {i > 0 && <span className="text-zinc-600">·</span>}
              {e.name}
            </span>
          ))}
        </p>
      )}

      {/* Footer */}
      <div className="mt-auto flex items-center gap-4 pt-5">
        <div className="flex w-full items-center gap-4 border-t border-white/[0.06] pt-4 text-[12px] text-zinc-400">
        <span className="flex items-center gap-1.5">
          <DocIcon />
          {event.source_count || event.article_count} {(event.source_count || event.article_count) === 1 ? "source" : "sources"}
        </span>
        <span className="flex items-center gap-1.5">
          <ShieldIcon />
          {conf} confidence
        </span>
        <span className={`ml-auto flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${cat.text}`}>
          Explore
          <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
        </span>
        </div>
      </div>
    </Link>
  );
}

function DocIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3 4.5 6v5.5c0 4.7 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.8 7.5-9.5V6L12 3Z" />
      <path d="m9.5 12 1.8 1.8L15 10" />
    </svg>
  );
}
