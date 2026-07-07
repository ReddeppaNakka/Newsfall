"use client";

import { useMemo, useState } from "react";
import type { Repo } from "@/lib/types";
import RepoCard from "./RepoCard";

/**
 * Filterable grid of repos. Client-side over the full set. Level filter surfaces
 * beginner-friendly (good-first-issue) repos; language chips are derived from data.
 */

const LEVEL_TABS: { key: "all" | "beginner"; label: string }[] = [
  { key: "all", label: "All repos" },
  { key: "beginner", label: "🌱 Beginner-friendly" },
];

export default function ReposFeed({ items }: { items: Repo[] }) {
  const [level, setLevel] = useState<"all" | "beginner">("all");
  const [lang, setLang] = useState<string>("all");
  const [query, setQuery] = useState("");

  // Languages present in the data, most common first (capped for a tidy row).
  const languages = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of items) if (r.language) counts.set(r.language, (counts.get(r.language) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([l]) => l);
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((r) => {
      if (level === "beginner" && !r.is_good_first_issue) return false;
      if (lang !== "all" && r.language !== lang) return false;
      if (q) {
        const hay = [r.name, r.owner ?? "", r.description ?? "", ...r.topics].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, level, lang, query]);

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search repos by name, topic or description…"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition focus:border-white/20 focus:bg-white/10"
        />
        <div className="flex flex-wrap gap-2">
          {LEVEL_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setLevel(t.key)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                level === t.key
                  ? "bg-white/90 text-canvas"
                  : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {languages.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setLang("all")}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                lang === "all"
                  ? "bg-white/10 text-zinc-100 ring-1 ring-white/20"
                  : "bg-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              All languages
            </button>
            {languages.map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                  lang === l
                    ? "bg-white/10 text-zinc-100 ring-1 ring-white/20"
                    : "bg-transparent text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-zinc-500">
          No repos match these filters yet — try clearing the search.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((r) => (
            <RepoCard key={r.id} repo={r} />
          ))}
        </div>
      )}
    </div>
  );
}
