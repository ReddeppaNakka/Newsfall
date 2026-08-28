"""
Configuration — every tunable comes from the environment, nothing is hardcoded
to a provider or a production value. Model names are read ONLY here.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field

from dotenv import load_dotenv

load_dotenv()


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except (TypeError, ValueError):
        return default


def _float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, default))
    except (TypeError, ValueError):
        return default


def _bool(name: str, default: bool) -> bool:
    v = os.getenv(name)
    if v is None:
        return default
    return v.strip().lower() in {"1", "true", "yes", "on"}


OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


@dataclass(frozen=True)
class LLMConfig:
    """Provider + model routing. OpenRouter is preferred; the legacy OpenAI-compatible
    LLM_* config (Groq by default) is the fallback so existing deployments keep working."""

    api_key: str | None
    base_url: str
    provider: str  # "openrouter" | "openai-compatible"
    fast_model: str
    reasoning_model: str
    premium_model: str
    embedding_model: str
    embedding_base_url: str
    embedding_api_key: str | None
    embedding_dim: int = 1536
    request_timeout: int = 60
    max_calls_per_run: int = 400
    temperature: float = 0.1

    @property
    def enabled(self) -> bool:
        return bool(self.api_key)

    @property
    def embeddings_enabled(self) -> bool:
        return bool(self.embedding_api_key)


def load_llm_config() -> LLMConfig:
    openrouter_key = os.getenv("OPENROUTER_API_KEY")
    legacy_key = os.getenv("LLM_API_KEY")
    legacy_base = os.getenv("LLM_BASE_URL", "https://api.groq.com/openai/v1")
    legacy_model = os.getenv("LLM_MODEL", "openai/gpt-oss-120b")

    if openrouter_key:
        provider, key, base = "openrouter", openrouter_key, OPENROUTER_BASE_URL
        fast_default = "google/gemini-2.5-flash"
        reasoning_default = "anthropic/claude-sonnet-4.5"
        premium_default = "anthropic/claude-opus-4.1"
    else:
        provider, key, base = "openai-compatible", legacy_key, legacy_base
        fast_default = reasoning_default = premium_default = legacy_model

    emb_key = os.getenv("EMBEDDING_API_KEY") or key
    emb_base = os.getenv("EMBEDDING_BASE_URL") or base

    return LLMConfig(
        api_key=key,
        base_url=base,
        provider=provider,
        fast_model=os.getenv("LLM_FAST_MODEL", fast_default),
        reasoning_model=os.getenv("LLM_REASONING_MODEL", reasoning_default),
        premium_model=os.getenv("LLM_PREMIUM_MODEL", premium_default),
        embedding_model=os.getenv("EMBEDDING_MODEL", "openai/text-embedding-3-small"),
        embedding_base_url=emb_base,
        embedding_api_key=emb_key,
        embedding_dim=_int("EMBEDDING_DIM", 1536),
        request_timeout=_int("LLM_TIMEOUT_SECONDS", 60),
        max_calls_per_run=_int("INTEL_MAX_LLM_CALLS_PER_RUN", 400),
        temperature=_float("LLM_TEMPERATURE", 0.1),
    )


@dataclass(frozen=True)
class PipelineConfig:
    """Per-run budgets and thresholds. Keep the pipeline cheap and predictable."""

    enabled: bool = _bool("INTELLIGENCE_ENABLED", True)
    max_articles_per_run: int = _int("INTEL_MAX_ARTICLES_PER_RUN", 120)
    items_per_source: int = _int("INTEL_ITEMS_PER_SOURCE", 15)
    max_article_age_days: int = _int("INTEL_MAX_ARTICLE_AGE_DAYS", 10)
    min_content_chars: int = _int("INTEL_MIN_CONTENT_CHARS", 80)
    max_content_chars: int = _int("INTEL_MAX_CONTENT_CHARS", 12000)

    # Deduplication
    title_similarity_dup: float = _float("INTEL_TITLE_DUP_THRESHOLD", 0.92)
    embedding_similarity_dup: float = _float("INTEL_EMBED_DUP_THRESHOLD", 0.97)

    # Event clustering bands: >= accept → attach, <= reject → new event, between → ask LLM
    cluster_accept: float = _float("INTEL_CLUSTER_ACCEPT", 0.80)
    cluster_reject: float = _float("INTEL_CLUSTER_REJECT", 0.55)
    cluster_window_days: int = _int("INTEL_CLUSTER_WINDOW_DAYS", 7)
    cluster_candidates: int = _int("INTEL_CLUSTER_CANDIDATES", 8)

    # Analysis routing by importance
    premium_analysis_min_importance: float = _float("INTEL_PREMIUM_MIN_IMPORTANCE", 80)
    analysis_min_importance: float = _float("INTEL_ANALYSIS_MIN_IMPORTANCE", 25)
    max_events_analyzed_per_run: int = _int("INTEL_MAX_EVENTS_ANALYZED", 40)

    # Reports
    daily_briefing: bool = _bool("INTEL_DAILY_BRIEFING", True)

    source_tiers: tuple[int, ...] = field(
        default_factory=lambda: tuple(int(t) for t in os.getenv("INTEL_SOURCE_TIERS", "1,2").split(",") if t.strip())
    )


def load_pipeline_config() -> PipelineConfig:
    return PipelineConfig()
