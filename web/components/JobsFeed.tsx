"use client";

import { useMemo, useState } from "react";
import type { Job } from "@/lib/types";
import JobCard from "./JobCard";

/**
 * Filterable grid of jobs. Filtering is client-side over the full set passed from
 * the server, so toggling filters is instant with no extra requests. Mirrors
 * OpportunitiesFeed's interaction model.
 */

const LEVEL_TABS: { key: "all" | "fresher"; label: string }[] = [
  { key: "all", label: "All roles" },
  { key: "fresher", label: "🌱 Fresher-friendly" },
];

const REGION_TABS: { key: "all" | "india" | "global"; label: string }[] = [
  { key: "all", label: "🌐 Everywhere" },
  { key: "india", label: "🇮🇳 India" },
  { key: "global", label: "✈️ Global" },
];

export default function JobsFeed({ items }: { items: Job[] }) {
  const [level, setLevel] = useState<"all" | "fresher">("all");
  const [region, setRegion] = useState<"all" | "india" | "global">("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((j) => {
      if (level === "fresher" && !j.is_fresher) return false;
      if (region === "india" && j.country !== "India") return false;
      if (region === "global" && j.country === "India") return false;
      if (q) {
        const hay = [j.title, j.company ?? "", ...j.skills, ...j.tags].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, level, region, query]);

  return (
    <div>
      {/* Filters */}
      <div className="mb-6 flex flex-col gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search role, company or skill (e.g. React, Python)…"
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
        <div className="flex flex-wrap gap-2">
          {REGION_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setRegion(t.key)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                region === t.key
                  ? "bg-white/10 text-zinc-100 ring-1 ring-white/20"
                  : "bg-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-zinc-500">
          No jobs match these filters yet — try clearing the search or check back after the next
          refresh.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((j) => (
            <JobCard key={j.id} job={j} />
          ))}
        </div>
      )}
    </div>
  );
}
