/** Presentation helpers for intelligence data — labels, colours, formatting. Pure. */
import type { ClaimStatus, ClaimType, EntityType, EventType, Stance, WatchKind } from "./intelligence-types";

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  PRODUCT_LAUNCH: "Product launch", MODEL_RELEASE: "Model release", FUNDING: "Funding", ACQUISITION: "Acquisition",
  PARTNERSHIP: "Partnership", INVESTMENT: "Investment", LEADERSHIP_CHANGE: "Leadership change", EARNINGS: "Earnings",
  REGULATION: "Regulation", LAWSUIT: "Lawsuit", RESEARCH_BREAKTHROUGH: "Research", CHIP_DEVELOPMENT: "Chips",
  INFRASTRUCTURE_EXPANSION: "Infrastructure", LAYOFF: "Layoffs", IPO: "IPO", SECURITY_INCIDENT: "Security incident",
  OPEN_SOURCE_RELEASE: "Open source", POLICY_STATEMENT: "Policy", OTHER: "Development",
};

export const ENTITY_TYPE_LABEL: Record<EntityType, string> = {
  PERSON: "Person", COMPANY: "Company", TECHNOLOGY: "Technology", PRODUCT: "Product", ORGANIZATION: "Organization",
  INVESTOR: "Investor", STARTUP: "Startup", RESEARCH_LAB: "Research lab", GOVERNMENT: "Government", FUND: "Fund",
  INDUSTRY: "Industry",
};

export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  UNVERIFIED: "Unverified", REPORTED: "Reported", PARTIALLY_CONFIRMED: "Partially confirmed", CONFIRMED: "Confirmed",
  DISPUTED: "Disputed", FALSE: "False", SUPERSEDED: "Superseded",
};

export const CLAIM_TYPE_LABEL: Record<ClaimType, string> = {
  FACT: "Fact", REPORTED: "Reported", RUMOR: "Rumor", OPINION: "Opinion", PREDICTION: "Prediction",
};

export const WATCH_KIND_LABEL: Record<WatchKind, string> = {
  UPCOMING_KNOWN_EVENT: "Upcoming", EMERGING_SIGNAL: "Emerging signal", SPECULATIVE_POSSIBILITY: "Speculative",
};

/** Tailwind classes per claim status — muted, semantic, no neon. */
export const CLAIM_STATUS_CLASS: Record<ClaimStatus, string> = {
  CONFIRMED: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30",
  PARTIALLY_CONFIRMED: "bg-teal-500/15 text-teal-300 ring-teal-400/30",
  REPORTED: "bg-sky-500/15 text-sky-300 ring-sky-400/30",
  UNVERIFIED: "bg-zinc-500/15 text-zinc-300 ring-zinc-400/30",
  DISPUTED: "bg-amber-500/15 text-amber-300 ring-amber-400/30",
  FALSE: "bg-rose-500/15 text-rose-300 ring-rose-400/30",
  SUPERSEDED: "bg-zinc-500/10 text-zinc-500 ring-zinc-500/20",
};

export const STANCE_CLASS: Record<Stance, string> = {
  SUPPORTS: "text-emerald-300", CONTRADICTS: "text-rose-300", MENTIONS: "text-zinc-400", UNCLEAR: "text-zinc-500",
};

export function confidenceLabel(c: number): "Low" | "Medium" | "High" {
  return c >= 0.75 ? "High" : c >= 0.45 ? "Medium" : "Low";
}

export function confidenceClass(c: number): string {
  return c >= 0.75 ? "text-emerald-300" : c >= 0.45 ? "text-amber-300" : "text-zinc-400";
}

export function importanceTier(s: number): "Critical" | "Major" | "Notable" | "Minor" {
  return s >= 80 ? "Critical" : s >= 60 ? "Major" : s >= 35 ? "Notable" : "Minor";
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 60) return `${Math.max(m, 1)}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function humanize(value: string): string {
  return value.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}
