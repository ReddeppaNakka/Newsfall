"""
Source connectors. Each returns a list of `FetchedItem` and never raises — a failing
source is reported through `FetchResult.error` so the registry can track health.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

import feedparser
import requests

from ..text import parse_datetime, strip_html

USER_AGENT = "NewsfallBot/0.1 (+https://github.com/ReddeppaNakka/Newsfall; intelligence pipeline)"


@dataclass
class FetchedItem:
    title: str
    url: str
    content: str
    published_at: datetime | None
    author: str | None = None
    metadata: dict = field(default_factory=dict)


@dataclass
class FetchResult:
    items: list[FetchedItem]
    error: str | None = None


def _entry_content(entry) -> str:
    # feedparser exposes full bodies under `content`, otherwise summary/description.
    if getattr(entry, "content", None):
        parts = [c.get("value", "") for c in entry.content if isinstance(c, dict)]
        joined = " ".join(p for p in parts if p)
        if joined.strip():
            return strip_html(joined)
    return strip_html(entry.get("summary") or entry.get("description") or "")


def fetch_rss(feed_url: str, *, limit: int, timeout: int = 25) -> FetchResult:
    """RSS/Atom via requests (so we control UA + timeout) then feedparser."""
    try:
        resp = requests.get(feed_url, headers={"User-Agent": USER_AGENT, "Accept": "application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8"}, timeout=timeout)
        if resp.status_code >= 400:
            return FetchResult([], f"http {resp.status_code}")
        feed = feedparser.parse(resp.content)
    except requests.RequestException as exc:
        return FetchResult([], f"network: {exc}"[:200])
    except Exception as exc:  # noqa: BLE001 — feedparser can raise on exotic input
        return FetchResult([], f"parse: {exc}"[:200])

    if getattr(feed, "bozo", False) and not feed.entries:
        return FetchResult([], f"bozo: {getattr(feed, 'bozo_exception', 'unparseable feed')}"[:200])

    items: list[FetchedItem] = []
    for entry in feed.entries[:limit]:
        title = strip_html(entry.get("title") or "")
        link = (entry.get("link") or "").strip()
        if not title or not link.startswith("http"):
            continue
        published = parse_datetime(entry.get("published_parsed") or entry.get("updated_parsed"))
        author = entry.get("author") or None
        meta = {}
        if entry.get("tags"):
            meta["tags"] = [t.get("term") for t in entry.tags if isinstance(t, dict) and t.get("term")][:10]
        if entry.get("comments"):
            meta["comments_url"] = entry.get("comments")
        items.append(FetchedItem(title=title, url=link, content=_entry_content(entry), published_at=published,
                                 author=author, metadata=meta))
    return FetchResult(items)


def fetch_github_releases(repo: str, *, limit: int, token: str | None = None, timeout: int = 25) -> FetchResult:
    """GitHub Releases API connector (api_config = {"repo": "owner/name"})."""
    headers = {"User-Agent": USER_AGENT, "Accept": "application/vnd.github+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        resp = requests.get(f"https://api.github.com/repos/{repo}/releases", headers=headers,
                            params={"per_page": limit}, timeout=timeout)
        if resp.status_code >= 400:
            return FetchResult([], f"http {resp.status_code}")
        data = resp.json()
    except (requests.RequestException, ValueError) as exc:
        return FetchResult([], str(exc)[:200])
    items = []
    for rel in data if isinstance(data, list) else []:
        if rel.get("draft"):
            continue
        name = rel.get("name") or rel.get("tag_name") or ""
        items.append(FetchedItem(
            title=f"{repo.split('/')[-1]} {name}".strip(), url=rel.get("html_url", ""),
            content=strip_html(rel.get("body") or "")[:12000],
            published_at=parse_datetime(rel.get("published_at")), author=(rel.get("author") or {}).get("login"),
            metadata={"tag": rel.get("tag_name"), "prerelease": bool(rel.get("prerelease"))},
        ))
    return FetchResult([i for i in items if i.url])


def fetch_source(source: dict, *, limit: int, github_token: str | None = None) -> FetchResult:
    connector = source.get("connector") or "rss"
    if connector == "github_releases":
        repo = (source.get("api_config") or {}).get("repo")
        if not repo:
            return FetchResult([], "api_config.repo missing")
        return fetch_github_releases(repo, limit=limit, token=github_token)
    if not source.get("feed_url"):
        return FetchResult([], "feed_url missing")
    return fetch_rss(source["feed_url"], limit=limit)
