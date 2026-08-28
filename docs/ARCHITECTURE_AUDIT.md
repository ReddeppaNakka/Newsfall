# Newsfall — Architecture Audit (Phase 0)

_Audit date: 2026-08-28. Scope: every tracked file in the repository (≈7.6k lines, excluding `ui-ux-pro-max/`, a local skill bundle that is not app code)._

## 1. Current architecture

```
 RSS / JSON APIs (feedparser, requests)             GitHub Actions cron (06:00 UTC)
        │                                                     │
        ▼                                                     ▼
 automation/scraper.py ──► tools_pipeline.py         (Groq LLM: llama-3.3-70b, JSON mode)
                       ├─► opportunities_pipeline.py  (curated JSON + Devpost/Unstop/HackerEarth/Devfolio)
                       ├─► jobs_pipeline.py           (RemoteOK API + WWR RSS, no LLM)
                       ├─► learning_pipeline.py       (MS Learn API + YouTube RSS, no LLM)
                       └─► repos_pipeline.py          (GitHub Search API, no LLM)
                                   │  upsert (service_role key, bypasses RLS)
                                   ▼
                 Supabase Postgres — technologies · updates · opportunities · jobs ·
                                    learning_resources · repos   (RLS: anon SELECT only)
                                   │  anon key, SSR, ISR revalidate=60s
                                   ▼
                 Next.js 15 App Router (web/) — / · /topic/[id] · /jobs · /opportunities ·
                                               /learn · /repos · /api/topic/[slug](/brief)
                                   │
                        On-demand "brief": Tavily web search + Groq LLM, unstable_cache 24h
```

### Frontend (`web/`)
- Next.js 15.1 / React 19 / TypeScript strict / Tailwind 3.4. Dark glassmorphic theme (`canvas` token, violet/cyan/emerald accents, `.glass` utility).
- All pages are **Server Components** reading Supabase directly via one shared anon client (`lib/supabase.ts`). ISR `revalidate = 60` on every page.
- **Preview mode**: if Supabase env vars are absent, `lib/supabase.ts` swaps in a `MockQuery` thenable over `lib/mock-data.ts`. Unknown tables resolve to `[]`/`null` — this is important: new tables degrade gracefully in preview mode.
- Client components: `Sidebar`, `TechExplorer`, `TopicModal` (URL-driven `?topic=<slug>` popup, two-phase fetch), `*Feed` filters, `ImageGallery`.
- `lib/brief.ts` + `lib/llm.ts` + `lib/search.ts`: server-only, generate a Tavily-grounded per-technology brief. Cache key `slug+version`, failures never cached.
- `lib/logo.ts`: unavatar/ui-avatars logo resolution. `lib/types.ts`: the single source of truth for row types.

### Backend / API
- No standalone backend. Two route handlers: `GET /api/topic/[slug]` (fast, no LLM) and `GET /api/topic/[slug]/brief` (slow). Everything else is SSR.

### Automation (`automation/`)
- Python 3.12 in CI (3.14 local venv). Deps: `feedparser`, `requests`, `supabase`, `python-dotenv` (pydantic 2 is present transitively via supabase).
- `common.py`: env loading, `get_db()`, `llm_json()` — an OpenAI-compatible JSON-mode call with 429 backoff, returning `None` on any failure. Hardcoded single model.
- `tools_pipeline.py` is the only LLM consumer: (a) targeted official feeds keyword-matched to a technology slug, (b) discovery feeds run through an LLM classifier that auto-creates `technologies`. Importance 1–5 is LLM-only. Dedupe = `updates.source_url` UNIQUE + preloaded "seen" set. LLM call budget cap (45/run).
- The other four pipelines are deterministic upserts keyed on a unique URL.

### Data ingestion
- Sources are **hardcoded Python lists** (`TARGETED_SOURCES`, `DISCOVERY_FEEDS`, `WWR_FEEDS`, `YOUTUBE_SOURCES`, `QUERIES`). No registry, no health tracking, no credibility.
- Raw content is **not preserved**: feed items are condensed by the LLM and only the ≤200-char summary survives. No traceability from output to evidence.

### Database (`supabase/schema.sql`)
- Single idempotent-ish SQL file (run by hand in the SQL editor). No migration tooling. `pgcrypto` only; **pgvector not enabled**.
- Six flat tables, all with `touch_updated_at` triggers, category/date indexes, RLS enabled with anon SELECT policies and no write policies.

### AI / LLM
- Two independent implementations of the same helper (`automation/common.py::llm_json`, `web/lib/llm.ts::llmJson`), both Groq-by-default, single model, prompt-embedded ad-hoc JSON "schemas", hand-rolled validation (`asStr`/`asList`) only on the web side.
- No usage/cost logging, no model routing, no retries beyond 429.

### Auth / security
- No user auth (public read-only site). Secrets correctly split: `NEXT_PUBLIC_*` anon only; `LLM_API_KEY`, `TAVILY_API_KEY` server-only via `import "server-only"`. Service-role key only in the Python job / GitHub secrets. `.env` files gitignored. `next.config.mjs` allows images from any https host (noted, not changed).

### Deployment / environment
- Frontend: Vercel (implied by README). Automation: GitHub Actions daily cron with repository secrets. Env contract documented in `.env.example` / `.env.local.example`.
- **No `OPENROUTER_API_KEY` exists in either env file today** — the intelligence layer is designed to use it when present and fall back to the existing `LLM_*` (Groq) config otherwise.

## 2. Strengths (preserve)
1. Clean, small, readable codebase; each pipeline is isolated and failure-tolerant (one bad source never aborts a run).
2. Idempotent upserts on natural unique keys — safe re-runs, already the right instinct for the intelligence pipeline.
3. Correct secret boundaries and RLS posture.
4. Preview mode makes the UI runnable with zero setup and lets new tables fail soft.
5. Two-phase popup loading and cache-on-success-only are good UX/robustness patterns worth reusing for `/ask`.
6. `lib/types.ts` as a single typed contract; `Icon`, `Logo`, `.glass`, accent maps are reusable design primitives.
7. The discovery classifier already demonstrates LLM-driven entity creation with validation of enums — the seed of the entity system.

## 3. Technical debt
| Area | Issue | Consequence |
|---|---|---|
| Sources | Hardcoded lists across five files, no metadata | Cannot weight credibility, cannot monitor health, cannot add sources without a deploy |
| Evidence | Raw article text discarded | Nothing the LLM says is traceable |
| Importance | LLM-only 1–5 integer, single article, no cross-source signal | One enthusiastic press release outranks a confirmed acquisition |
| LLM | Two duplicated helpers, one hardcoded model, no schema validation (Python side), no cost logging | Malformed output silently becomes `None`; no cost control |
| Dedupe | URL-only | The same story from 5 outlets = 5 rows, or is dropped by the discovery classifier as "not a tool" |
| Schema | Hand-run single file, `alter table ... add column` accretions | No migration history; pgvector missing |
| Sidebar copy | "career-intelligence dashboard for freshers" | Product positioning drifted from the tech-tracker hero copy — both must move to the intelligence positioning |
| Tests | None | No safety net for scoring/clustering logic |

## 4. Missing capabilities vs. target vision
Source registry & credibility · raw article storage · normalization & multi-level dedupe · universal entities + aliases + mentions · claims with status lifecycle · events separate from articles · clustering (vector + entity + time + LLM verify) · evidence & stance · contradiction detection · composite importance scoring · relationships · influence · watch items · briefings · embeddings/pgvector · semantic search · Ask Newsfall · event/entity pages · llm_runs observability · tests.

## 5. Migration strategy (non-destructive)
- **Additive schema only.** New tables live beside the existing six; `supabase/migrations/NNN_*.sql` files are numbered and idempotent. `schema.sql` remains valid and untouched.
- **Bridge, don't replace, `technologies`.** `entities.technology_id` links a TECHNOLOGY entity to its existing `technologies` row so `/topic/[slug]` and the grid keep working and the entity page can deep-link to it.
- **New Python package `automation/newsfall/`** holds the intelligence pipeline. Existing pipelines are untouched; `scraper.py` gains one guarded call (`INTELLIGENCE_ENABLED`, default on) that can never fail the legacy run.
- **One LLM gateway** (`newsfall/llm.py`) with OpenRouter as the primary provider and the existing Groq config as fallback. `common.llm_json` is kept for the legacy tools pipeline (it can be pointed at the gateway later with no call-site change).
- **Frontend additive routes** (`/intelligence`, `/events/[slug]`, `/entities/[slug]`, `/ask`, `/api/*`). Homepage gains a "Top Intelligence" block that renders only when events exist, so preview mode and a pre-migration database are unaffected.
- **Deprecation candidates (later, not now):** `updates.importance` (superseded by `events.importance_score` once the tools feed is routed through the event pipeline); duplicated `llmJson` once `/ask` and the brief share `web/lib/ai.ts`.

## 6. Risks / potential breaking changes
- Running migrations requires `create extension vector` — available on all Supabase tiers, but the SQL must be run by the project owner.
- Embedding dimension is fixed at 1536 in `vector(1536)`. Changing embedding models later requires a re-embed (the `embedding_model` column tags rows so mixed models are never compared).
- LLM cost: every new article costs ~2 fast calls (entities+claims) and some events cost a reasoning call. Budgets are capped per run via env (`INTEL_MAX_ARTICLES_PER_RUN`, `INTEL_MAX_LLM_CALLS_PER_RUN`).
- `raw_articles.content` is **not** publicly readable (copyright + size); the frontend reads the `articles_public` view.

See `docs/INTELLIGENCE_ARCHITECTURE.md` for the target design, schema, and file-by-file plan.
