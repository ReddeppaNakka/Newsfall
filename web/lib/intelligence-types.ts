/**
 * Intelligence-layer domain types — mirror supabase/migrations/001_intelligence_foundation.sql.
 * Kept in a separate module from lib/types.ts so the legacy contract is untouched.
 */

export type EntityType =
  | "PERSON" | "COMPANY" | "TECHNOLOGY" | "PRODUCT" | "ORGANIZATION" | "INVESTOR"
  | "STARTUP" | "RESEARCH_LAB" | "GOVERNMENT" | "FUND" | "INDUSTRY";

export type EventType =
  | "PRODUCT_LAUNCH" | "MODEL_RELEASE" | "FUNDING" | "ACQUISITION" | "PARTNERSHIP" | "INVESTMENT"
  | "LEADERSHIP_CHANGE" | "EARNINGS" | "REGULATION" | "LAWSUIT" | "RESEARCH_BREAKTHROUGH"
  | "CHIP_DEVELOPMENT" | "INFRASTRUCTURE_EXPANSION" | "LAYOFF" | "IPO" | "SECURITY_INCIDENT"
  | "OPEN_SOURCE_RELEASE" | "POLICY_STATEMENT" | "OTHER";

export type EventStatus = "ACTIVE" | "UPDATED" | "SUPERSEDED" | "CONTRADICTED" | "RESOLVED";
export type ClaimType = "FACT" | "REPORTED" | "RUMOR" | "OPINION" | "PREDICTION";
export type ClaimStatus =
  | "UNVERIFIED" | "REPORTED" | "PARTIALLY_CONFIRMED" | "CONFIRMED" | "DISPUTED" | "FALSE" | "SUPERSEDED";
export type Stance = "SUPPORTS" | "CONTRADICTS" | "MENTIONS" | "UNCLEAR";
export type WatchKind = "UPCOMING_KNOWN_EVENT" | "EMERGING_SIGNAL" | "SPECULATIVE_POSSIBILITY";

export interface Source {
  id: string;
  slug: string;
  name: string;
  organization: string | null;
  domain: string | null;
  homepage_url: string | null;
  source_type: string;
  source_category: string;
  credibility_score: number;
  is_primary_source: boolean;
}

export interface Entity {
  id: string;
  slug: string;
  name: string;
  entity_type: EntityType;
  description: string | null;
  official_url: string | null;
  image_url: string | null;
  aliases: string[];
  influence_score: number;
  mention_count: number;
  technology_id: string | null;
  created_at: string;
  updated_at: string;
}

export type EntityRef = Pick<Entity, "id" | "slug" | "name" | "entity_type" | "influence_score"> &
  Partial<Pick<Entity, "official_url" | "image_url">>;

export interface Scenario {
  scenario: string;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  supporting: string[];
  counter: string[];
  signals: string[];
}

export interface IntelEvent {
  id: string;
  slug: string;
  title: string;
  event_type: EventType;
  summary: string | null;
  status: EventStatus;
  occurred_at: string | null;
  first_seen_at: string;
  last_updated_at: string;
  importance_score: number;
  confidence_score: number;
  score_breakdown: Record<string, number>;
  why_it_matters: string | null;
  industry_impact: string | null;
  intelligence_summary: string | null;
  what_to_watch: string[];
  scenarios: Scenario[];
  article_count: number;
  source_count: number;
  independent_source_count: number;
  primary_source_confirmed: boolean;
  has_contradiction: boolean;
  analyzed_at: string | null;
  /** Primary source's og:image (migration 002); optional until backfilled. */
  image_url?: string | null;
}

export interface EventWithEntities extends IntelEvent {
  entities: (EntityRef & { role: string })[];
}

export interface ArticlePublic {
  id: string;
  source_id: string | null;
  title: string;
  url: string;
  author: string | null;
  summary: string | null;
  published_at: string | null;
  source_name: string | null;
  source_type: string | null;
  credibility_score: number | null;
  is_primary_source: boolean | null;
  image_url?: string | null;
}

export interface ClaimEvidence {
  id: string;
  claim_id: string;
  article_id: string;
  stance: Stance;
  excerpt: string | null;
  credibility_weight: number;
  confidence: number;
  source: Pick<Source, "name" | "source_type" | "credibility_score" | "is_primary_source"> | null;
}

export interface Claim {
  id: string;
  claim_text: string;
  claim_type: ClaimType;
  status: ClaimStatus;
  confidence: number;
  source_context: string | null;
  subject: Pick<Entity, "name" | "slug"> | null;
  object: Pick<Entity, "name" | "slug"> | null;
  evidence: ClaimEvidence[];
}

export interface Relationship {
  id: string;
  relationship_type: string;
  confidence: number;
  status: string;
  valid_from: string | null;
  source: EntityRef;
  target: EntityRef;
}

export interface WatchItem {
  id: string;
  title: string;
  reason: string | null;
  kind: WatchKind;
  event_id: string | null;
  confidence: number;
  expected_timeframe: string | null;
  status: string;
  created_at: string;
  event?: Pick<IntelEvent, "slug" | "title"> | null;
}

export interface BriefingSection {
  heading: string;
  body: string;
  event_slugs: string[];
}

export interface IntelligenceReport {
  id: string;
  kind: string;
  period_start: string;
  period_end: string;
  title: string;
  content: {
    title?: string;
    most_important?: BriefingSection;
    why_it_matters?: BriefingSection;
    industry_shift?: BriefingSection;
    people_of_influence?: BriefingSection;
    emerging_signals?: BriefingSection;
    what_to_watch?: BriefingSection;
  };
  created_at: string;
}

/** Search hit returned by /api/search and used to ground /ask. */
export interface SearchHit {
  kind: "event" | "article" | "entity";
  id: string;
  title: string;
  href: string;
  snippet: string | null;
  score: number;
  meta?: Record<string, unknown>;
}

export interface AskResponse {
  answer: string;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  key_evidence: SearchHit[];
  related_events: SearchHit[];
  related_entities: SearchHit[];
  uncertainties: string[];
  what_to_watch: string[];
  grounded: boolean;
}
