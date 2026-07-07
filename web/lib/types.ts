/**
 * Shared domain types — mirror the Supabase schema in supabase/schema.sql.
 * Reuse these across web (and later a mobile app) so the data contract stays single-sourced.
 */

export type AccentColor = "violet" | "cyan" | "emerald";

export type Category = "Frontier Models" | "Languages" | "Frameworks" | string;

/** A tracked language / framework / model — one card on the grid. */
export interface Technology {
  id: string;
  slug: string;
  name: string;
  category: Category;
  tagline: string | null;
  description: string | null;
  image_url: string | null;
  homepage_url: string | null;
  current_version: string | null;
  accent_color: AccentColor;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
}

/** A scraped changelog entry attached to a Technology. */
export interface Update {
  id: string;
  technology_id: string;
  title: string;
  summary: string | null;
  version: string | null;
  /** 1-5 importance score set by the scraper (5 = major launch). Optional until scored. */
  importance?: number;
  source_url: string;
  published_at: string | null;
  created_at: string;
}

/** A technology joined with its recent updates — used on the deep-dive page. */
export interface TechnologyWithUpdates extends Technology {
  updates: Update[];
}

/**
 * A fresher-focused remote tech job (RemoteOK / We Work Remotely). Independent of
 * Technology and Opportunity. Mirrors public.jobs in supabase/schema.sql.
 */
export interface Job {
  id: string;
  slug: string | null;
  title: string;
  company: string | null;
  location: string | null;
  country: string | null;
  is_remote: boolean;
  is_fresher: boolean;
  experience: string | null;
  skills: string[];
  salary: string | null;
  apply_url: string;
  source: string | null;
  tags: string[];
  description: string | null;
  posted_at: string | null;
  created_at: string;
  updated_at: string;
}

/** A free learning resource: course, video, conference talk, or certification. */
export type LearningKind = "course" | "video" | "talk" | "certification";

export interface LearningResource {
  id: string;
  slug: string | null;
  title: string;
  kind: LearningKind;
  provider: string | null;
  url: string;
  description: string | null;
  level: string | null;
  topics: string[];
  is_free: boolean;
  has_certificate: boolean;
  duration: string | null;
  image_url: string | null;
  source: string | null;
  is_featured: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

/** A trending / notable open-source repository to learn from or contribute to. */
export interface Repo {
  id: string;
  slug: string | null;
  name: string;
  owner: string | null;
  url: string;
  description: string | null;
  language: string | null;
  stars: number;
  topics: string[];
  is_good_first_issue: boolean;
  source: string | null;
  pushed_at: string | null;
  created_at: string;
  updated_at: string;
}

/** The kinds of opportunity the platform tracks. */
export type OpportunityKind =
  | "hackathon"
  | "competition"
  | "conference"
  | "internship"
  | "job"
  | "scholarship";

/**
 * A fresher-focused opportunity: a hackathon, competition, conference,
 * internship, job, or scholarship. Independent of Technology.
 */
export interface Opportunity {
  id: string;
  slug: string | null;
  title: string;
  kind: OpportunityKind;
  organizer: string | null;
  description: string | null;
  location: string | null;
  country: string | null;
  is_remote: boolean;
  eligibility: string | null;
  prize: string | null;
  deadline: string | null;
  starts_at: string | null;
  source_url: string;
  image_url: string | null;
  tags: string[];
  accent_color: AccentColor;
  is_curated: boolean;
  is_featured: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}
