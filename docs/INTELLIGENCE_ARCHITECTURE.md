# Newsfall Intelligence Architecture

Target design for evolving Newsfall from a tech-news tracker into an evidence-driven
technology, industry and influence intelligence platform. Companion to
`ARCHITECTURE_AUDIT.md`.

## 1. Pipeline

```
sources (registry, credibility, health)
   │  newsfall/ingestion/*            RSS · Atom · Hacker News · arXiv · GitHub releases · Hugging Face
   ▼
raw_articles  (status = PENDING)      original title/url/content/author/published_at/content_hash
   │  newsfall/processing/normalize   clean html → text, canonical url, language, hash
   │  newsfall/processing/dedupe      url → content_hash → title similarity → embedding similarity
   ▼  (status = NORMALIZED)
   │  newsfall/processing/embeddings  vector(1536) via OpenAI-compatible /embeddings, hashed fallback
   │  newsfall/processing/entities    LLM (fast) structured extraction → alias resolution → entity_mentions
   │  newsfall/processing/claims      LLM (fast) structured extraction → claims (+ evidence row per claim)
   ▼  (status = ENTITIES_EXTRACTED → CLAIMS_EXTRACTED)
   │  newsfall/intelligence/clustering   candidates by vector sim + entity overlap + time window;
   │                                     deterministic accept/reject bands; LLM (reasoning) only in the grey zone
   ▼  (status = CLUSTERED)               events · event_articles · event_entities
   │  newsfall/intelligence/verification claim status from evidence (source tiers, independence, stance)
   │  newsfall/intelligence/contradiction stance CONTRADICTS across sources → DISPUTED / SUPERSEDED
   │  newsfall/intelligence/scoring       composite 0–100: magnitude · entity influence · industry impact ·
   │                                     cross-source confirmation · credibility · novelty
   ▼  (status = VERIFIED)
   │  newsfall/intelligence/analysis     LLM (reasoning/premium by importance): why it matters, impact,
   │                                     affected entities, what to watch, relationships
   │  newsfall/intelligence/watch        watch_items from unresolved claims + "what to watch"
   │  newsfall/intelligence/briefing     daily intelligence_reports
   ▼  (status = PUBLISHED)
Supabase (pgvector)  ──►  Next.js: /intelligence · /events/[slug] · /entities/[slug] · /ask · /api/*
```

Every stage is a function `stage(db, cfg, llm) -> Stats` that is idempotent, re-runnable, and
bounded by per-run budgets. A failure marks the article `ingestion_status='FAILED'` with `error`
and `retry_count`; the next run retries from the failed stage (status tells it where to resume).

## 2. Schema additions (`supabase/migrations/001_intelligence_foundation.sql`)

| table | purpose | key columns |
|---|---|---|
| `sources` | source registry & health | slug, source_type, source_category, tier, credibility_score, is_primary_source, feed_url, active, consecutive_failures |
| `raw_articles` | immutable evidence | source_id, url (unique), content_hash, content, published_at, ingestion_status, embedding, embedding_model |
| `entities` | universal entity model | slug, entity_type, aliases[], influence_score, technology_id → technologies |
| `entity_aliases` | alias → entity | alias_normalized (unique) |
| `entity_mentions` | article ↔ entity | mention_type, confidence, context |
| `events` | one row per real-world event | slug, event_type, status, importance_score, confidence_score, why_it_matters, industry_impact, what_to_watch[], embedding |
| `event_articles` | evidence attachment | event_id, article_id, similarity, is_primary |
| `event_entities` | event ↔ entity roles | role |
| `claims` | atomic assertions | claim_text, claim_type, status, subject/object entity, confidence, article_id, event_id |
| `claim_evidence` | claim ↔ article stance | stance, credibility_weight, excerpt |
| `entity_relationships` | typed graph edges | relationship_type, confidence, valid_from/to, status, evidence_article_id |
| `watch_items` | what to watch | kind (UPCOMING/EMERGING/SPECULATIVE), confidence, expected_timeframe, status |
| `intelligence_reports` | briefings | kind, period, content jsonb |
| `llm_runs` | AI observability | task_type, model, tokens, latency_ms, success, estimated_cost_usd |
| `pipeline_runs` | run observability | stats jsonb |

RPC: `match_articles`, `match_events`, `match_entities` (cosine, pgvector). View `articles_public`
exposes articles without full `content`. RLS: public SELECT on intelligence tables; `raw_articles`,
`llm_runs`, `pipeline_runs` are service-role only.

Controlled vocabularies are enforced with CHECK constraints (not free text): source_type,
source_category, entity_type, event_type, event status, claim_type, claim status, stance,
relationship_type, watch kind/status, ingestion_status.

## 3. AI gateway (`automation/newsfall/llm.py`)

`LLMService` with roles `fast | reasoning | premium` and `embed()`. Provider is OpenRouter when
`OPENROUTER_API_KEY` is set, else the existing OpenAI-compatible `LLM_BASE_URL`/`LLM_API_KEY`
(Groq). Model names come only from env (`LLM_FAST_MODEL`, `LLM_REASONING_MODEL`,
`LLM_PREMIUM_MODEL`, `EMBEDDING_MODEL`). Every call: JSON mode → pydantic validation → one repair
retry → `None`. Every call is logged to `llm_runs`. Per-run call budget is enforced centrally.

Task → role routing lives in `llm.py::ROUTING` and nowhere else.

## 4. Scoring (deterministic + AI)

```
importance = 25·magnitude + 20·entity_influence + 15·industry_impact
           + 15·cross_source + 10·credibility + 10·novelty + 5·recency      (each 0..1)
```
`magnitude` and `industry_impact` come from the LLM analysis (bounded 0..1); everything else is
computed from the database. `confidence` = f(best source tier, independent source count, stance
agreement, primary confirmation) — never an LLM number.

Verification ladder: 1 source → REPORTED · 2 independent high-quality → PARTIALLY_CONFIRMED ·
primary source → CONFIRMED · contradiction → DISPUTED · social-only → UNVERIFIED.

## 5. Frontend additions (`web/`)

- `lib/intelligence.ts` — typed server queries (events, entities, claims, evidence, watch, reports).
- `/intelligence` feed · `/events/[slug]` · `/entities` · `/entities/[slug]` · `/ask`.
- `/api/events`, `/api/entities`, `/api/search`, `/api/ask` — paginated, filterable JSON.
- Homepage: `TopIntelligence` block above the existing highlights, rendered only when events exist.
- `lib/ai.ts` — server-only chat + embeddings for `/ask` (OpenRouter or existing LLM config).

## 6. Phases

| phase | deliverable | status |
|---|---|---|
| 0 | audit + this document | done |
| 1 | migration 001, source seeds, `newsfall/` package skeleton, ingestion → raw_articles | done |
| 2 | LLM gateway, schemas, entity + claim extraction, embeddings | done |
| 3 | clustering, evidence aggregation, importance scoring | done |
| 4 | verification, contradiction, confidence | done |
| 5 | intelligence analysis, relationships, watch items, daily briefing | done |
| 6 | intelligence feed, event & entity pages, homepage block | done |
| 7 | semantic search + Ask Newsfall | done |
| 8 | influence scoring, source discovery, transcripts, forecasting refinements | roadmap |

## 7. Running

```bash
cd automation
pip install -r requirements.txt
python scraper.py                 # legacy pipelines + intelligence run (INTELLIGENCE_ENABLED=1)
python -m newsfall.run            # intelligence pipeline only
python -m newsfall.run --stage ingest|process|cluster|verify|analyze|report
python -m pytest tests            # unit tests (no network, no DB)
```

Required env (automation): `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, and either
`OPENROUTER_API_KEY` or `LLM_API_KEY`+`LLM_BASE_URL`. Optional: `LLM_FAST_MODEL`,
`LLM_REASONING_MODEL`, `LLM_PREMIUM_MODEL`, `EMBEDDING_MODEL`, `EMBEDDING_BASE_URL`,
`EMBEDDING_API_KEY`, `INTEL_MAX_ARTICLES_PER_RUN`, `INTEL_MAX_LLM_CALLS_PER_RUN`.

Web: existing vars plus optional `OPENROUTER_API_KEY`, `LLM_FAST_MODEL`, `LLM_REASONING_MODEL`,
`EMBEDDING_MODEL`.
