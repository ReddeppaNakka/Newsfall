"use client";

import { useMemo, useState } from "react";
import type { Opportunity, OpportunityKind } from "@/lib/types";
import Icon, { type IconName } from "@/components/Icon";
import OpportunityCard from "./OpportunityCard";

/**
 * Filterable grid of opportunities. Filtering is client-side over the full set
 * passed from the server, so switching tabs is instant with no extra requests.
 */

const KIND_TABS: { key: OpportunityKind | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "hackathon", label: "Hackathons" },
  { key: "competition", label: "Competitions" },
  { key: "conference", label: "Conferences" },
  { key: "internship", label: "Internships" },
  { key: "job", label: "Jobs" },
  { key: "scholarship", label: "Scholarships" },
];

const REGION_TABS: { key: "all" | "india" | "global"; label: string; icon?: IconName }[] = [
  { key: "all", label: "Everywhere", icon: "globe" },
  { key: "india", label: "India", icon: "flag" },
  { key: "global", label: "Global", icon: "plane" },
];

export default function OpportunitiesFeed({ items }: { items: Opportunity[] }) {
  const [kind, setKind] = useState<OpportunityKind | "all">("all");
  const [region, setRegion] = useState<"all" | "india" | "global">("all");

  const filtered = useMemo(() => {
    return items.filter((o) => {
      if (kind !== "all" && o.kind !== kind) return false;
      if (region === "india" && o.country !== "India") return false;
      if (region === "global" && o.country === "India") return false;
      return true;
    });
  }, [items, kind, region]);

  return (
    <div>
      {/* Filters */}
      <div className="mb-6 flex flex-col gap-3">
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
        <div className="flex flex-wrap gap-2">
          {REGION_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setRegion(t.key)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                region === t.key
                  ? "bg-white/10 text-zinc-100 ring-1 ring-white/20"
                  : "bg-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {t.icon && <Icon name={t.icon} className="h-4 w-4" />} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-zinc-500">
          No opportunities match these filters yet — check back after the next refresh.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((o) => (
            <OpportunityCard key={o.id} opp={o} />
          ))}
        </div>
      )}
    </div>
  );
}
