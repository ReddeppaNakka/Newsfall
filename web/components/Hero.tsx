import Link from "next/link";
import type { Update, Technology } from "@/lib/types";

/**
 * High-impact hero header.
 * Shows a live, auto-generated summary line plus the freshest few headlines
 * so the homepage always reflects the latest scrape. Each headline opens the
 * detail popup (via /?topic=<slug>) rather than the external source link.
 */
export default function Hero({
  totalTracked,
  latest,
}: {
  totalTracked: number;
  // Each update is pre-joined with its parent technology's slug.
  latest: (Update & { technology: Pick<Technology, "slug"> })[];
}) {
  return (
    <header className="relative mx-auto max-w-6xl px-4 pb-8 pt-10 text-center sm:px-6 sm:pb-10 sm:pt-16 md:pt-20">
      <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-zinc-300 backdrop-blur sm:px-4 sm:text-xs">
        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-emerald-400" />
        Live · auto-updated daily · tracking {totalTracked} technologies
      </span>

      <h1 className="mx-auto mt-5 max-w-3xl bg-gradient-to-br from-white via-zinc-200 to-zinc-500 bg-clip-text text-[2rem] font-bold leading-[1.15] tracking-tight text-transparent animate-fade-up sm:mt-6 sm:text-5xl sm:leading-tight md:text-6xl">
        The pulse of frontier AI & modern tech
      </h1>

      <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-relaxed text-zinc-400 animate-fade-up sm:mt-5 sm:text-lg">
        Every model release, language version, and framework update — scraped,
        structured, and surfaced automatically. No stale docs, no manual edits.
      </p>

      {/* Latest headline ticker */}
      {latest.length > 0 && (
        <div className="mx-auto mt-8 flex max-w-3xl flex-col gap-2 text-left sm:mt-10">
          {latest.map((u) => (
            <Link
              key={u.id}
              href={`/?topic=${u.technology.slug}`}
              scroll={false}
              className="glass group flex items-center justify-between gap-3 rounded-xl px-3.5 py-3 text-sm transition hover:border-white/20 sm:px-4"
            >
              <span className="truncate text-zinc-200">{u.title}</span>
              <span className="shrink-0 text-[11px] text-zinc-500 group-hover:text-zinc-300 sm:text-xs">
                {u.published_at
                  ? new Date(u.published_at).toLocaleDateString()
                  : "new"}
              </span>
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}
