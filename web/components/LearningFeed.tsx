"use client";

import { useMemo, useState } from "react";
import type { LearningResource, LearningKind } from "@/lib/types";
import LearningCard from "./LearningCard";

/**
 * Filterable grid of learning resources. Client-side filtering over the full set,
 * so switching kinds is instant. Mirrors OpportunitiesFeed / JobsFeed.
 */

const KIND_TABS: { key: LearningKind | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "course", label: "📘 Courses" },
  { key: "certification", label: "📜 Certifications" },
  { key: "talk", label: "🎤 Talks" },
];

export default function LearningFeed({ items }: { items: LearningResource[] }) {
  const [kind, setKind] = useState<LearningKind | "all">("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((r) => {
      if (kind !== "all" && r.kind !== kind) return false;
      if (q) {
        const hay = [r.title, r.provider ?? "", ...r.topics].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, kind, query]);

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search courses, certifications or topics (e.g. Azure, AI)…"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition focus:border-white/20 focus:bg-white/10"
        />
        <div className="flex flex-wrap gap-2">
          {KIND_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setKind(t.key)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                kind === t.key
                  ? "bg-white/90 text-canvas"
                  : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-zinc-500">
          No resources match these filters yet — try clearing the search.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((r) => (
            <LearningCard key={r.id} item={r} />
          ))}
        </div>
      )}
    </div>
  );
}
