"""
News_Pond — Learning resources pipeline
=======================================

Free courses, certifications, and conference/course videos — all from official,
free sources with NO LLM calls (everything parsed from structured data):

  * Microsoft Learn Catalog API — official JSON of free courses AND certifications.
  * YouTube RSS — freeCodeCamp (full-length courses) + Google / Microsoft / AWS
    developer channels (conference talks & tutorials). No API key needed.

Everything upserts into public.learning_resources, deduped on url. Each source is
wrapped so one failure never aborts the run.
"""

from __future__ import annotations

import html
import json
import re
from pathlib import Path

import feedparser
import requests
from supabase import Client

from common import USER_AGENT

CURATED_PATH = Path(__file__).parent / "curated" / "courses.json"

MSLEARN_COURSE_MAX = 40
MSLEARN_CERT_MAX = 40
YOUTUBE_PER_CHANNEL = 8

# Keep only technical MS Learn content — the catalog is full of business-user /
# sales / functional-consultant material (Dynamics 365 etc.) that doesn't belong on
# a developer-career platform. A course/cert qualifies if it targets a dev role.
DEV_ROLES = {
    "developer", "data-scientist", "ai-engineer", "data-engineer", "devops-engineer",
    "solution-architect", "security-engineer", "administrator", "network-engineer",
    "ai-edge-engineer", "data-analyst", "student",
}


def _is_dev(item: dict) -> bool:
    return bool(set(item.get("roles") or []) & DEV_ROLES)

# (display name, channel_id, kind, provider). freeCodeCamp posts full courses;
# the vendor dev channels are mostly talks/tutorials.
YOUTUBE_SOURCES = [
    ("freeCodeCamp", "UC8butISFwT-Wl7EV0hUK0BQ", "course", "freeCodeCamp"),
    ("Google for Developers", "UC_x5XG1OV2P6uZZ5FSM9Ttw", "talk", "Google"),
    ("Microsoft Developer", "UCsMica-v34Irf9KVTh6xx-g", "talk", "Microsoft"),
    ("AWS Events", "UCT-nPlVzJI-ccQXlxjSvJmw", "talk", "AWS"),
]


def _strip_html(s: str | None) -> str | None:
    if not s:
        return None
    return (html.unescape(re.sub(r"<[^>]+>", "", s)).strip() or None)


def _level(levels) -> str | None:
    if isinstance(levels, list) and levels:
        return str(levels[0]).replace("-", " ").title()
    return None


def _upsert(db: Client, row: dict) -> None:
    db.table("learning_resources").upsert(row, on_conflict="url").execute()


def _slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:80]


# --------------------------------------------------------------------------- #
# Curated — famous, hand-picked courses & certifications (Claude, AWS, GCP,
# Meta, CS50, CKA, ...). These have no single API, so we maintain them by hand
# and flag them is_featured so they surface first. Deduped on url like everything.
# --------------------------------------------------------------------------- #
def _curated(db: Client) -> int:
    try:
        items = json.loads(CURATED_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        print(f"  ! could not read curated courses: {exc}")
        return 0
    n = 0
    for it in items:
        url = it.get("url")
        title = it.get("title")
        if not url or not title:
            continue
        _upsert(
            db,
            {
                "slug": it.get("slug") or _slugify(title),
                "title": title[:200],
                "kind": it.get("kind", "course"),
                "provider": it.get("provider"),
                "url": url,
                "description": it.get("description"),
                "level": it.get("level"),
                "topics": list(it.get("topics") or [])[:6],
                "is_free": bool(it.get("is_free", True)),
                "has_certificate": bool(it.get("has_certificate", False)),
                "duration": it.get("duration"),
                "image_url": it.get("image_url"),
                "source": "Curated",
                "is_featured": True,
            },
        )
        n += 1
    return n


# --------------------------------------------------------------------------- #
# Microsoft Learn
# --------------------------------------------------------------------------- #
def _microsoft_learn(db: Client) -> int:
    resp = requests.get(
        "https://learn.microsoft.com/api/catalog/?locale=en-us",
        headers={"User-Agent": USER_AGENT},
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    n = 0

    # Courses — technical roles only, newest first.
    courses = sorted(
        (c for c in data.get("courses", []) if _is_dev(c)),
        key=lambda c: c.get("last_modified", ""),
        reverse=True,
    )
    for c in courses[:MSLEARN_COURSE_MAX]:
        url = c.get("url")
        if not url:
            continue
        hours = c.get("duration_in_hours")
        _upsert(
            db,
            {
                "slug": c.get("uid") or c.get("course_number"),
                "title": str(c.get("title", ""))[:200],
                "kind": "course",
                "provider": "Microsoft Learn",
                "url": url,
                "description": _strip_html(c.get("summary")),
                "level": _level(c.get("levels")),
                "topics": [str(p) for p in (c.get("products") or [])][:6],
                "is_free": True,
                "has_certificate": False,
                "duration": f"{hours} hours" if hours else None,
                "image_url": c.get("icon_url"),
                "source": "Microsoft Learn",
                "published_at": c.get("last_modified"),
            },
        )
        n += 1

    # Certifications — technical roles only, newest first.
    certs = sorted(
        (c for c in data.get("certifications", []) if _is_dev(c)),
        key=lambda c: c.get("last_modified", ""),
        reverse=True,
    )
    for c in certs[:MSLEARN_CERT_MAX]:
        url = c.get("url")
        if not url:
            continue
        _upsert(
            db,
            {
                "slug": c.get("uid"),
                "title": str(c.get("title", ""))[:200],
                "kind": "certification",
                "provider": "Microsoft Learn",
                "url": url,
                "description": _strip_html(c.get("subtitle")),
                "level": _level(c.get("levels")),
                "topics": [str(r) for r in (c.get("roles") or [])][:6],
                "is_free": True,  # the learning path is free; the exam may cost
                "has_certificate": True,
                "duration": None,
                "image_url": c.get("icon_url"),
                "source": "Microsoft Learn",
                "published_at": c.get("last_modified"),
            },
        )
        n += 1
    return n


# --------------------------------------------------------------------------- #
# YouTube (courses + talks)
# --------------------------------------------------------------------------- #
def _youtube(db: Client) -> int:
    import time

    n = 0
    for name, channel_id, kind, provider in YOUTUBE_SOURCES:
        feed = feedparser.parse(
            f"https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}"
        )
        for entry in feed.entries[:YOUTUBE_PER_CHANNEL]:
            url = entry.get("link")
            title = entry.get("title")
            if not url or not title:
                continue
            thumb = None
            media = entry.get("media_thumbnail")
            if isinstance(media, list) and media:
                thumb = media[0].get("url")
            published = None
            if getattr(entry, "published_parsed", None):
                published = time.strftime("%Y-%m-%dT%H:%M:%SZ", entry.published_parsed)
            _upsert(
                db,
                {
                    "slug": entry.get("yt_videoid") or url.rsplit("=", 1)[-1],
                    "title": str(title)[:200],
                    "kind": kind,
                    "provider": provider,
                    "url": url,
                    "description": _strip_html(entry.get("summary"))[:400]
                    if entry.get("summary")
                    else None,
                    "level": None,
                    "topics": [],
                    "is_free": True,
                    "has_certificate": False,
                    "duration": None,
                    "image_url": thumb,
                    "source": f"YouTube · {name}",
                    "published_at": published,
                },
            )
            n += 1
    return n


# --------------------------------------------------------------------------- #
# Entry point
# --------------------------------------------------------------------------- #
def run(db: Client) -> int:
    total = 0
    for name, fn in (
        ("curated", _curated),
        ("microsoft-learn", _microsoft_learn),
        ("youtube", _youtube),
    ):
        try:
            count = fn(db)
            print(f"  {name}: upserted {count}")
            total += count
        except Exception as exc:  # noqa: BLE001 — one bad source never aborts the run
            print(f"  ! {name} failed: {exc}")
    return total
