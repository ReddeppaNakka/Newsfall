import Link from "next/link";
import type { EventWithEntities } from "@/lib/intelligence-types";
import { subtitleFor } from "@/lib/category";
import { confidenceLabel } from "@/lib/format";
import EditorialVisual from "./EditorialVisual";

/**
 * THE BIG STORY — a magazine-cover hero. Left: label, very large serif headline,
 * one contextual sentence, a compact metric row, "Explore the story". Right/back:
 * a cinematic visual fading into the page. The whole hero is one link to the event.
 */
export default function BigStory({ event }: { event: EventWithEntities }) {
  const importance = Math.round(Number(event.importance_score));
  const sources = event.source_count || event.article_count;
  const conf = confidenceLabel(Number(event.confidence_score)).toUpperCase();
  const subtitle = subtitleFor(event, 170);

  return (
    <Link
      href={`/events/${event.slug}`}
      aria-label={`The big story: ${event.title}. Explore the story.`}
      className="group relative block overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
    >
      {/* Visual: right ~60% on desktop, top band on mobile */}
      <div className="relative h-[240px] sm:h-[300px] md:absolute md:inset-y-0 md:right-0 md:h-auto md:w-[62%]">
        <EditorialVisual src={event.image_url} eventType={event.event_type} className="h-full w-full" priority sizes="(max-width: 768px) 100vw, 62vw" />
        {/* Fade into the page: bottom on mobile, left + bottom on desktop */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-canvas via-canvas/40 to-transparent md:bg-gradient-to-r md:from-canvas md:via-canvas/55 md:to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 hidden h-28 bg-gradient-to-t from-canvas to-transparent md:block" />
      </div>

      {/* Copy */}
      <div className="relative px-6 pb-10 pt-2 sm:px-10 md:min-h-[440px] md:max-w-[58%] md:pb-14 md:pt-14">
        <p className="flex items-center gap-3 text-[11px] font-semibold tracking-[0.22em] text-violet-300">
          THE BIG STORY
          <span className="h-px w-10 bg-violet-300/40" />
        </p>
        <h1 className={`mt-5 font-serif leading-[1.04] tracking-[-0.01em] text-white ${
          event.title.length > 70 ? "text-[2.2rem] sm:text-[2.8rem] lg:text-[3.3rem]" : "text-[2.6rem] sm:text-[3.4rem] lg:text-[4rem]"
        }`}>
          {event.title}
        </h1>
        {subtitle && <p className="mt-5 max-w-md text-[15px] leading-relaxed text-zinc-400 sm:text-base">{subtitle}</p>}

        <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-4 sm:gap-x-7">
          <Metric value={String(importance)} label="IMPORTANCE" ring={importance} />
          <span className="hidden h-9 w-px bg-white/10 sm:block" />
          <Metric value={String(sources)} label="SOURCES" />
          <span className="hidden h-9 w-px bg-white/10 sm:block" />
          <Metric value={conf} label="CONFIDENCE" icon />
        </div>

        <p className="mt-9 flex items-center gap-2 text-[12px] font-semibold tracking-[0.2em] text-zinc-100">
          EXPLORE THE STORY
          <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-1">→</span>
        </p>
      </div>
    </Link>
  );
}

function Metric({ value, label, ring, icon }: { value: string; label: string; ring?: number; icon?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      {ring != null && (
        <svg className="h-9 w-9 -rotate-90" viewBox="0 0 36 36" aria-hidden>
          <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2" />
          <circle cx="18" cy="18" r="15.5" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round"
            strokeDasharray={`${(Math.max(0, Math.min(100, ring)) / 100) * 97.4} 97.4`} />
        </svg>
      )}
      {icon && (
        <span className="flex h-9 w-9 items-center justify-center rounded-full border border-emerald-400/30 text-emerald-300">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 4.5 6v5.5c0 4.7 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.8 7.5-9.5V6L12 3Z" /><path d="m9.5 12 1.8 1.8L15 10" /></svg>
        </span>
      )}
      <div className="leading-none">
        <div className={`font-sans text-zinc-50 ${icon ? "text-[13px] font-semibold tracking-[0.12em]" : "text-[22px] font-medium tabular-nums"}`}>{value}</div>
        <div className="mt-1.5 text-[9px] font-semibold tracking-[0.18em] text-zinc-500">{label}</div>
      </div>
    </div>
  );
}
