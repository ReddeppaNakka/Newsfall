-- ============================================================================
-- Newsfall — Migration 001: Intelligence foundation
--
-- ADDITIVE ONLY. Run AFTER supabase/schema.sql. Safe to re-run.
-- Adds the source registry, raw evidence store, universal entities, claims,
-- events, evidence, relationships, watch items, reports, and observability.
-- Existing tables (technologies, updates, opportunities, jobs,
-- learning_resources, repos) are not modified.
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "vector";     -- pgvector (available on every Supabase tier)
create extension if not exists "pg_trgm";    -- trigram similarity for title dedupe / search

-- ----------------------------------------------------------------------------
-- SOURCES — the source registry (Part 5 / 3A)
-- ----------------------------------------------------------------------------
create table if not exists public.sources (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null unique,
  name                  text not null,
  organization          text,
  domain                text,
  homepage_url          text,
  feed_url              text,                          -- RSS/Atom/JSON endpoint (null for API connectors)
  connector             text not null default 'rss',   -- 'rss' | 'hackernews' | 'arxiv' | 'github_releases' | 'huggingface'
  api_config            jsonb not null default '{}'::jsonb,
  source_type           text not null,
  source_category       text not null,
  tier                  smallint not null default 2,   -- implementation priority 1..3
  credibility_score     numeric(4,3) not null default 0.500,  -- 0..1 baseline; contextualised at use
  is_primary_source     boolean not null default false,
  crawl_frequency_minutes integer not null default 1440,
  active                boolean not null default true,
  last_fetched_at       timestamptz,
  last_success_at       timestamptz,
  consecutive_failures  integer not null default 0,
  last_error            text,
  last_item_count       integer,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint sources_type_chk check (source_type in
    ('OFFICIAL','NEWS','RESEARCH','GOVERNMENT','FINANCIAL','SOCIAL','COMMUNITY','BLOG','DEVELOPER','SECURITY')),
  constraint sources_category_chk check (source_category in
    ('COMPANY','TECH_REPORTING','FINANCIAL','STARTUP','AI_RESEARCH','OPEN_SOURCE','CYBERSECURITY',
     'SEMICONDUCTOR','GOVERNMENT','INFLUENCE','SOCIAL','MEDIA')),
  constraint sources_credibility_chk check (credibility_score >= 0 and credibility_score <= 1)
);
create index if not exists sources_active_idx on public.sources (active, tier);
create index if not exists sources_domain_idx on public.sources (domain);

-- ----------------------------------------------------------------------------
-- RAW ARTICLES — immutable evidence (Part 4)
-- ----------------------------------------------------------------------------
create table if not exists public.raw_articles (
  id                uuid primary key default gen_random_uuid(),
  source_id         uuid references public.sources (id) on delete set null,
  title             text not null,
  url               text not null unique,
  canonical_url     text,
  author            text,
  content           text,                              -- cleaned full text (or feed body)
  summary           text,                              -- short deterministic excerpt (first ~300 chars)
  published_at      timestamptz,
  content_hash      text,                              -- sha256 of normalised title+content
  language          text default 'en',
  ingestion_status  text not null default 'PENDING',
  error             text,
  retry_count       integer not null default 0,
  duplicate_of      uuid references public.raw_articles (id) on delete set null,
  metadata          jsonb not null default '{}'::jsonb,
  embedding         vector(1536),
  embedding_model   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint raw_articles_status_chk check (ingestion_status in
    ('PENDING','INGESTED','NORMALIZED','DUPLICATE','ENTITIES_EXTRACTED','CLAIMS_EXTRACTED',
     'CLUSTERED','VERIFIED','INTELLIGENCE_GENERATED','PUBLISHED','FAILED','SKIPPED'))
);
create index if not exists raw_articles_status_idx    on public.raw_articles (ingestion_status);
create index if not exists raw_articles_published_idx on public.raw_articles (published_at desc);
create index if not exists raw_articles_source_idx    on public.raw_articles (source_id);
create index if not exists raw_articles_hash_idx      on public.raw_articles (content_hash);
create index if not exists raw_articles_title_trgm    on public.raw_articles using gin (title gin_trgm_ops);
-- ivfflat needs rows to train; HNSW works from zero rows and is the better default.
create index if not exists raw_articles_embedding_idx on public.raw_articles
  using hnsw (embedding vector_cosine_ops);

-- ----------------------------------------------------------------------------
-- ENTITIES — universal entity model (Part 6)
-- ----------------------------------------------------------------------------
create table if not exists public.entities (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  name             text not null,
  entity_type      text not null,
  description      text,
  official_url     text,
  image_url        text,
  aliases          text[] not null default '{}',
  metadata         jsonb not null default '{}'::jsonb,
  influence_score  numeric(5,2) not null default 0,     -- 0..100, recomputed by the pipeline
  mention_count    integer not null default 0,
  technology_id    uuid references public.technologies (id) on delete set null,  -- bridge to the legacy tracker
  embedding        vector(1536),
  embedding_model  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint entities_type_chk check (entity_type in
    ('PERSON','COMPANY','TECHNOLOGY','PRODUCT','ORGANIZATION','INVESTOR','STARTUP','RESEARCH_LAB',
     'GOVERNMENT','FUND','INDUSTRY'))
);
create index if not exists entities_type_idx      on public.entities (entity_type);
create index if not exists entities_influence_idx on public.entities (influence_score desc);
create index if not exists entities_name_trgm     on public.entities using gin (name gin_trgm_ops);
create index if not exists entities_embedding_idx on public.entities using hnsw (embedding vector_cosine_ops);

create table if not exists public.entity_aliases (
  id               uuid primary key default gen_random_uuid(),
  entity_id        uuid not null references public.entities (id) on delete cascade,
  alias            text not null,
  alias_normalized text not null unique,              -- lowercased, punctuation-stripped
  created_at       timestamptz not null default now()
);
create index if not exists entity_aliases_entity_idx on public.entity_aliases (entity_id);

-- ----------------------------------------------------------------------------
-- ENTITY MENTIONS — article ↔ entity (Part 7)
-- ----------------------------------------------------------------------------
create table if not exists public.entity_mentions (
  id            uuid primary key default gen_random_uuid(),
  article_id    uuid not null references public.raw_articles (id) on delete cascade,
  entity_id     uuid not null references public.entities (id) on delete cascade,
  mention_type  text not null default 'MENTIONED',     -- 'SUBJECT' | 'ACTOR' | 'TARGET' | 'MENTIONED'
  confidence    numeric(4,3) not null default 0.5,
  context       text,
  created_at    timestamptz not null default now(),
  unique (article_id, entity_id)
);
create index if not exists entity_mentions_entity_idx on public.entity_mentions (entity_id);

-- ----------------------------------------------------------------------------
-- EVENTS — separate from articles (Part 9)
-- ----------------------------------------------------------------------------
create table if not exists public.events (
  id                        uuid primary key default gen_random_uuid(),
  slug                      text not null unique,
  title                     text not null,
  event_type                text not null default 'OTHER',
  summary                   text,
  status                    text not null default 'ACTIVE',
  occurred_at               timestamptz,
  first_seen_at             timestamptz not null default now(),
  last_updated_at           timestamptz not null default now(),
  importance_score          numeric(5,2) not null default 0,   -- 0..100 composite
  confidence_score          numeric(4,3) not null default 0,   -- 0..1 evidence-derived
  score_breakdown           jsonb not null default '{}'::jsonb,
  why_it_matters            text,
  industry_impact           text,
  intelligence_summary      text,
  what_to_watch             text[] not null default '{}',
  scenarios                 jsonb not null default '[]'::jsonb, -- [{scenario, confidence, supporting, counter, signals}]
  article_count             integer not null default 0,
  source_count              integer not null default 0,
  independent_source_count  integer not null default 0,
  primary_source_confirmed  boolean not null default false,
  has_contradiction         boolean not null default false,
  analysis_model            text,
  analyzed_at               timestamptz,
  embedding                 vector(1536),
  embedding_model           text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint events_type_chk check (event_type in
    ('PRODUCT_LAUNCH','MODEL_RELEASE','FUNDING','ACQUISITION','PARTNERSHIP','INVESTMENT',
     'LEADERSHIP_CHANGE','EARNINGS','REGULATION','LAWSUIT','RESEARCH_BREAKTHROUGH','CHIP_DEVELOPMENT',
     'INFRASTRUCTURE_EXPANSION','LAYOFF','IPO','SECURITY_INCIDENT','OPEN_SOURCE_RELEASE',
     'POLICY_STATEMENT','OTHER')),
  constraint events_status_chk check (status in ('ACTIVE','UPDATED','SUPERSEDED','CONTRADICTED','RESOLVED'))
);
create index if not exists events_importance_idx on public.events (importance_score desc, last_updated_at desc);
create index if not exists events_occurred_idx   on public.events (occurred_at desc);
create index if not exists events_type_idx       on public.events (event_type);
create index if not exists events_status_idx     on public.events (status);
create index if not exists events_embedding_idx  on public.events using hnsw (embedding vector_cosine_ops);

create table if not exists public.event_articles (
  event_id    uuid not null references public.events (id) on delete cascade,
  article_id  uuid not null references public.raw_articles (id) on delete cascade,
  similarity  numeric(4,3),
  is_primary  boolean not null default false,        -- this article seeded the event
  attached_by text not null default 'deterministic', -- 'deterministic' | 'llm' | 'seed'
  created_at  timestamptz not null default now(),
  primary key (event_id, article_id)
);
create index if not exists event_articles_article_idx on public.event_articles (article_id);

create table if not exists public.event_entities (
  event_id   uuid not null references public.events (id) on delete cascade,
  entity_id  uuid not null references public.entities (id) on delete cascade,
  role       text not null default 'INVOLVED',     -- 'ACTOR' | 'TARGET' | 'AFFECTED' | 'INVOLVED'
  created_at timestamptz not null default now(),
  primary key (event_id, entity_id)
);
create index if not exists event_entities_entity_idx on public.event_entities (entity_id);

-- ----------------------------------------------------------------------------
-- CLAIMS + EVIDENCE (Parts 8, 11)
-- ----------------------------------------------------------------------------
create table if not exists public.claims (
  id                 uuid primary key default gen_random_uuid(),
  article_id         uuid references public.raw_articles (id) on delete set null,   -- where first extracted
  event_id           uuid references public.events (id) on delete set null,
  claim_text         text not null,
  claim_type         text not null default 'REPORTED',
  status             text not null default 'UNVERIFIED',
  subject_entity_id  uuid references public.entities (id) on delete set null,
  object_entity_id   uuid references public.entities (id) on delete set null,
  confidence         numeric(4,3) not null default 0.3,
  source_context     text,
  claim_hash         text,                      -- for idempotent re-extraction
  superseded_by      uuid references public.claims (id) on delete set null,
  embedding          vector(1536),
  embedding_model    text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint claims_type_chk check (claim_type in ('FACT','REPORTED','RUMOR','OPINION','PREDICTION')),
  constraint claims_status_chk check (status in
    ('UNVERIFIED','REPORTED','PARTIALLY_CONFIRMED','CONFIRMED','DISPUTED','FALSE','SUPERSEDED'))
);
create unique index if not exists claims_article_hash_uidx on public.claims (article_id, claim_hash);
create index if not exists claims_event_idx   on public.claims (event_id);
create index if not exists claims_status_idx  on public.claims (status);
create index if not exists claims_subject_idx on public.claims (subject_entity_id);

create table if not exists public.claim_evidence (
  id                 uuid primary key default gen_random_uuid(),
  claim_id           uuid not null references public.claims (id) on delete cascade,
  article_id         uuid not null references public.raw_articles (id) on delete cascade,
  source_id          uuid references public.sources (id) on delete set null,
  excerpt            text,
  stance             text not null default 'MENTIONS',
  credibility_weight numeric(4,3) not null default 0.5,
  confidence         numeric(4,3) not null default 0.5,
  created_at         timestamptz not null default now(),
  unique (claim_id, article_id),
  constraint claim_evidence_stance_chk check (stance in ('SUPPORTS','CONTRADICTS','MENTIONS','UNCLEAR'))
);
create index if not exists claim_evidence_claim_idx on public.claim_evidence (claim_id);

-- ----------------------------------------------------------------------------
-- RELATIONSHIPS — graph edges in Postgres (Part 15)
-- ----------------------------------------------------------------------------
create table if not exists public.entity_relationships (
  id                  uuid primary key default gen_random_uuid(),
  source_entity_id    uuid not null references public.entities (id) on delete cascade,
  target_entity_id    uuid not null references public.entities (id) on delete cascade,
  relationship_type   text not null,
  confidence          numeric(4,3) not null default 0.5,
  evidence_article_id uuid references public.raw_articles (id) on delete set null,
  evidence_event_id   uuid references public.events (id) on delete set null,
  valid_from          timestamptz,
  valid_to            timestamptz,
  status              text not null default 'ACTIVE',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (source_entity_id, target_entity_id, relationship_type),
  constraint relationships_type_chk check (relationship_type in
    ('FOUNDED','CEO_OF','EXECUTIVE_OF','OWNS','INVESTED_IN','ACQUIRED','PARTNERED_WITH','COMPETES_WITH',
     'SUPPLIES','DEPENDS_ON','CREATED','FUNDED','ADVISED','LEFT','JOINED','SUBSIDIARY_OF','REGULATES','SUED')),
  constraint relationships_status_chk check (status in ('ACTIVE','ENDED','DISPUTED'))
);
create index if not exists relationships_source_idx on public.entity_relationships (source_entity_id);
create index if not exists relationships_target_idx on public.entity_relationships (target_entity_id);

-- ----------------------------------------------------------------------------
-- WATCH ITEMS (Part 26) · REPORTS (Part 25)
-- ----------------------------------------------------------------------------
create table if not exists public.watch_items (
  id                  uuid primary key default gen_random_uuid(),
  title               text not null,
  reason              text,
  kind                text not null default 'EMERGING_SIGNAL',
  event_id            uuid references public.events (id) on delete cascade,
  claim_id            uuid references public.claims (id) on delete set null,
  related_entity_ids  uuid[] not null default '{}',
  confidence          numeric(4,3) not null default 0.4,
  expected_timeframe  text,
  status              text not null default 'OPEN',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint watch_kind_chk check (kind in ('UPCOMING_KNOWN_EVENT','EMERGING_SIGNAL','SPECULATIVE_POSSIBILITY')),
  constraint watch_status_chk check (status in ('OPEN','RESOLVED','EXPIRED','DISMISSED'))
);
create unique index if not exists watch_items_event_title_uidx on public.watch_items (event_id, title);
create index if not exists watch_items_status_idx on public.watch_items (status, confidence desc);

create table if not exists public.intelligence_reports (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null default 'DAILY',          -- 'DAILY' | 'WEEKLY'
  period_start  timestamptz not null,
  period_end    timestamptz not null,
  title         text not null,
  content       jsonb not null default '{}'::jsonb,     -- structured briefing sections
  model         text,
  created_at    timestamptz not null default now(),
  unique (kind, period_start)
);

-- ----------------------------------------------------------------------------
-- OBSERVABILITY (Parts 18, 33)
-- ----------------------------------------------------------------------------
create table if not exists public.llm_runs (
  id                  uuid primary key default gen_random_uuid(),
  run_id              uuid,
  task_type           text not null,
  role                text not null,                    -- fast | reasoning | premium | embedding
  provider            text,
  model               text,
  prompt_tokens       integer,
  completion_tokens   integer,
  latency_ms          integer,
  success             boolean not null default true,
  error               text,
  estimated_cost_usd  numeric(10,6),
  created_at          timestamptz not null default now()
);
create index if not exists llm_runs_created_idx on public.llm_runs (created_at desc);

create table if not exists public.pipeline_runs (
  id           uuid primary key default gen_random_uuid(),
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  status       text not null default 'RUNNING',        -- RUNNING | SUCCESS | PARTIAL | FAILED
  stats        jsonb not null default '{}'::jsonb,
  error        text
);

-- ----------------------------------------------------------------------------
-- updated_at triggers (reuse the existing function from schema.sql)
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['sources','raw_articles','entities','events','claims',
                           'entity_relationships','watch_items']
  loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Vector search RPCs (Part 30). SECURITY DEFINER so the anon role can search
-- without direct table access; they return only public-safe columns.
-- ----------------------------------------------------------------------------
create or replace function public.match_events(
  query_embedding vector(1536), match_threshold float default 0.5, match_count int default 10,
  since timestamptz default null
) returns table (id uuid, slug text, title text, event_type text, summary text, status text,
                 importance_score numeric, confidence_score numeric, occurred_at timestamptz, similarity float)
language sql stable security definer set search_path = public as $$
  select e.id, e.slug, e.title, e.event_type, e.summary, e.status, e.importance_score, e.confidence_score,
         e.occurred_at, 1 - (e.embedding <=> query_embedding) as similarity
  from public.events e
  where e.embedding is not null
    and (since is null or e.last_updated_at >= since)
    and 1 - (e.embedding <=> query_embedding) > match_threshold
  order by e.embedding <=> query_embedding
  limit match_count;
$$;

create or replace function public.match_articles(
  query_embedding vector(1536), match_threshold float default 0.5, match_count int default 10,
  since timestamptz default null
) returns table (id uuid, source_id uuid, title text, url text, summary text, published_at timestamptz, similarity float)
language sql stable security definer set search_path = public as $$
  select a.id, a.source_id, a.title, a.url, a.summary, a.published_at,
         1 - (a.embedding <=> query_embedding) as similarity
  from public.raw_articles a
  where a.embedding is not null
    and a.ingestion_status not in ('DUPLICATE','FAILED','SKIPPED')
    and (since is null or a.published_at >= since)
    and 1 - (a.embedding <=> query_embedding) > match_threshold
  order by a.embedding <=> query_embedding
  limit match_count;
$$;

create or replace function public.match_entities(
  query_embedding vector(1536), match_threshold float default 0.5, match_count int default 10
) returns table (id uuid, slug text, name text, entity_type text, description text, influence_score numeric, similarity float)
language sql stable security definer set search_path = public as $$
  select e.id, e.slug, e.name, e.entity_type, e.description, e.influence_score,
         1 - (e.embedding <=> query_embedding) as similarity
  from public.entities e
  where e.embedding is not null
    and 1 - (e.embedding <=> query_embedding) > match_threshold
  order by e.embedding <=> query_embedding
  limit match_count;
$$;

-- Public view of articles without the full content body.
create or replace view public.articles_public as
  select a.id, a.source_id, a.title, a.url, a.author, a.summary, a.published_at,
         a.ingestion_status, a.created_at,
         s.name as source_name, s.source_type, s.credibility_score, s.is_primary_source
  from public.raw_articles a
  left join public.sources s on s.id = a.source_id
  where a.ingestion_status not in ('DUPLICATE','FAILED','SKIPPED');

-- ----------------------------------------------------------------------------
-- Row Level Security. Public read for intelligence tables; raw content, LLM
-- and pipeline logs stay service-role only.
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['sources','raw_articles','entities','entity_aliases','entity_mentions','events',
                           'event_articles','event_entities','claims','claim_evidence','entity_relationships',
                           'watch_items','intelligence_reports','llm_runs','pipeline_runs']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;

  foreach t in array array['sources','entities','entity_aliases','entity_mentions','events','event_articles',
                           'event_entities','claims','claim_evidence','entity_relationships','watch_items',
                           'intelligence_reports']
  loop
    execute format('drop policy if exists "public read %s" on public.%I', t, t);
    execute format('create policy "public read %s" on public.%I for select using (true)', t, t);
  end loop;
end $$;

grant select on public.articles_public to anon, authenticated;
grant execute on function public.match_events(vector, float, int, timestamptz) to anon, authenticated;
grant execute on function public.match_articles(vector, float, int, timestamptz) to anon, authenticated;
grant execute on function public.match_entities(vector, float, int) to anon, authenticated;
