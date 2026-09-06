"""load_llm_config must ignore EMPTY env values (GitHub Actions injects unset vars as "")."""

from newsfall.config import load_llm_config


def test_empty_model_vars_fall_back_to_defaults(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-test")
    for name in ("LLM_FAST_MODEL", "LLM_REASONING_MODEL", "LLM_PREMIUM_MODEL", "EMBEDDING_MODEL",
                 "EMBEDDING_BASE_URL", "LLM_BASE_URL", "LLM_MODEL", "INTEL_MAX_LLM_CALLS_PER_RUN"):
        monkeypatch.setenv(name, "")

    cfg = load_llm_config()

    assert cfg.provider == "openrouter"
    assert cfg.fast_model == "google/gemini-2.5-flash-lite"
    assert cfg.reasoning_model == "google/gemini-2.5-flash"
    assert cfg.premium_model == "anthropic/claude-sonnet-4.5"
    assert cfg.embedding_model == "openai/text-embedding-3-small"
    assert cfg.embedding_base_url == cfg.base_url
    assert cfg.max_calls_per_run == 400


def test_explicit_model_vars_still_win(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-test")
    monkeypatch.setenv("LLM_PREMIUM_MODEL", "google/gemini-2.5-flash")

    assert load_llm_config().premium_model == "google/gemini-2.5-flash"
