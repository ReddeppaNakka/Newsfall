"""
Newsfall automation — shared helpers
=====================================

Env loading, the Supabase client, and a single OpenAI-compatible LLM call used by
both the tools and opportunities pipelines. Keeping this in one place means the
pipelines stay small and the LLM/config behaviour is consistent.
"""

from __future__ import annotations

import json
import os
import time

import requests
from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

LLM_API_KEY = os.getenv("LLM_API_KEY")
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://api.groq.com/openai/v1")
LLM_MODEL = os.getenv("LLM_MODEL", "llama-3.3-70b-versatile")

# A browser-ish UA — some opportunity sites reject the default python-requests UA.
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)


def get_db() -> Client:
    """One service-role Supabase client, shared by all pipelines."""
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def llm_json(prompt: str, *, max_tokens: int = 400) -> dict | None:
    """Call the chat endpoint and parse a STRICT-JSON response.

    Returns the parsed dict, or None if no key is configured or the call fails.
    Callers must always handle None with a sensible fallback so the pipeline
    never blocks on the LLM.
    """
    if not LLM_API_KEY:
        return None
    # Retry on rate limits (429) with backoff — free LLM tiers cap requests/minute.
    for attempt in range(4):
        try:
            resp = requests.post(
                f"{LLM_BASE_URL}/chat/completions",
                headers={"Authorization": f"Bearer {LLM_API_KEY}"},
                json={
                    "model": LLM_MODEL,
                    "temperature": 0.1,
                    "max_tokens": max_tokens,
                    "response_format": {"type": "json_object"},
                    "messages": [{"role": "user", "content": prompt}],
                },
                timeout=30,
            )
            if resp.status_code == 429:
                # Honour Retry-After if present, else exponential backoff.
                wait = float(resp.headers.get("retry-after", 2 ** attempt))
                print(f"  … rate limited, waiting {wait:.0f}s")
                time.sleep(min(wait, 30))
                continue
            resp.raise_for_status()
            return json.loads(resp.json()["choices"][0]["message"]["content"])
        except Exception as exc:  # noqa: BLE001 — never let the LLM break the run
            print(f"  ! LLM call failed: {exc}")
            return None
    return None
