"""
News_Pond — Trending repositories pipeline
==========================================

Notable open-source repos worth learning from or contributing to, from the official
GitHub Search API. NO LLM calls. Deduped on url.

Rate limits: the Search API allows 10 requests/min unauthenticated, 30/min with a
token. We make only a handful of queries per run. If GITHUB_TOKEN is set (the daily
GitHub Action provides one automatically), we use it for the higher limit.
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

import requests
from supabase import Client

from common import USER_AGENT

PER_QUERY = 15

# (label, query, marks_good_first_issue). {since} is filled with a recent date so we
# surface actively-maintained repos, not long-dead ones.
QUERIES = [
    ("trending", "stars:>2000 pushed:>{since}", False),
    ("ai/ml", "topic:machine-learning stars:>800 pushed:>{since}", False),
    ("beginner-friendly", "good-first-issues:>10 stars:>500 pushed:>{since}", True),
]


def _headers() -> dict:
    h = {"User-Agent": USER_AGENT, "Accept": "application/vnd.github+json"}
    token = os.getenv("GITHUB_TOKEN")
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


def _upsert(db: Client, row: dict) -> None:
    db.table("repos").upsert(row, on_conflict="url").execute()


def run(db: Client) -> int:
    since = (datetime.now(timezone.utc) - timedelta(days=90)).strftime("%Y-%m-%d")
    headers = _headers()
    total = 0
    seen: set[str] = set()

    for label, template, gfi in QUERIES:
        query = template.format(since=since)
        try:
            resp = requests.get(
                "https://api.github.com/search/repositories",
                headers=headers,
                params={"q": query, "sort": "stars", "order": "desc", "per_page": PER_QUERY},
                timeout=25,
            )
            resp.raise_for_status()
            items = resp.json().get("items", [])
        except Exception as exc:  # noqa: BLE001 — one bad query never aborts the run
            print(f"  ! github [{label}] failed: {exc}")
            continue

        added = 0
        for repo in items:
            url = repo.get("html_url")
            if not url or url in seen:
                continue
            seen.add(url)
            _upsert(
                db,
                {
                    "slug": repo.get("full_name"),
                    "name": repo.get("name"),
                    "owner": (repo.get("owner") or {}).get("login"),
                    "url": url,
                    "description": (repo.get("description") or "")[:400] or None,
                    "language": repo.get("language"),
                    "stars": int(repo.get("stargazers_count", 0)),
                    "topics": list(repo.get("topics") or [])[:8],
                    "is_good_first_issue": gfi,
                    "source": "GitHub",
                    "pushed_at": repo.get("pushed_at"),
                },
            )
            added += 1
        print(f"  github [{label}]: upserted {added}")
        total += added
    return total
