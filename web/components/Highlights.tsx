import Link from "next/link";
import type { AccentColor, Technology, Update } from "@/lib/types";
import Icon from "@/components/Icon";

/**
 * "This week's highlights" — the important releases (importance >= 4) from the last
 * 7 days, ranked by importance then recency, so big launches stay pinned for the week
 * instead of sinking under a stream of minor news. Each row opens the detail popup.
 */

type Item = Update & { technology: Pick<Technology, "name" | "slug" | "accent_color"> };

const ACCENT: Record<AccentColor, { text: string; dot: string }> = {
  violet: { text: "text-violet-300", dot: "bg-violet-400" },
  cyan: { text: "text-cyan-300", dot: "bg-cyan-400" },
  emerald: { text: "text-emerald-300", dot: "bg-emerald-400" },
};

export default function Highlights({ items }: { items: Item[] }) {
  if (!items.length) return null;

  return (
    <section className="mx-auto max-w-6xl px-6 pb-4 pt-8">
      <div className="mb-6 flex items-center gap-3">
        <span className="text-zinc-100">
          <Icon name="fire" className="h-5 w-5" />
        </span>
        <h2 className="text-2xl font-semibold tracking-tight text-zinc-100">
          This week&apos;s highlights
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {items.map((u) => {
          const accent = ACCENT[u.technology.accent_color] ?? ACCENT.violet;
          const major = (u.importance ?? 0) >= 5;
          return (
            <Link
              key={u.id}
              href={`/?topic=${u.technology.slug}`}
              scroll={false}
              className="glass group flex flex-col rounded-2xl p-5 transition hover:-translate-y-0.5 hover:border-white/20"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-sm font-medium text-zinc-300">
                  <span className={`h-1.5 w-1.5 rounded-full ${accent.dot}`} />
                  {u.technology.name}
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    major
                      ? "bg-amber-500/15 text-amber-300"
                      : "bg-white/5 text-zinc-400"
                  }`}
                >
                  {major ? "Major release" : "Notable"}
                </span>
              </div>

              <p className={`mt-2 font-medium text-zinc-100 transition-colors group-hover:${accent.text}`}>
                {u.title}
              </p>
              {u.summary && (
                <p className="mt-1 line-clamp-2 text-sm text-zinc-500">{u.summary}</p>
              )}
              <span className="mt-3 text-xs text-zinc-600">
                {u.published_at ? new Date(u.published_at).toLocaleDateString() : ""}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
