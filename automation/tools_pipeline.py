"""
News_Pond — Tools & models pipeline
===================================

Two complementary strategies so new tools surface automatically:

1. TARGETED feeds  — official blogs for things we always want (Gemini, GPT, Claude,
   Python, Tailwind). Precise: items are keyword-matched to a known slug.

2. DISCOVERY feeds — broad AI / dev-news feeds. Every item is run through an LLM
   *classifier* that decides "is this a NEW or updated developer tool / AI model?"
   and, if so, extracts its name, slug, and category. This is what makes brand-new
   tools (e.g. a fresh model from ZhipuAI) appear without anyone hardcoding them.

Both write into the same technologies/updates tables, deduped by updates.source_url.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from pathlib import Path

import feedparser

from common import llm_json
from supabase import Client

HOMEPAGES_PATH = Path(__file__).parent / "curated" / "homepages.json"

ALLOWED_ACCENTS = {"violet", "cyan", "emerald"}
ALLOWED_CATEGORIES = {
    "Frontier Models",
    "Languages",
    "Frameworks",
    "AI Tools",
    "Developer Tools",
}


@dataclass
class Targeted:
    feed_url: str
    tech_slug: str
    keywords: tuple[str, ...]


# Precise, always-tracked sources.
# An EMPTY keywords tuple means "this is the tool's OWN official blog — every item is
# about it, so accept them all" (no keyword filter needed). A non-empty tuple keeps only
# items whose title mentions one of the keywords (for multi-topic company blogs).
TARGETED_SOURCES: list[Targeted] = [
    Targeted("https://blog.google/technology/google-deepmind/rss/", "gemini-pro",
             ("gemini", "deepmind")),
    Targeted("https://openai.com/blog/rss.xml", "gpt", ("gpt", "openai", "o1", "o3")),
    Targeted("https://www.anthropic.com/rss.xml", "claude-opus", ("claude", "anthropic", "opus")),
    Targeted("https://blog.python.org/feeds/posts/default", "python", ("python",)),
    Targeted("https://tailwindcss.com/feeds/feed.xml", "tailwindcss", ("tailwind",)),
    # Official single-project blogs — accept every item (keywords empty).
    Targeted("https://react.dev/rss.xml", "react", ()),
    Targeted("https://nodejs.org/en/feed/blog.xml", "nodejs", ()),
    Targeted("https://devblogs.microsoft.com/typescript/feed/", "typescript", ()),
    Targeted("https://blog.rust-lang.org/feed.xml", "rust", ()),
    Targeted("https://go.dev/blog/feed.atom", "go", ()),
    Targeted("https://code.visualstudio.com/feed.xml", "vscode", ()),
    Targeted("https://nextjs.org/feed.xml", "nextjs", ()),
]

TECH_DEFAULTS: dict[str, dict] = {
    "gemini-pro": {"name": "Gemini Pro", "category": "Frontier Models", "accent_color": "cyan"},
    "gpt": {"name": "GPT", "category": "Frontier Models", "accent_color": "emerald"},
    "claude-opus": {"name": "Claude Opus", "category": "Frontier Models", "accent_color": "violet"},
    "python": {"name": "Python", "category": "Languages", "accent_color": "emerald"},
    "tailwindcss": {"name": "Tailwind CSS", "category": "Frameworks", "accent_color": "cyan"},
    "react": {"name": "React", "category": "Frameworks", "accent_color": "cyan"},
    "nodejs": {"name": "Node.js", "category": "Frameworks", "accent_color": "emerald"},
    "typescript": {"name": "TypeScript", "category": "Languages", "accent_color": "cyan"},
    "rust": {"name": "Rust", "category": "Languages", "accent_color": "violet"},
    "go": {"name": "Go", "category": "Languages", "accent_color": "cyan"},
    "vscode": {"name": "VS Code", "category": "Developer Tools", "accent_color": "violet"},
    "nextjs": {"name": "Next.js", "category": "Frameworks", "accent_color": "violet"},
}

# Broad feeds — anything genuinely new gets discovered & auto-created. All free RSS,
# no API key. Keep this list high-signal: every item here costs one LLM classify call.
DISCOVERY_FEEDS: list[str] = [
    "https://huggingface.co/blog/feed.xml",
    "https://techcrunch.com/category/artificial-intelligence/feed/",
    "https://venturebeat.com/category/ai/feed/",
    "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
    "https://hnrss.org/frontpage?points=150",  # only high-signal HN items
    "https://dev.to/feed",                      # developer community — new tools/libraries
    "https://feed.infoq.com/",                  # architecture, languages, frameworks
    "https://github.blog/feed/",                # GitHub product + open-source news
]

ITEMS_PER_TARGETED = 10
ITEMS_PER_DISCOVERY = 10
# Backstop for the free LLM tier: never make more than this many discovery-classify
# calls in a single run. Whatever's left is picked up by the next daily run. Combined
# with skip-already-seen (see run()), a typical day makes far fewer calls than this.
MAX_DISCOVERY_CLASSIFICATIONS = 45


# --------------------------------------------------------------------------- #
# LLM helpers
# --------------------------------------------------------------------------- #
def _importance(v) -> int:
    """Coerce an LLM importance value into an int in [1, 5]; default 2 if unusable."""
    try:
        return max(1, min(5, int(v)))
    except (TypeError, ValueError):
        return 2


def structure_known(title: str, content: str) -> dict:
    """Condense a targeted-feed item into clean fields (title/summary/version/importance)."""
    fallback = {"title": title[:90], "summary": (content or "")[:200] or None, "version": None, "importance": 2}
    data = llm_json(
        "You are a precise tech-news editor. Given a raw feed item, return STRICT JSON:\n"
        '{"title": "<concise headline, max 90 chars>",\n'
        ' "summary": "<one neutral sentence, max 200 chars>",\n'
        ' "version": "<version string introduced, or null>",\n'
        ' "importance": <integer 1-5: 5=major launch/new version/model release, '
        '3=notable update, 1=minor or tangential news>}\n\n'
        f"Raw title: {title}\nRaw content: {content[:1500]}\n\n"
        "Return ONLY the JSON object."
    )
    if not data:
        return fallback
    return {
        "title": (data.get("title") or title)[:90],
        "summary": data.get("summary"),
        "version": data.get("version"),
        "importance": _importance(data.get("importance")),
    }


def classify_discovery(title: str, content: str) -> dict | None:
    """Decide if a broad-feed item announces a developer tool / AI model.

    Returns a dict ready to upsert, or None if it's not relevant (news, opinion,
    funding gossip, etc.) or the LLM is unavailable.
    """
    data = llm_json(
        "You curate a HIGH-QUALITY tracker of programming languages, frameworks, AI "
        "models, and mainstream developer tools that a software engineer or CS student "
        "would realistically learn or adopt. Decide if the item announces a NEW or "
        "UPDATED such tool/model.\n\n"
        "Set relevant=TRUE only for a real, named, adoptable product: a programming "
        "language, framework/library, AI model, database, cloud/dev platform, or widely "
        "useful developer tool.\n"
        "Set relevant=FALSE for anything else, including: datasets, benchmarks, research "
        "papers, tutorials/how-tos, personal side-projects or portfolios, one-off demos, "
        "hardware/retro-computing hacks, consumer apps or gadgets (e.g. voice assistants, "
        "maps, games), company/funding/business news, opinion, and drama. When unsure, "
        "set relevant=FALSE — a smaller, cleaner list is the goal.\n\n"
        "Return STRICT JSON:\n"
        '{"relevant": true|false,\n'
        ' "name": "<official tool/model name, e.g. \'GLM-4.6\' or \'Bun\'>",\n'
        ' "slug": "<lowercase-kebab-id, e.g. \'glm\' or \'bun\'>",\n'
        ' "category": "Frontier Models|Languages|Frameworks|AI Tools|Developer Tools",\n'
        ' "accent_color": "violet|cyan|emerald",\n'
        ' "tagline": "<=70 char one-liner>",\n'
        ' "homepage_url": "<official site URL if known, else null>",\n'
        ' "title": "<=90 char headline>",\n'
        ' "summary": "<=200 char neutral sentence>",\n'
        ' "version": "<version if any, else null>",\n'
        ' "importance": <integer 1-5: 5=major launch/release, 3=notable, 1=minor>}\n\n'
        f"Item title: {title}\nItem content: {content[:1500]}\n\n"
        "Return ONLY the JSON object.",
        max_tokens=350,
    )
    if not data or not data.get("relevant"):
        return None
    slug = (data.get("slug") or "").strip().lower()
    name = (data.get("name") or "").strip()
    if not slug or not name:
        return None
    category = data.get("category") if data.get("category") in ALLOWED_CATEGORIES else "AI Tools"
    accent = data.get("accent_color") if data.get("accent_color") in ALLOWED_ACCENTS else "cyan"
    homepage = data.get("homepage_url")
    if not (isinstance(homepage, str) and homepage.startswith("http")):
        homepage = None
    return {
        "slug": slug,
        "name": name[:60],
        "category": category,
        "accent_color": accent,
        "tagline": (data.get("tagline") or None),
        "homepage_url": homepage,
        "title": (data.get("title") or title)[:90],
        "summary": data.get("summary"),
        "version": data.get("version"),
        "importance": _importance(data.get("importance")),
    }


# --------------------------------------------------------------------------- #
# DB helpers
# --------------------------------------------------------------------------- #
def get_or_create_technology(db: Client, slug: str, defaults: dict) -> str | None:
    existing = db.table("technologies").select("id").eq("slug", slug).execute()
    if existing.data:
        return existing.data[0]["id"]
    if not defaults.get("name"):
        return None
    created = db.table("technologies").insert({"slug": slug, **defaults}).execute()
    print(f"  + discovered technology '{slug}' ({defaults.get('name')})")
    return created.data[0]["id"]


def insert_update(db: Client, tech_id: str, fields: dict, source_url: str, published: str | None):
    # Upsert on source_url (unique). We DON'T ignore duplicates so re-runs refresh the
    # importance score on items still appearing in feeds — old items that drop off keep
    # their last score (and are excluded from highlights by the 7-day window anyway).
    db.table("updates").upsert(
        {
            "technology_id": tech_id,
            "title": fields["title"],
            "summary": fields["summary"],
            "version": fields["version"],
            "importance": fields.get("importance", 2),
            "source_url": source_url,
            "published_at": published,
        },
        on_conflict="source_url",
    ).execute()
    if fields.get("version"):
        db.table("technologies").update({"current_version": fields["version"]}).eq(
            "id", tech_id
        ).execute()


def _published(entry) -> str | None:
    if getattr(entry, "published_parsed", None):
        return time.strftime("%Y-%m-%dT%H:%M:%SZ", entry.published_parsed)
    return None


# --------------------------------------------------------------------------- #
# Curated homepages — so cards can show a REAL logo (the frontend derives a logo
# from homepage_url). LLM-guessed homepages proved unreliable (wrong companies,
# hallucinated repos), so these are hand-verified. Applied authoritatively each run;
# obscure tools with no entry keep a clean initials tile. Edit curated/homepages.json
# to add more. (New tools discovered by the classifier still get a grounded homepage.)
# --------------------------------------------------------------------------- #
def apply_curated_homepages(db: Client) -> int:
    try:
        mapping = json.loads(HOMEPAGES_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        print(f"  ! could not read curated homepages: {exc}")
        return 0
    n = 0
    for name, url in mapping.items():
        if name.startswith("_") or not isinstance(url, str):
            continue  # skip the _comment key
        res = db.table("technologies").update({"homepage_url": url}).eq("name", name).execute()
        if res.data:
            n += len(res.data)
    print(f"  applied {n} curated homepages")
    return n


# --------------------------------------------------------------------------- #
# Entry point
# --------------------------------------------------------------------------- #
def run(db: Client) -> int:
    total = 0
    # Preload every source_url we've already stored so we only spend an LLM call on
    # genuinely NEW items. This is what lets us add many feeds without exhausting the
    # free LLM tier — repeat items across daily runs are skipped for free.
    # Trade-off: we no longer re-score importance on already-seen items, so an old
    # item keeps its first score. That's fine: highlights use a rolling 7-day window.
    seen: set[str] = {
        r["source_url"] for r in db.table("updates").select("source_url").execute().data
    }

    print("\n=== TOOLS: targeted feeds ===")
    for src in TARGETED_SOURCES:
        print(f"→ {src.feed_url}")
        try:
            feed = feedparser.parse(src.feed_url)
        except Exception as exc:  # noqa: BLE001
            print(f"  ! feed error: {exc}")
            continue
        tech_id = get_or_create_technology(db, src.tech_slug, TECH_DEFAULTS.get(src.tech_slug, {}))
        if not tech_id:
            continue
        for entry in feed.entries[:ITEMS_PER_TARGETED]:
            title = entry.get("title", "")
            # Empty keywords = the tool's own blog, accept all; else require a match.
            if src.keywords and not any(k in title.lower() for k in src.keywords):
                continue
            link = entry.get("link")
            if not link or link in seen:
                continue
            content = entry.get("summary", "") or entry.get("description", "")
            fields = structure_known(title, content)
            insert_update(db, tech_id, fields, link, _published(entry))
            seen.add(link)
            print(f"  • {fields['title']}")
            total += 1

    print("\n=== TOOLS: discovery feeds (auto-detect new tools) ===")
    classifications = 0
    for url in DISCOVERY_FEEDS:
        if classifications >= MAX_DISCOVERY_CLASSIFICATIONS:
            print("  … discovery LLM budget reached — remaining feeds picked up next run")
            break
        print(f"→ {url}")
        try:
            feed = feedparser.parse(url)
        except Exception as exc:  # noqa: BLE001
            print(f"  ! feed error: {exc}")
            continue
        for entry in feed.entries[:ITEMS_PER_DISCOVERY]:
            if classifications >= MAX_DISCOVERY_CLASSIFICATIONS:
                break
            title = entry.get("title", "")
            link = entry.get("link")
            if not title or not link or link in seen:
                continue
            content = entry.get("summary", "") or entry.get("description", "")
            classifications += 1
            info = classify_discovery(title, content)
            if not info:
                continue
            tech_id = get_or_create_technology(
                db,
                info["slug"],
                {
                    "name": info["name"],
                    "category": info["category"],
                    "accent_color": info["accent_color"],
                    "tagline": info["tagline"],
                    "homepage_url": info.get("homepage_url"),
                },
            )
            if not tech_id:
                continue
            insert_update(db, tech_id, info, link, _published(entry))
            seen.add(link)
            print(f"  • [{info['slug']}] {info['title']}")
            total += 1

    return total
