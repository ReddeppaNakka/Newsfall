# Newsfall — Technology, Industry & Influence Intelligence

Newsfall ingests fragmented information from curated technology, research, financial and
government sources and transforms it into **connected, evidence-linked intelligence**:

> What happened · Why it matters · Who is involved · How confident we are · What evidence
> supports it · What is connected · What to watch next

It started as a free-stack tech tracker (languages, frameworks, frontier models, plus
opportunities, jobs, learning resources and trending repos) — all of which still works —
and now layers an intelligence engine on top: a source registry with credibility, a raw
evidence store, universal entities, atomic claims with a verification ladder, events
clustered across sources, composite importance scoring, contradiction detection,
relationship extraction, what-to-watch items, daily briefings, semantic search and an
evidence-grounded **Ask Newsfall** assistant.

```
 sources (registry, credibility)          GitHub Actions cron (06:00 UTC)
        │                                          │
        ▼                                          ▼
 automation/newsfall/  ingest → normalize → embed → entities → claims → cluster
                       → verify → influence → score → analyze → watch → briefing
        │  (service-role key)                       │  OpenRouter / OpenAI-compatible LLM
        ▼                                          ▼
 Supabase Postgres + pgvector  ── anon key, SSR ──▶  Next.js 15:  /  /intelligence  /events/[slug]
 (raw_articles · entities · claims · events ·        /entities/[slug]  /ask  /api/*  + legacy pages
  claim_evidence · relationships · watch_items)
```

Full design: [docs/INTELLIGENCE_ARCHITECTURE.md](docs/INTELLIGENCE_ARCHITECTURE.md).
Audit of the pre-intelligence codebase: [docs/ARCHITECTURE_AUDIT.md](docs/ARCHITECTURE_AUDIT.md).

## Product principles

- **Evidence over confident-sounding AI.** Every event links to the articles it was built from;
  every claim carries per-source stance and credibility.
- **Verification ladder.** 1 source → *Reported*; 2 independent high-quality → *Partially
  confirmed*; primary source → *Confirmed*; disagreement → *Disputed*; social-only → *Unverified*.
- **Importance is not an LLM number.** `25·magnitude + 20·entity influence + 15·industry impact
  + 15·cross-source + 10·credibility + 10·novelty + 5·recency`; only magnitude and industry
  impact are bounded AI estimates.
- **Sources are not equal.** A source registry with types, categories, tiers, contextual
  credibility and health monitoring — official/primary first, social as signal only.
- **Structured AI output only.** Every model call is validated against a pydantic schema; a
  malformed reply is repaired once or discarded, never crashes the pipeline.
- **Additive evolution.** Nothing from the original tracker was removed.

## Tech stack (all free-tier capable)

| Layer | Choice |
|---|---|
| Frontend | Next.js 15 (App Router) + React 19 + TypeScript + Tailwind 3.4 |
| Database | Supabase PostgreSQL + pgvector + pg_trgm |
| Automation | Python 3.12 · feedparser · requests · supabase-py · pydantic |
| AI gateway | OpenRouter (any model) or any OpenAI-compatible endpoint (Groq fallback) |
| Scheduler | GitHub Actions cron |
| Hosting | Vercel |

## Repository structure

```
Newsfall/
├── web/                                  # Next.js frontend
│   ├── app/
│   │   ├── page.tsx                      # Homepage: Top Intelligence + legacy sections
│   │   ├── intelligence/page.tsx         # Intelligence feed (briefing, tech, industry, influence, watch)
│   │   ├── events/[slug]/page.tsx        # Event: evidence, claims, contradictions, scenarios, related
│   │   ├── entities/page.tsx             # Entities ranked by influence
│   │   ├── entities/[slug]/page.tsx      # Entity: relationships, timeline, claims, what to watch
│   │   ├── ask/page.tsx                  # Ask Newsfall
│   │   ├── api/{events,entities,search,ask}/route.ts
│   │   └── topic/[id], jobs, learn, opportunities, repos   (legacy, unchanged)
│   ├── components/intel/                 # EventCard, TopIntelligence, EntityChip, Scores, AskNewsfall
│   └── lib/
│       ├── intelligence.ts               # typed server queries (fail-soft)
│       ├── intelligence-types.ts         # mirrors migration 001
│       ├── retrieval.ts                  # vector + lexical search
│       ├── ai.ts                         # server-only chat + embeddings gateway
│       └── supabase.ts, brief.ts, llm.ts, search.ts, types.ts, logo.ts  (legacy)
│
├── automation/
│   ├── scraper.py                        # entry point: legacy pipelines, then intelligence
│   ├── tools_pipeline.py … repos_pipeline.py, common.py     (legacy, unchanged)
│   ├── newsfall/                         # intelligence pipeline package
│   │   ├── config.py · llm.py · schemas.py · db.py · text.py · log.py
│   │   ├── sources/registry.py           # curated seed sources + contextual credibility
│   │   ├── ingestion/                    # connectors (rss/atom, GitHub releases) → raw_articles
│   │   ├── processing/                   # normalize, dedupe, embeddings, entities, claims
│   │   ├── intelligence/                 # clustering, verification, scoring, analysis, influence, watch, briefing
│   │   ├── orchestrator.py · run.py
│   └── tests/                            # pure-logic unit tests (no network, no DB)
│
├── supabase/
│   ├── schema.sql                        # original tables (run first)
│   └── migrations/001_intelligence_foundation.sql   # additive intelligence schema (run second)
└── .github/workflows/daily-update.yml    # tests + scraper + intelligence daily
```

## Quick start

### 1. Database
1. Create a project at [supabase.com](https://supabase.com).
2. SQL Editor → run [supabase/schema.sql](supabase/schema.sql), then
   [supabase/migrations/001_intelligence_foundation.sql](supabase/migrations/001_intelligence_foundation.sql).
3. Copy the **Project URL**, **anon** key (frontend) and **service_role** key (automation only).

### 2. Frontend
```bash
cd web
cp .env.local.example .env.local      # Supabase keys + OPENROUTER_API_KEY (or LLM_* fallback)
npm install
npm run dev                           # http://localhost:3000
```
Without Supabase env vars the UI runs in preview mode with mock data; intelligence
sections simply stay empty until the pipeline has run.

### 3. Automation
```bash
cd automation
python -m venv .venv && . .venv/Scripts/activate   # PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
cp .env.example .env                  # Supabase service key + OPENROUTER_API_KEY (or LLM_*)
python -m pytest -q tests             # unit tests
python scraper.py                     # legacy pipelines + intelligence pipeline
python -m newsfall.run --stage ingest # or run one stage group: ingest|process|cluster|verify|analyze|report
```

### 4. Schedule it
Add repository secrets `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `OPENROUTER_API_KEY`
(and/or `LLM_API_KEY`). Optional repository *variables*: `LLM_FAST_MODEL`,
`LLM_REASONING_MODEL`, `LLM_PREMIUM_MODEL`, `EMBEDDING_MODEL`, `INTEL_MAX_LLM_CALLS_PER_RUN`.
The workflow runs tests, then the pipeline, daily at 06:00 UTC.

## Configuration

| Variable | Where | Purpose |
|---|---|---|
| `OPENROUTER_API_KEY` | both | Preferred AI provider. If absent, `LLM_API_KEY`/`LLM_BASE_URL` are used. |
| `LLM_FAST_MODEL` / `LLM_REASONING_MODEL` / `LLM_PREMIUM_MODEL` | both | Model routing: extraction/classification · clustering/analysis/briefing/ask · major events. |
| `EMBEDDING_MODEL`, `EMBEDDING_BASE_URL`, `EMBEDDING_API_KEY` | both | OpenAI-compatible embeddings (1536-d). Falls back to deterministic hashed embeddings (`hash-v1`). |
| `INTEL_MAX_ARTICLES_PER_RUN`, `INTEL_MAX_LLM_CALLS_PER_RUN` | automation | Per-run budgets. |
| `INTEL_SOURCE_TIERS` | automation | Which source tiers to crawl (default `1,2`). |
| `INTELLIGENCE_ENABLED` | automation | Set `0` to run only the legacy pipelines. |
| `LOG_FORMAT=json` | automation | Structured logs. |

Every AI call is logged to `llm_runs` (task, model, tokens, latency, success, estimated cost);
every run to `pipeline_runs`; every source's health to `sources`.

## Adding a source
Insert a row into `sources` (or add a `SourceSeed` in `automation/newsfall/sources/registry.py`).
Required: `slug`, `name`, `feed_url` (RSS/Atom) or `connector='github_releases'` with
`api_config={"repo":"owner/name"}`, `source_type`, `source_category`, `credibility_score`,
`is_primary_source`, `tier`. Operator edits to `active` and `credibility_score` are never
overwritten by the seed sync.

## Roadmap (Phase 8)
Source discovery workflow · transcript ingestion (podcasts, keynotes, earnings calls) ·
SEC EDGAR connector · social-signal monitoring · relationship graph visualisation where it
aids understanding · weekly intelligence report.

## License
MIT — open source, free to fork.
