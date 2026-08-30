import Link from "next/link";
import type { WatchItem } from "@/lib/intelligence-types";
import { WATCH_KIND_LABEL } from "@/lib/format";
import SectionHeading from "./SectionHeading";

/** WHAT TO WATCH NEXT — a vertical intelligence watchlist with small nodes and a hairline. */
export default function WatchNext({ items }: { items: WatchItem[] }) {
  if (!items.length) return null;
  return (
    <section className="flex flex-col rounded-lg border border-white/[0.07] bg-surface p-5 sm:p-6">
      <SectionHeading title="WHAT TO WATCH NEXT" icon={<EyeIcon />} />
      <ol className="relative ml-4 border-l border-white/[0.08]">
        {items.map((w) => {
          const impact = w.confidence >= 0.6 ? "HIGH" : w.confidence >= 0.35 ? "MEDIUM" : "LOW";
          const href = w.event ? `/events/${w.event.slug}` : "/intelligence";
          return (
            <li key={w.id} className="relative pb-6 pl-8 last:pb-0">
              <span className="absolute -left-[13px] top-0 flex h-[26px] w-[26px] items-center justify-center rounded-full border border-white/[0.12] bg-[#0f1016] text-zinc-400">
                <KindIcon kind={w.kind} />
              </span>
              <Link href={href} className="group flex items-start justify-between gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60">
                <div className="min-w-0">
                  <p className="text-[15px] font-medium leading-snug text-zinc-50 group-hover:text-white">{w.title}</p>
                  <p className="mt-1 text-[12px] text-zinc-500">
                    {w.expected_timeframe ?? WATCH_KIND_LABEL[w.kind]}
                    {w.event && <><span className="mx-1.5 text-zinc-700">·</span><span className="text-zinc-500">{w.event.title.length > 42 ? w.event.title.slice(0, 42) + "…" : w.event.title}</span></>}
                  </p>
                </div>
                <span className={`shrink-0 rounded px-2 py-1 text-[9px] font-semibold tracking-[0.14em] ${
                  impact === "HIGH" ? "bg-violet-500/15 text-violet-200" : "bg-white/[0.05] text-zinc-300"
                }`}>{impact} IMPACT</span>
              </Link>
            </li>
          );
        })}
      </ol>
      <Link href="/intelligence" className="group mt-5 flex items-center gap-1.5 self-center text-[12px] text-violet-300 transition hover:text-violet-200">
        View full watchlist <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
      </Link>
    </section>
  );
}

function EyeIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.75" />
    </svg>
  );
}

function KindIcon({ kind }: { kind: WatchItem["kind"] }) {
  const d = kind === "UPCOMING_KNOWN_EVENT"
    ? "M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"
    : kind === "SPECULATIVE_POSSIBILITY"
      ? "M12 3v3m0 12v3M3 12h3m12 0h3M6.3 6.3l2.1 2.1m7.2 7.2 2.1 2.1m0-11.4-2.1 2.1m-7.2 7.2-2.1 2.1"
      : "M4 18l5-6 4 3 7-9";
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}
