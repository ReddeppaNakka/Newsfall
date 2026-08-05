"use client";

import { useMemo, useState } from "react";
import type { Technology } from "@/lib/types";
import TechCard from "./TechCard";

/**
 * Searchable, filterable technology explorer. Replaces the plain grid so users can
 * FIND any tracked technology instead of scrolling. Search + category filtering run
 * client-side over the full list passed from the server, so it's instant.
 */
export default function TechExplorer({ techs }: { techs: Technology[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");

  const categories = useMemo(
    () => ["all", ...Array.from(new Set(techs.map((t) => t.category))).sort()],
    [techs],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return techs.filter((t) => {
      if (category !== "all" && t.category !== category) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.slug.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        (t.tagline?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [techs, query, category]);

  // Group the filtered results by category, preserving first-seen order.
  const groups = filtered.reduce<Record<string, Technology[]>>((acc, t) => {
    (acc[t.category] ??= []).push(t);
    return acc;
  }, {});

  return (
    <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16">
      <div className="mb-6">
        <h2 className="text-xl font-semibold tracking-tight text-zinc-100 sm:text-2xl">
          Explore technologies
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          {techs.length} tracked · search or filter to find any of them
        </p>
      </div>

      {/* Search box */}
      <div className="relative mb-4">
        <svg
          className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
            clipRule="evenodd"
          />
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search technologies…"
          className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-11 pr-11 text-base text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-white/25 sm:text-sm"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-zinc-500 transition hover:text-zinc-200"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        )}
      </div>

      {/* Category filter chips */}
      <div className="no-scrollbar -mx-4 mb-8 flex snap-x gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:mb-10 sm:flex-wrap sm:overflow-visible sm:px-0">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`shrink-0 snap-start whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-medium transition sm:py-1.5 ${
              category === c
                ? "bg-white/90 text-canvas"
                : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
            }`}
          >
            {c === "all" ? "All" : c}
          </button>
        ))}
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-zinc-500">
          No technologies match{query ? ` “${query}”` : " these filters"} yet.
        </p>
      ) : (
        Object.entries(groups).map(([cat, items]) => (
          <div key={cat} className="mb-10 last:mb-0 sm:mb-14">
            <div className="mb-4 flex items-end justify-between gap-3 sm:mb-6">
              <h3 className="min-w-0 truncate text-lg font-semibold tracking-tight text-zinc-100 sm:text-xl">{cat}</h3>
              <span className="shrink-0 text-sm text-zinc-500">{items.length}</span>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
              {items.map((tech) => (
                <TechCard key={tech.id} tech={tech} />
              ))}
            </div>
          </div>
        ))
      )}
    </section>
  );
}
