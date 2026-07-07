"""
News_Pond — Jobs & internships pipeline
=======================================

Fresher-focused job listings from FREE, scraping-permitted sources only:

  * RemoteOK         — official public JSON API (remote jobs, global).
  * We Work Remotely — official RSS category feeds (remote jobs, global).

Both are remote-first, so an Indian fresher can apply from anywhere. India-specific
listings keep coming from Unstop via the opportunities pipeline (the big India job
portals — LinkedIn, Internshala — forbid scraping, so we deliberately don't touch them).

NO LLM calls: every field is parsed from structured data, so this is cheap and safe to
re-run. Everything upserts into public.jobs, deduped on apply_url. Each source is wrapped
so one failure never aborts the run.
"""

from __future__ import annotations

import html
import re
import time

import feedparser
import requests
from supabase import Client

from common import USER_AGENT

REMOTEOK_MAX = 40
WWR_MAX_PER_FEED = 20

# We Work Remotely category feeds most relevant to freshers/devs.
WWR_FEEDS = [
    "https://weworkremotely.com/categories/remote-programming-jobs.rss",
    "https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss",
    "https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss",
]

# Only keep genuinely technical roles — RemoteOK & WWR also list admin, customer
# support, sales and data-entry jobs that don't belong on a dev-career platform.
# A role qualifies if its TITLE names a tech role, or its tags include a strong
# tech signal (a language/framework/stack).
TECH_TITLE_HINTS = (
    "developer", "engineer", "programmer", "software", "frontend", "front-end",
    "front end", "backend", "back-end", "back end", "full stack", "full-stack",
    "fullstack", "web dev", "mobile dev", "ios", "android", "devops", "sre",
    "site reliability", "data scientist", "data analyst", "data engineer",
    "machine learning", "ai engineer", "designer", "ui/ux", "cloud", "database",
    "platform engineer", "qa engineer", "quality assurance", "security engineer",
    "python", "javascript", "typescript", "react", "node", "golang", "rust",
    "php ", "ruby", "kotlin", "swift",
)
STRONG_TECH_TAGS = {
    "python", "javascript", "typescript", "react", "node", "nodejs", "golang", "go",
    "rust", "java", "php", "ruby", "django", "rails", "vue", "angular", "kubernetes",
    "docker", "aws", "devops", "backend", "frontend", "full stack", "machine learning",
    "data science", "postgres", "sql", "graphql", "android", "ios", "swift", "kotlin",
}

# Non-tech roles that must be rejected even if a stray tech tag/word appears. RemoteOK
# especially tags business/sales/marketing jobs with tech tags, so we gate on the TITLE:
# a clear non-tech title always loses, and we do NOT trust tags to admit a role.
NON_TECH_HINTS = (
    "business development", "account executive", "account strategist", "account manager",
    "sales ", "marketing", "martech", "gtm ", "growth manager", "recruiter", "talent ",
    "customer success", "customer support", "project manager", "product manager",
    "operations manager", "finance", "accountant", "bookkeep", "human resources", " hr ",
    "executive assistant", "administrative", "office manager", "content writer",
    "copywriter", "community manager", "social media", "seo ", "paralegal",
    "virtual assistant", "data entry", "file clerk",
)


def _is_tech(title: str | None) -> bool:
    # Pad with spaces so word-ish hints (" hr ", "sales ") don't match inside other words.
    t = f" {(title or '').lower()} "
    if any(bad in t for bad in NON_TECH_HINTS):
        return False
    return any(h in t for h in TECH_TITLE_HINTS)


# Words that flag an entry-level / fresher-friendly role...
FRESHER_HINTS = (
    "junior", "jr.", "jr ", "entry", "graduate", "new grad", "new-grad", "fresher",
    "trainee", "intern", "internship", "early career", "no experience", "associate",
    "0-1", "0 - 1", "0 to 1",
)
# ...unless one of these clearly-senior words is present (those win).
SENIOR_HINTS = (
    "senior", "sr.", "sr ", "lead", "principal", "staff", "manager", "head of",
    "director", "architect", " vp", "vice president",
)


def _strip_html(s: str | None) -> str | None:
    if not s:
        return None
    text = re.sub(r"<[^>]+>", "", s)
    return (html.unescape(text).strip() or None)


def _is_fresher(*parts: str | None) -> bool:
    """Heuristic: fresher-friendly if a junior/entry cue appears and no senior cue does."""
    text = " ".join(p for p in parts if p).lower()
    if any(s in text for s in SENIOR_HINTS):
        return False
    return any(h in text for h in FRESHER_HINTS)


def _country(location: str | None) -> str:
    if location and "india" in location.lower():
        return "India"
    return "Global"


def _salary(job: dict) -> str | None:
    lo, hi = job.get("salary_min"), job.get("salary_max")
    try:
        lo, hi = int(lo), int(hi)
    except (TypeError, ValueError):
        return None
    if lo <= 0 and hi <= 0:
        return None
    fmt = lambda n: f"${n // 1000}k" if n >= 1000 else f"${n}"
    return f"{fmt(lo)}–{fmt(hi)}" if lo and hi else fmt(hi or lo)


def _upsert(db: Client, row: dict) -> None:
    db.table("jobs").upsert(row, on_conflict="apply_url").execute()


# --------------------------------------------------------------------------- #
# Sources
# --------------------------------------------------------------------------- #
def _remoteok(db: Client) -> int:
    """RemoteOK public JSON API. Element [0] is a legal notice — skip non-job dicts."""
    resp = requests.get(
        "https://remoteok.com/api",
        headers={"User-Agent": USER_AGENT},
        timeout=25,
    )
    resp.raise_for_status()
    data = resp.json()
    n = 0
    for job in data:
        if n >= REMOTEOK_MAX:
            break
        if not isinstance(job, dict) or not job.get("position"):
            continue
        apply_url = job.get("apply_url") or job.get("url")
        if not apply_url:
            continue
        tags = [str(t).lower() for t in (job.get("tags") or []) if t][:10]
        title = str(job.get("position"))[:120]
        if not _is_tech(title):
            continue  # skip admin / support / sales / data-entry roles
        location = job.get("location") or "Remote"
        desc = _strip_html(job.get("description"))
        skills = [t for t in tags if t in STRONG_TECH_TAGS][:8]
        _upsert(
            db,
            {
                "slug": job.get("slug"),
                "title": title,
                "company": job.get("company"),
                "location": location,
                "country": _country(location),
                "is_remote": True,
                "is_fresher": _is_fresher(title, " ".join(tags), desc),
                "skills": skills,
                "salary": _salary(job),
                "apply_url": apply_url,
                "source": "RemoteOK",
                "tags": tags,
                "description": desc[:400] if desc else None,
                "posted_at": job.get("date"),
            },
        )
        n += 1
    return n


def _wwr(db: Client) -> int:
    """We Work Remotely RSS. Titles look like 'Company: Position'."""
    n = 0
    for url in WWR_FEEDS:
        feed = feedparser.parse(url)
        for entry in feed.entries[:WWR_MAX_PER_FEED]:
            raw = entry.get("title", "")
            link = entry.get("link")
            if not raw or not link:
                continue
            company, _, position = raw.partition(":")
            if position:
                company, title = company.strip(), position.strip()[:120]
            else:
                company, title = None, raw.strip()[:120]
            if not _is_tech(title):
                continue  # WWR is dev-focused, but drop the odd non-tech listing
            desc = _strip_html(entry.get("summary") or entry.get("description"))
            posted = None
            if getattr(entry, "published_parsed", None):
                posted = time.strftime("%Y-%m-%dT%H:%M:%SZ", entry.published_parsed)
            _upsert(
                db,
                {
                    "slug": link.rstrip("/").rsplit("/", 1)[-1] or None,
                    "title": title,
                    "company": company,
                    "location": "Remote",
                    "country": "Global",
                    "is_remote": True,
                    "is_fresher": _is_fresher(title, desc),
                    "skills": [],
                    "salary": None,
                    "apply_url": link,
                    "source": "We Work Remotely",
                    "tags": [],
                    "description": desc[:400] if desc else None,
                    "posted_at": posted,
                },
            )
            n += 1
    return n


# --------------------------------------------------------------------------- #
# Entry point
# --------------------------------------------------------------------------- #
def run(db: Client) -> int:
    total = 0
    for name, fn in (("remoteok", _remoteok), ("wwr", _wwr)):
        try:
            count = fn(db)
            print(f"  {name}: upserted {count}")
            total += count
        except Exception as exc:  # noqa: BLE001 — one bad source never aborts the run
            print(f"  ! {name} failed: {exc}")
    return total
