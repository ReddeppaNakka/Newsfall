/**
 * Editorial categories derived from event_type — the label a reader sees on a card
 * ("AI INFRASTRUCTURE", "SEMICONDUCTORS") and a restrained accent colour per category.
 */
import type { EventType, IntelEvent } from "./intelligence-types";

export interface Category {
  key: string;
  label: string;
  /** Tailwind classes: category text, importance badge ring/text, underline, hover ring. */
  text: string;
  badge: string;
  rule: string;
  chip: string;
}

const C = (key: string, label: string, hue: string): Category => ({
  key,
  label,
  text: `text-${hue}-300`,
  badge: `border-${hue}-400/40 text-${hue}-200`,
  rule: `bg-${hue}-400`,
  chip: `border-${hue}-400/25 text-${hue}-200/90`,
});

// Static class strings so Tailwind's JIT keeps them (see safelist in tailwind.config.ts).
export const CATEGORIES: Record<string, Category> = {
  infrastructure: C("infrastructure", "AI Infrastructure", "amber"),
  semiconductors: C("semiconductors", "Semiconductors", "orange"),
  research: C("research", "AI Research", "violet"),
  security: C("security", "Cybersecurity", "emerald"),
  capital: C("capital", "Markets & Capital", "sky"),
  policy: C("policy", "Policy & Regulation", "rose"),
  products: C("products", "Products & Platforms", "teal"),
  people: C("people", "Companies & People", "fuchsia"),
  technology: C("technology", "Technology", "zinc"),
};

const BY_TYPE: Record<EventType, keyof typeof CATEGORIES> = {
  INFRASTRUCTURE_EXPANSION: "infrastructure",
  CHIP_DEVELOPMENT: "semiconductors",
  MODEL_RELEASE: "research",
  RESEARCH_BREAKTHROUGH: "research",
  SECURITY_INCIDENT: "security",
  FUNDING: "capital",
  ACQUISITION: "capital",
  INVESTMENT: "capital",
  IPO: "capital",
  EARNINGS: "capital",
  REGULATION: "policy",
  LAWSUIT: "policy",
  POLICY_STATEMENT: "policy",
  PRODUCT_LAUNCH: "products",
  OPEN_SOURCE_RELEASE: "products",
  PARTNERSHIP: "products",
  LEADERSHIP_CHANGE: "people",
  LAYOFF: "people",
  OTHER: "technology",
};

export function categoryFor(eventType: EventType | string): Category {
  return CATEGORIES[BY_TYPE[eventType as EventType] ?? "technology"];
}

/**
 * Homepage ranking by intelligence value, not timestamp: importance carries most of the
 * weight, confidence and corroboration lift verified developments, recency decays gently
 * so an older-but-major event can outrank a fresh trivial one.
 */
export function rankScore(e: IntelEvent, now = Date.now()): number {
  const ageH = Math.max(0, (now - new Date(e.last_updated_at).getTime()) / 36e5);
  const recency = Math.max(0, 1 - ageH / 96); // fades over 4 days
  const corroboration = Math.min(1, e.independent_source_count / 4);
  return (
    Number(e.importance_score) * 0.6 +
    Number(e.confidence_score) * 100 * 0.2 +
    corroboration * 100 * 0.1 +
    recency * 100 * 0.1 +
    (e.analyzed_at ? 5 : 0)
  );
}

/** First sentence of the best available context line, trimmed for a card subtitle. */
export function subtitleFor(e: IntelEvent, max = 150): string | null {
  const src = e.why_it_matters || e.summary;
  if (!src) return null;
  const first = src.split(/(?<=[.!?])\s+/)[0] ?? src;
  if (first.length <= max) return first;
  const cut = first.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(" ")) + "…";
}
