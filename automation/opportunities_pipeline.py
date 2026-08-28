"""
Newsfall — Opportunities pipeline
==================================

Hybrid sourcing (as chosen): a hand-curated JSON of the famous, feed-less
opportunities (re:Invent, Smart India Hackathon, GSoC, ...) PLUS automated
scraping of live listings:

  * Devpost  — reliable public JSON API of hackathons (global).
  * Unstop   — India's big opportunities platform (best-effort; non-fatal if it
               changes its API or blocks us).

Everything upserts into public.opportunities, deduped on source_url. Each source
is wrapped so one failure never aborts the run.
"""

from __future__ import annotations

import html
import json
import re
from datetime import datetime
from pathlib import Path

import requests
from supabase import Client

from common import USER_AGENT

CURATED_PATH = Path(__file__).parent / "curated" / "opportunities.json"

VALID_KINDS = {"hackathon", "competition", "conference", "internship", "job", "scholarship"}
DEVPOST_MAX = 18
UNSTOP_MAX = 18
HACKEREARTH_MAX = 18
DEVFOLIO_MAX = 18


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def _strip_html(s: str | None) -> str | None:
    if not s:
        return None
    text = re.sub(r"<[^>]+>", "", s)
    return html.unescape(text).strip() or None


def _iso(value: str | None) -> str | None:
    """Normalise a date string to ISO 8601, or return None if unparseable.

    Accepts both 'YYYY-MM-DD HH:MM:SS+00:00' (HackerEarth) and 'YYYY-MM-DDT...Z'
    (Devfolio). Postgres timestamptz accepts the result.
    """
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).isoformat()
    except (ValueError, AttributeError):
        return None


def _guess_country(location: str | None) -> str:
    if not location:
        return "Global"
    low = location.lower()
    if "india" in low:
        return "India"
    if low in {"online", "virtual", "anywhere", "remote"}:
        return "Global"
    return "Global"


def _upsert(db: Client, rows: list[dict], *, on_conflict: str) -> int:
    """Upsert a batch, skipping rows missing the conflict key. Returns count."""
    clean = [r for r in rows if r.get(on_conflict)]
    if not clean:
        return 0
    db.table("opportunities").upsert(clean, on_conflict=on_conflict).execute()
    return len(clean)


# --------------------------------------------------------------------------- #
# sources
# --------------------------------------------------------------------------- #
def from_curated(db: Client) -> int:
    """Load the curated JSON and upsert each row on slug (so edits propagate on re-run).

    Upserts row-by-row so a single conflict (e.g. a source_url already seeded in
    schema.sql under a different slug) skips just that row instead of losing the batch.
    """
    if not CURATED_PATH.exists():
        print("  ! curated/opportunities.json not found, skipping")
        return 0
    items = json.loads(CURATED_PATH.read_text(encoding="utf-8"))
    n = 0
    for it in items:
        if it.get("kind") not in VALID_KINDS or not it.get("source_url") or not it.get("slug"):
            continue
        try:
            db.table("opportunities").upsert({**it, "is_curated": True}, on_conflict="slug").execute()
            n += 1
        except Exception as exc:  # noqa: BLE001 — one bad row shouldn't drop the rest
            print(f"  ! curated row '{it.get('slug')}' skipped: {getattr(exc, 'message', exc)}")
    print(f"  curated: upserted {n}")
    return n


def from_devpost(db: Client) -> int:
    """Devpost's public hackathons JSON API."""
    try:
        resp = requests.get(
            "https://devpost.com/api/hackathons",
            params={"order_by": "deadline", "status[]": "open"},
            headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
            timeout=30,
        )
        resp.raise_for_status()
        hackathons = resp.json().get("hackathons", [])
    except Exception as exc:  # noqa: BLE001
        print(f"  ! devpost failed (non-fatal): {exc}")
        return 0

    rows = []
    for h in hackathons[:DEVPOST_MAX]:
        url = h.get("url")
        title = h.get("title")
        if not url or not title:
            continue
        location = (h.get("displayed_location") or {}).get("location")
        themes = ", ".join(t.get("name", "") for t in (h.get("themes") or []) if t.get("name"))
        dates = h.get("submission_period_dates")
        desc = "Hackathon on Devpost."
        if themes:
            desc = f"Themes: {themes}."
        if dates:
            desc += f" Runs {dates}."
        rows.append(
            {
                "slug": None,
                "title": title[:200],
                "kind": "hackathon",
                "organizer": "Devpost",
                "description": desc[:300],
                "location": location,
                "country": _guess_country(location),
                "is_remote": bool(location and location.lower() in {"online", "virtual"}),
                "eligibility": "Open to all",
                "prize": _strip_html(h.get("prize_amount")),
                "source_url": url,
                "image_url": h.get("thumbnail_url"),
                "tags": [t.get("name") for t in (h.get("themes") or []) if t.get("name")][:5],
                "accent_color": "cyan",
                "is_curated": False,
            }
        )
    n = _upsert(db, rows, on_conflict="source_url")
    print(f"  devpost: upserted {n}")
    return n


def from_hackerearth(db: Client) -> int:
    """HackerEarth's public events JSON (the feed their browser extension uses)."""
    try:
        resp = requests.get(
            "https://www.hackerearth.com/chrome-extension/events/",
            headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
            timeout=30,
        )
        resp.raise_for_status()
        events = resp.json().get("response", [])
    except Exception as exc:  # noqa: BLE001
        print(f"  ! hackerearth failed (non-fatal): {exc}")
        return 0

    rows = []
    for e in events[:HACKEREARTH_MAX]:
        url = e.get("url")
        title = e.get("title")
        if not url or not title:
            continue
        is_student = bool(e.get("college"))
        rows.append(
            {
                "slug": None,
                "title": str(title)[:200],
                "kind": "hackathon",
                "organizer": "HackerEarth",
                "description": (_strip_html(e.get("description")) or "Hackathon on HackerEarth.")[:300],
                "location": "Online",
                "country": "Global",
                "is_remote": True,
                "eligibility": "Open to students" if is_student else "Open to all",
                "prize": None,
                "deadline": _iso(e.get("end_utc_tz")),
                "starts_at": _iso(e.get("start_utc_tz")),
                "source_url": url,
                "image_url": e.get("thumbnail"),
                "tags": ["students"] if is_student else [],
                "accent_color": "emerald",
                "is_curated": False,
            }
        )
    n = _upsert(db, rows, on_conflict="source_url")
    print(f"  hackerearth: upserted {n}")
    return n


def from_devfolio(db: Client) -> int:
    """Devfolio open hackathons (India-heavy, strong student/university coverage)."""
    try:
        resp = requests.get(
            "https://api.devfolio.co/api/hackathons",
            params={"filter": "application_open", "page": 1},
            headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
            timeout=30,
        )
        resp.raise_for_status()
        listings = resp.json().get("result", [])
    except Exception as exc:  # noqa: BLE001
        print(f"  ! devfolio failed (non-fatal): {exc}")
        return 0

    rows = []
    for h in listings[:DEVFOLIO_MAX]:
        name = h.get("name")
        setting = h.get("hackathon_setting") or {}
        subdomain = setting.get("subdomain") or h.get("slug")
        if not name or not subdomain:
            continue
        country = h.get("country") or _guess_country(h.get("location"))
        location = "Online" if h.get("is_online") else (h.get("city") or h.get("location"))
        themes = h.get("themes") or []
        tags = [t.get("name") if isinstance(t, dict) else t for t in themes if t][:5]
        if h.get("is_university_hackathon"):
            tags.append("students")
        rows.append(
            {
                "slug": None,
                "title": str(name)[:200],
                "kind": "hackathon",
                "organizer": "Devfolio",
                "description": (_strip_html(h.get("tagline")) or "Hackathon on Devfolio.")[:300],
                "location": location,
                "country": country,
                "is_remote": bool(h.get("is_online")),
                "eligibility": "Open to students" if h.get("is_university_hackathon") else "Open to all",
                "prize": None,
                "deadline": _iso(setting.get("reg_ends_at")),
                "starts_at": _iso(h.get("starts_at")),
                "source_url": f"https://{subdomain}.devfolio.co/",
                "image_url": h.get("cover_img") or setting.get("logo"),
                "tags": tags,
                "accent_color": "cyan",
                "is_curated": False,
            }
        )
    n = _upsert(db, rows, on_conflict="source_url")
    print(f"  devfolio: upserted {n}")
    return n


def from_unstop(db: Client) -> int:
    """Unstop (India). Best-effort: their API shape can change or block scrapers."""
    try:
        resp = requests.get(
            "https://unstop.com/api/public/opportunity/search-result",
            params={"opportunity": "hackathons", "per_page": UNSTOP_MAX, "oppstatus": "open"},
            headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
            timeout=30,
        )
        resp.raise_for_status()
        payload = resp.json()
        listings = (payload.get("data") or {}).get("data") or []
    except Exception as exc:  # noqa: BLE001
        print(f"  ! unstop failed (non-fatal): {exc}")
        return 0

    rows = []
    for it in listings[:UNSTOP_MAX]:
        title = it.get("title")
        seo = it.get("seo_url") or it.get("public_url")
        if not title or not seo:
            continue
        url = seo if str(seo).startswith("http") else f"https://unstop.com/{str(seo).lstrip('/')}"
        org = (it.get("organisation") or {}).get("name") or "Unstop"
        rows.append(
            {
                "slug": None,
                "title": str(title)[:200],
                "kind": "hackathon",
                "organizer": org,
                "description": _strip_html(it.get("subtitle")) or "Listed on Unstop.",
                "location": "India",
                "country": "India",
                "is_remote": False,
                "eligibility": "Open to students & freshers",
                "prize": None,
                "source_url": url,
                "image_url": it.get("banner_mobile") or it.get("logoUrl2"),
                "tags": ["india"],
                "accent_color": "violet",
                "is_curated": False,
            }
        )
    n = _upsert(db, rows, on_conflict="source_url")
    print(f"  unstop: upserted {n}")
    return n


# --------------------------------------------------------------------------- #
# entry point
# --------------------------------------------------------------------------- #
def run(db: Client) -> int:
    print("\n=== OPPORTUNITIES ===")
    total = 0
    for source in (from_curated, from_devpost, from_unstop, from_hackerearth, from_devfolio):
        try:
            total += source(db)
        except Exception as exc:  # noqa: BLE001 — isolate per-source failures
            print(f"  ! {source.__name__} crashed (non-fatal): {exc}")
    return total
