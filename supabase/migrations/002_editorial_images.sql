-- ============================================================================
-- Newsfall — Migration 002: editorial images
-- ADDITIVE. Run after 001. Safe to re-run.
-- Events get an image_url (taken from the primary source article's og:image,
-- captured at ingestion) so the homepage can show real, story-relevant visuals.
-- ============================================================================

alter table public.events add column if not exists image_url text;

create or replace view public.articles_public as
  select a.id, a.source_id, a.title, a.url, a.author, a.summary, a.published_at,
         a.ingestion_status, a.created_at,
         a.metadata->>'image_url' as image_url,
         s.name as source_name, s.source_type, s.credibility_score, s.is_primary_source
  from public.raw_articles a
  left join public.sources s on s.id = a.source_id
  where a.ingestion_status not in ('DUPLICATE','FAILED','SKIPPED');

grant select on public.articles_public to anon, authenticated;
