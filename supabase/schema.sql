-- ============================================================================
-- News_Pond — Supabase schema
-- Run this entire file once in the Supabase SQL Editor.
-- It is idempotent-ish: safe to re-run during development.
-- ============================================================================

-- Needed for gen_random_uuid()
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- TECHNOLOGIES
-- One row per tracked thing: a language, framework, or frontier model.
-- These are the cards on the homepage grid and the targets of /topic/[id].
-- ----------------------------------------------------------------------------
create table if not exists public.technologies (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,                 -- URL id, e.g. "claude-opus" -> /topic/claude-opus
  name            text not null,                        -- "Claude Opus"
  category        text not null,                        -- "Frontier Models" | "Languages" | "Frameworks"
  tagline         text,                                 -- short one-liner for the card
  description     text,                                 -- longer body for the deep-dive page
  image_url       text,                                 -- hero/card image
  homepage_url    text,                                 -- official site / docs
  current_version text,                                 -- "4.8" / "3.5 Flash" — shown as a badge
  accent_color    text default 'violet',                -- "violet" | "cyan" | "emerald" — drives the neon glow
  is_featured     boolean not null default false,       -- surfaced in the hot-topics feed
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists technologies_category_idx on public.technologies (category);
create index if not exists technologies_featured_idx  on public.technologies (is_featured);

-- ----------------------------------------------------------------------------
-- UPDATES
-- Time-ordered changelog entries scraped by the automation engine.
-- Many updates belong to one technology.
-- ----------------------------------------------------------------------------
create table if not exists public.updates (
  id            uuid primary key default gen_random_uuid(),
  technology_id uuid not null references public.technologies (id) on delete cascade,
  title         text not null,                          -- "Gemini 3.5 Flash released"
  summary       text,                                   -- LLM-condensed blurb
  version       text,                                   -- version this update introduces, if any
  source_url    text not null unique,                   -- canonical link; UNIQUE = natural dedupe key
  published_at  timestamptz,                            -- original publish time from the source
  created_at    timestamptz not null default now()
);

create index if not exists updates_technology_idx on public.updates (technology_id);
create index if not exists updates_published_idx  on public.updates (published_at desc);

-- Importance score 1-5 (5 = major launch/release, 1 = minor/tangential news). Set by the
-- scraper's LLM. Drives the "This week's highlights" section so big releases stay pinned.
alter table public.updates add column if not exists importance smallint not null default 1;
create index if not exists updates_importance_idx on public.updates (importance desc, published_at desc);

-- ----------------------------------------------------------------------------
-- OPPORTUNITIES
-- Hackathons, competitions, conferences, internships & entry-level jobs aimed
-- at freshers. India-first but global included. Populated by the automation
-- engine (curated JSON + scraped feeds). Independent of technologies.
-- ----------------------------------------------------------------------------
create table if not exists public.opportunities (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique,                            -- stable id for the detail page / dedupe
  title        text not null,                          -- "Smart India Hackathon 2025"
  kind         text not null,                          -- 'hackathon'|'competition'|'conference'|'internship'|'job'|'scholarship'
  organizer    text,                                   -- "AWS" / "Devfolio" / "MLH"
  description  text,                                   -- LLM-condensed blurb
  location     text,                                   -- "Online" | "Bengaluru, India" | "Las Vegas, USA"
  country      text,                                   -- "India" | "USA" | "Global"
  is_remote    boolean not null default false,         -- fully online?
  eligibility  text,                                   -- "Open to students & freshers"
  prize        text,                                   -- "$10,000" / "₹5,00,000"
  deadline     timestamptz,                            -- registration / application deadline
  starts_at    timestamptz,                            -- event start, if known
  source_url   text not null unique,                   -- canonical link; UNIQUE = natural dedupe key
  image_url    text,                                   -- card/hero image
  tags         text[] default '{}',                    -- ["ai","web3","beginner-friendly"]
  accent_color text default 'cyan',                    -- drives the neon glow, like technologies
  is_curated   boolean not null default false,         -- hand-picked (true) vs scraped (false)
  is_featured  boolean not null default false,         -- surfaced at the top of the feed
  published_at timestamptz,                            -- when the source listed it
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists opportunities_kind_idx     on public.opportunities (kind);
create index if not exists opportunities_country_idx   on public.opportunities (country);
create index if not exists opportunities_deadline_idx  on public.opportunities (deadline asc);
create index if not exists opportunities_featured_idx  on public.opportunities (is_featured);

-- ----------------------------------------------------------------------------
-- JOBS
-- Fresher-focused remote roles from free, scraping-permitted sources (RemoteOK
-- API, We Work Remotely RSS). Populated by jobs_pipeline.py with NO LLM calls —
-- every field is parsed from structured data. Deduped on apply_url.
-- ----------------------------------------------------------------------------
create table if not exists public.jobs (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique,                            -- stable id for detail/dedupe
  title       text not null,                          -- role, e.g. "Junior Frontend Developer"
  company     text,
  location    text,                                   -- "Remote" | "Bengaluru, India"
  country     text,                                   -- "India" | "Global"
  is_remote   boolean not null default false,
  is_fresher  boolean not null default false,         -- entry-level / <1yr friendly (heuristic)
  experience  text,                                   -- "0-1 years" | "Fresher" | null
  skills      text[] default '{}',                    -- ["react","python","aws"]
  salary      text,                                   -- "$60k–$90k" | null
  apply_url   text not null unique,                   -- canonical link; UNIQUE = dedupe key
  source      text,                                   -- "RemoteOK" | "We Work Remotely"
  tags        text[] default '{}',
  description text,
  posted_at   timestamptz,                            -- when the source listed it
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists jobs_fresher_idx on public.jobs (is_fresher);
create index if not exists jobs_remote_idx  on public.jobs (is_remote);
create index if not exists jobs_country_idx on public.jobs (country);
create index if not exists jobs_posted_idx  on public.jobs (posted_at desc);

-- ----------------------------------------------------------------------------
-- LEARNING RESOURCES
-- Unified table for things you learn from: free courses, full-course videos,
-- conference talks, and professional certifications. The `kind` column
-- discriminates (like opportunities.kind). Populated LLM-free from Microsoft
-- Learn (courses + certs), freeCodeCamp & conference YouTube RSS. Dedupe on url.
-- ----------------------------------------------------------------------------
create table if not exists public.learning_resources (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique,                          -- stable id / dedupe
  title           text not null,
  kind            text not null,                        -- 'course'|'video'|'talk'|'certification'
  provider        text,                                 -- "Microsoft Learn" | "freeCodeCamp" | "AWS"
  url             text not null unique,                 -- canonical link; UNIQUE = dedupe key
  description     text,
  level           text,                                 -- "Beginner"|"Intermediate"|"Advanced"|null
  topics          text[] default '{}',                  -- ["azure","ai","python"]
  is_free         boolean not null default true,
  has_certificate boolean not null default false,       -- does completing it grant a cert?
  duration        text,                                 -- "2 hours" | null
  image_url       text,                                 -- icon / video thumbnail
  source          text,                                 -- pipeline source name
  is_featured     boolean not null default false,       -- famous/curated → surfaced first
  published_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Added after initial deploy — safe to re-run.
alter table public.learning_resources
  add column if not exists is_featured boolean not null default false;

create index if not exists learning_kind_idx     on public.learning_resources (kind);
create index if not exists learning_provider_idx on public.learning_resources (provider);
create index if not exists learning_featured_idx on public.learning_resources (is_featured);

-- ----------------------------------------------------------------------------
-- REPOS
-- Trending / notable open-source repositories worth learning from or contributing
-- to. Populated LLM-free from the GitHub Search API. Deduped on url.
-- ----------------------------------------------------------------------------
create table if not exists public.repos (
  id                  uuid primary key default gen_random_uuid(),
  slug                text unique,                      -- "owner/name"
  name                text not null,
  owner               text,
  url                 text not null unique,             -- canonical link; UNIQUE = dedupe key
  description         text,
  language            text,                             -- primary language
  stars               integer not null default 0,
  topics              text[] default '{}',
  is_good_first_issue boolean not null default false,   -- beginner-contributable?
  source              text,
  pushed_at           timestamptz,                      -- last activity
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists repos_stars_idx    on public.repos (stars desc);
create index if not exists repos_language_idx on public.repos (language);

-- ----------------------------------------------------------------------------
-- Keep *.updated_at fresh on any change.
-- ----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists technologies_touch on public.technologies;
create trigger technologies_touch
  before update on public.technologies
  for each row execute function public.touch_updated_at();

drop trigger if exists opportunities_touch on public.opportunities;
create trigger opportunities_touch
  before update on public.opportunities
  for each row execute function public.touch_updated_at();

drop trigger if exists jobs_touch on public.jobs;
create trigger jobs_touch
  before update on public.jobs
  for each row execute function public.touch_updated_at();

drop trigger if exists learning_touch on public.learning_resources;
create trigger learning_touch
  before update on public.learning_resources
  for each row execute function public.touch_updated_at();

drop trigger if exists repos_touch on public.repos;
create trigger repos_touch
  before update on public.repos
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- Row Level Security
-- The website reads with the public anon key, so allow anonymous SELECT only.
-- Writes happen exclusively from the Python job using the service_role key,
-- which bypasses RLS — so we deliberately grant NO public write policy.
-- ----------------------------------------------------------------------------
alter table public.technologies       enable row level security;
alter table public.updates            enable row level security;
alter table public.opportunities      enable row level security;
alter table public.jobs               enable row level security;
alter table public.learning_resources enable row level security;
alter table public.repos              enable row level security;

drop policy if exists "public read technologies" on public.technologies;
create policy "public read technologies"
  on public.technologies for select
  using (true);

drop policy if exists "public read updates" on public.updates;
create policy "public read updates"
  on public.updates for select
  using (true);

drop policy if exists "public read opportunities" on public.opportunities;
create policy "public read opportunities"
  on public.opportunities for select
  using (true);

drop policy if exists "public read jobs" on public.jobs;
create policy "public read jobs"
  on public.jobs for select
  using (true);

drop policy if exists "public read learning" on public.learning_resources;
create policy "public read learning"
  on public.learning_resources for select
  using (true);

drop policy if exists "public read repos" on public.repos;
create policy "public read repos"
  on public.repos for select
  using (true);

-- ----------------------------------------------------------------------------
-- Optional seed rows so the UI renders before the first scraper run.
-- The scraper upserts on `slug`, so these get enriched automatically later.
-- ----------------------------------------------------------------------------
insert into public.technologies (slug, name, category, tagline, current_version, accent_color, is_featured, homepage_url)
values
  ('claude-opus',  'Claude Opus',  'Frontier Models', 'Anthropic''s most capable model',        '4.8',       'violet',  true,  'https://www.anthropic.com'),
  ('gemini-pro',   'Gemini Pro',   'Frontier Models', 'Google''s flagship multimodal model',     '2.5 Pro',   'cyan',    true,  'https://deepmind.google/gemini'),
  ('gemini-flash', 'Gemini Flash', 'Frontier Models', 'Fast, cost-efficient Gemini tier',        '2.5 Flash', 'cyan',    true,  'https://deepmind.google/gemini'),
  ('gpt',          'GPT',          'Frontier Models', 'OpenAI''s GPT model family',               '5.5',       'emerald', true,  'https://openai.com'),
  ('python',       'Python',       'Languages',       'The language of AI and automation',        '3.13',      'emerald', true,  'https://python.org'),
  ('java',         'Java',         'Languages',       'Enterprise-grade, JVM-powered',            '24',        'violet',  false, 'https://dev.java'),
  ('tailwindcss',  'Tailwind CSS', 'Frameworks',      'Utility-first CSS framework',              '4.0',       'cyan',    true,  'https://tailwindcss.com')
on conflict (slug) do nothing;

-- Curated opportunity seeds (the famous, feed-less ones). The scraper re-upserts
-- the full curated list from automation/curated/opportunities.json and adds
-- scraped ones, so this is just enough to render the section before any run.
insert into public.opportunities
  (slug, title, kind, organizer, description, location, country, is_remote, eligibility, prize, source_url, accent_color, is_curated, is_featured)
values
  ('aws-reinvent-2026', 'AWS re:Invent 2026', 'conference', 'AWS',
   'Amazon Web Services'' flagship global cloud & AI conference — keynotes, hands-on labs, and certifications.',
   'Las Vegas, USA', 'USA', false, 'Open to all — students get discounted passes', null,
   'https://aws.amazon.com/events/reinvent/', 'emerald', true, true),
  ('google-io-2026', 'Google I/O 2026', 'conference', 'Google',
   'Google''s annual developer conference covering Android, AI (Gemini), web, and cloud.',
   'Mountain View, USA + Online', 'Global', true, 'Open to all developers — free online', null,
   'https://io.google/', 'cyan', true, true),
  ('smart-india-hackathon-2026', 'Smart India Hackathon 2026', 'hackathon', 'Govt. of India',
   'India''s largest nationwide hackathon where students solve real problems posed by ministries and industry.',
   'Pan-India', 'India', false, 'College students (teams of 6)', '₹1,00,000 per problem',
   'https://www.sih.gov.in/', 'violet', true, true),
  ('mlh-fellowship-2026', 'MLH Fellowship', 'internship', 'Major League Hacking',
   'A remote internship alternative — contribute to open source with mentorship over 12 weeks.',
   'Remote', 'Global', true, 'Students & freshers worldwide', 'Stipend',
   'https://fellowship.mlh.io/', 'emerald', true, true)
on conflict (slug) do nothing;
