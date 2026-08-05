import Link from "next/link";
import type { Technology, Update } from "@/lib/types";

/**
 * Section 2 — Hot Topics feed.
 * A dense, scannable list of the latest iterations across featured technologies
 * (AI models + key frameworks). Each row deep-links to the topic page.
 */
export default function HotTopicsFeed({
  items,
}: {
  // Each update is pre-joined with its parent technology for labelling/links.
  items: (Update & { technology: Pick<Technology, "name" | "slug" | "accent_color"> })[];
}) {
  if (items.length === 0) return null;

  return (
    <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 sm:pb-24">
      <div className="mb-5 flex items-center gap-2.5 sm:mb-6 sm:gap-3">
        <span className="h-2 w-2 rounded-full bg-violet-400 shadow-glow-violet" />
        <h2 className="text-xl font-semibold tracking-tight text-zinc-100 sm:text-2xl">
          Hot Topics — latest iterations
        </h2>
      </div>

      <div className="glass divide-y divide-white/5 overflow-hidden rounded-2xl">
        {items.map((u) => (
          <Link
            key={u.id}
            href={`/?topic=${u.technology.slug}`}
            scroll={false}
            className="group flex items-center gap-3 px-4 py-3.5 transition hover:bg-white/[0.04] sm:gap-4 sm:px-5 sm:py-4"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-white/5 px-2 py-0.5 text-xs font-medium text-zinc-300">
                  {u.technology.name}
                </span>
                {u.version && (
                  <span className="text-xs text-zinc-500">v{u.version}</span>
                )}
                {/* On phones the trailing date column is dropped — show it inline instead */}
                <span className="text-xs text-zinc-600 sm:hidden">
                  {u.published_at ? new Date(u.published_at).toLocaleDateString() : ""}
                </span>
              </div>
              <p className="mt-1 truncate text-sm font-medium text-zinc-100 group-hover:text-white">
                {u.title}
              </p>
              {u.summary && (
                <p className="mt-0.5 line-clamp-1 text-sm text-zinc-500">
                  {u.summary}
                </p>
              )}
            </div>
            <span className="hidden shrink-0 text-xs text-zinc-500 sm:block">
              {u.published_at
                ? new Date(u.published_at).toLocaleDateString()
                : ""}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
