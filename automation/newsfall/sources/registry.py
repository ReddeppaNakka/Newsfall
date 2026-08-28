"""
Source registry (Parts 3A, 5).

The seed list below is the curated Tier-1/Tier-2 starting set. It is synced INTO the
`sources` table (upsert on slug, never overwriting operator edits to `active`,
`credibility_score`, or health columns) so the database — not this file — is the
runtime source of truth. Add a row in the DB to add a source without a deploy.

Credibility is contextual: `credibility_for(source, claim_type)` adjusts the baseline
(an official announcement is authoritative about *what was announced* but not about
how successful the product will be).
"""

from __future__ import annotations

from dataclasses import dataclass, field

from ..text import domain_of


@dataclass(frozen=True)
class SourceSeed:
    slug: str
    name: str
    source_type: str          # OFFICIAL | NEWS | RESEARCH | GOVERNMENT | FINANCIAL | SOCIAL | COMMUNITY | BLOG | DEVELOPER | SECURITY
    source_category: str      # COMPANY | TECH_REPORTING | FINANCIAL | STARTUP | AI_RESEARCH | OPEN_SOURCE | CYBERSECURITY | SEMICONDUCTOR | GOVERNMENT | INFLUENCE | SOCIAL | MEDIA
    credibility: float
    feed_url: str | None = None
    homepage_url: str | None = None
    organization: str | None = None
    tier: int = 1
    is_primary: bool = False
    connector: str = "rss"
    api_config: dict = field(default_factory=dict)

    def row(self) -> dict:
        return {
            "slug": self.slug, "name": self.name, "organization": self.organization,
            "domain": domain_of(self.homepage_url or self.feed_url), "homepage_url": self.homepage_url,
            "feed_url": self.feed_url, "connector": self.connector, "api_config": self.api_config,
            "source_type": self.source_type, "source_category": self.source_category, "tier": self.tier,
            "credibility_score": self.credibility, "is_primary_source": self.is_primary,
        }


def _official(slug, name, feed, home, org=None, category="COMPANY", cred=0.90, tier=1):
    return SourceSeed(slug, name, "OFFICIAL", category, cred, feed, home, org or name, tier, is_primary=True)


def _news(slug, name, feed, home, cred, tier=1, category="TECH_REPORTING"):
    return SourceSeed(slug, name, "NEWS", category, cred, feed, home, name, tier)


SEED_SOURCES: list[SourceSeed] = [
    # ---- Tier 1: official company newsrooms / engineering & research blogs ----
    _official("openai-blog", "OpenAI Blog", "https://openai.com/blog/rss.xml", "https://openai.com"),
    _official("anthropic-news", "Anthropic Newsroom", "https://www.anthropic.com/rss.xml", "https://www.anthropic.com"),
    _official("google-deepmind", "Google DeepMind Blog", "https://blog.google/technology/google-deepmind/rss/", "https://deepmind.google", "Google DeepMind", "AI_RESEARCH"),
    _official("google-ai-blog", "Google AI Blog", "https://blog.google/technology/ai/rss/", "https://blog.google/technology/ai/", "Google"),
    _official("microsoft-blog", "Official Microsoft Blog", "https://blogs.microsoft.com/feed/", "https://blogs.microsoft.com", "Microsoft"),
    _official("meta-ai-blog", "Meta AI Blog", "https://ai.meta.com/blog/rss/", "https://ai.meta.com", "Meta", "AI_RESEARCH"),
    _official("nvidia-blog", "NVIDIA Blog", "https://blogs.nvidia.com/feed/", "https://blogs.nvidia.com", "NVIDIA", "SEMICONDUCTOR"),
    _official("nvidia-newsroom", "NVIDIA Newsroom", "https://nvidianews.nvidia.com/rss", "https://nvidianews.nvidia.com", "NVIDIA", "SEMICONDUCTOR", cred=0.92),
    _official("amd-newsroom", "AMD Newsroom", "https://www.amd.com/en/newsroom.rss", "https://www.amd.com", "AMD", "SEMICONDUCTOR", tier=2),
    _official("intel-newsroom", "Intel Newsroom", "https://www.intel.com/content/www/us/en/newsroom/rss.xml", "https://www.intel.com/newsroom", "Intel", "SEMICONDUCTOR", tier=2),
    _official("apple-newsroom", "Apple Newsroom", "https://www.apple.com/newsroom/rss-feed.rss", "https://www.apple.com/newsroom/", "Apple", tier=2),
    _official("aws-news", "AWS News Blog", "https://aws.amazon.com/blogs/aws/feed/", "https://aws.amazon.com/blogs/aws/", "Amazon Web Services"),
    _official("cloudflare-blog", "Cloudflare Blog", "https://blog.cloudflare.com/rss/", "https://blog.cloudflare.com", "Cloudflare"),
    _official("github-blog", "GitHub Blog", "https://github.blog/feed/", "https://github.blog", "GitHub", "OPEN_SOURCE"),
    _official("huggingface-blog", "Hugging Face Blog", "https://huggingface.co/blog/feed.xml", "https://huggingface.co/blog", "Hugging Face", "AI_RESEARCH"),
    _official("mistral-news", "Mistral AI News", "https://mistral.ai/news/rss.xml", "https://mistral.ai/news", "Mistral AI", tier=2),
    _official("databricks-blog", "Databricks Blog", "https://www.databricks.com/feed", "https://www.databricks.com/blog", "Databricks", tier=2),
    _official("stripe-blog", "Stripe Blog", "https://stripe.com/blog/feed.rss", "https://stripe.com/blog", "Stripe", tier=2),
    _official("vercel-blog", "Vercel Blog", "https://vercel.com/atom", "https://vercel.com/blog", "Vercel", tier=2),
    _official("microsoft-research", "Microsoft Research Blog", "https://www.microsoft.com/en-us/research/feed/", "https://www.microsoft.com/en-us/research/", "Microsoft", "AI_RESEARCH", tier=2),
    _official("bair-blog", "Berkeley AI Research Blog", "https://bair.berkeley.edu/blog/feed.xml", "https://bair.berkeley.edu/blog/", "UC Berkeley", "AI_RESEARCH", tier=2),

    # ---- Tier 1: research ----
    SourceSeed("arxiv-cs-ai", "arXiv cs.AI", "RESEARCH", "AI_RESEARCH", 0.80,
               "https://rss.arxiv.org/rss/cs.AI", "https://arxiv.org/list/cs.AI/recent", "arXiv", 1, is_primary=True),
    SourceSeed("arxiv-cs-lg", "arXiv cs.LG", "RESEARCH", "AI_RESEARCH", 0.80,
               "https://rss.arxiv.org/rss/cs.LG", "https://arxiv.org/list/cs.LG/recent", "arXiv", 2, is_primary=True),

    # ---- Tier 1: high-quality reporting ----
    _news("reuters-tech", "Reuters Technology", "https://www.reutersagency.com/feed/?best-topics=tech&post_type=best", "https://www.reuters.com/technology/", 0.88),
    _news("techcrunch-ai", "TechCrunch AI", "https://techcrunch.com/category/artificial-intelligence/feed/", "https://techcrunch.com", 0.72),
    _news("techcrunch-startups", "TechCrunch Startups", "https://techcrunch.com/category/startups/feed/", "https://techcrunch.com/category/startups/", 0.70, category="STARTUP"),
    _news("theverge-ai", "The Verge AI", "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", "https://www.theverge.com", 0.70),
    _news("arstechnica", "Ars Technica", "https://feeds.arstechnica.com/arstechnica/technology-lab", "https://arstechnica.com", 0.76),
    _news("mit-tech-review", "MIT Technology Review", "https://www.technologyreview.com/feed/", "https://www.technologyreview.com", 0.78),
    _news("venturebeat-ai", "VentureBeat AI", "https://venturebeat.com/category/ai/feed/", "https://venturebeat.com", 0.66),
    _news("wired", "Wired", "https://www.wired.com/feed/rss", "https://www.wired.com", 0.70, tier=2),
    _news("cnbc-tech", "CNBC Technology", "https://www.cnbc.com/id/19854910/device/rss/rss.html", "https://www.cnbc.com/technology/", 0.78, category="FINANCIAL"),
    _news("infoq", "InfoQ", "https://feed.infoq.com/", "https://www.infoq.com", 0.68, tier=2),

    # ---- Tier 2: financial / government / security ----
    SourceSeed("sec-press", "SEC Press Releases", "GOVERNMENT", "FINANCIAL", 0.95,
               "https://www.sec.gov/news/pressreleases.rss", "https://www.sec.gov", "U.S. SEC", 2, is_primary=True),
    SourceSeed("ftc-press", "FTC Press Releases", "GOVERNMENT", "GOVERNMENT", 0.95,
               "https://www.ftc.gov/feeds/press-release.xml", "https://www.ftc.gov", "U.S. FTC", 2, is_primary=True),
    SourceSeed("cisa-advisories", "CISA Advisories", "GOVERNMENT", "CYBERSECURITY", 0.95,
               "https://www.cisa.gov/cybersecurity-advisories/all.xml", "https://www.cisa.gov", "CISA", 2, is_primary=True),
    SourceSeed("google-project-zero", "Google Project Zero", "SECURITY", "CYBERSECURITY", 0.90,
               "https://googleprojectzero.blogspot.com/feeds/posts/default", "https://googleprojectzero.blogspot.com", "Google", 2, is_primary=True),
    SourceSeed("eu-commission-digital", "European Commission — Digital", "GOVERNMENT", "GOVERNMENT", 0.95,
               "https://digital-strategy.ec.europa.eu/en/news.rss", "https://digital-strategy.ec.europa.eu", "European Commission", 2, is_primary=True),

    # ---- Tier 1: community / discovery signals (never facts on their own) ----
    SourceSeed("hackernews-top", "Hacker News (front page ≥150)", "COMMUNITY", "SOCIAL", 0.35,
               "https://hnrss.org/frontpage?points=150", "https://news.ycombinator.com", "Y Combinator", 1),
    SourceSeed("hackernews-show", "Hacker News — Show HN (≥80)", "COMMUNITY", "OPEN_SOURCE", 0.30,
               "https://hnrss.org/show?points=80", "https://news.ycombinator.com/show", "Y Combinator", 2),
    SourceSeed("dev-to", "DEV Community", "COMMUNITY", "OPEN_SOURCE", 0.30,
               "https://dev.to/feed", "https://dev.to", "DEV", 2),

    # ---- Tier 1: open source releases (GitHub Atom feeds) ----
    SourceSeed("gh-pytorch-releases", "PyTorch Releases", "DEVELOPER", "OPEN_SOURCE", 0.85,
               "https://github.com/pytorch/pytorch/releases.atom", "https://github.com/pytorch/pytorch", "PyTorch", 2, is_primary=True),
    SourceSeed("gh-transformers-releases", "Transformers Releases", "DEVELOPER", "OPEN_SOURCE", 0.85,
               "https://github.com/huggingface/transformers/releases.atom", "https://github.com/huggingface/transformers", "Hugging Face", 2, is_primary=True),
    SourceSeed("gh-vllm-releases", "vLLM Releases", "DEVELOPER", "OPEN_SOURCE", 0.85,
               "https://github.com/vllm-project/vllm/releases.atom", "https://github.com/vllm-project/vllm", "vLLM", 2, is_primary=True),
    SourceSeed("gh-llama-cpp-releases", "llama.cpp Releases", "DEVELOPER", "OPEN_SOURCE", 0.85,
               "https://github.com/ggml-org/llama.cpp/releases.atom", "https://github.com/ggml-org/llama.cpp", "ggml", 2, is_primary=True),
]

# Legacy feeds already used by tools_pipeline.py — registered so the intelligence
# layer sees the same official project blogs (harmless double-fetch of cheap RSS).
SEED_SOURCES += [
    _official("python-blog", "Python Insider", "https://blog.python.org/feeds/posts/default", "https://www.python.org", "Python Software Foundation", "OPEN_SOURCE", tier=2),
    _official("react-blog", "React Blog", "https://react.dev/rss.xml", "https://react.dev", "Meta", "OPEN_SOURCE", tier=2),
    _official("nodejs-blog", "Node.js Blog", "https://nodejs.org/en/feed/blog.xml", "https://nodejs.org", "OpenJS Foundation", "OPEN_SOURCE", tier=2),
    _official("typescript-blog", "TypeScript Blog", "https://devblogs.microsoft.com/typescript/feed/", "https://www.typescriptlang.org", "Microsoft", "OPEN_SOURCE", tier=2),
    _official("rust-blog", "Rust Blog", "https://blog.rust-lang.org/feed.xml", "https://www.rust-lang.org", "Rust Foundation", "OPEN_SOURCE", tier=2),
    _official("go-blog", "Go Blog", "https://go.dev/blog/feed.atom", "https://go.dev", "Google", "OPEN_SOURCE", tier=2),
    _official("nextjs-blog", "Next.js Blog", "https://nextjs.org/feed.xml", "https://nextjs.org", "Vercel", "OPEN_SOURCE", tier=2),
]


# Source-type ordering for the verification ladder (higher = closer to primary evidence).
TYPE_RANK: dict[str, int] = {
    "GOVERNMENT": 5, "OFFICIAL": 5, "RESEARCH": 4, "FINANCIAL": 4, "NEWS": 3, "SECURITY": 4,
    "DEVELOPER": 3, "BLOG": 2, "COMMUNITY": 1, "SOCIAL": 1,
}


def credibility_for(source: dict, claim_type: str | None = None) -> float:
    """Contextual credibility (Part 3A). Baseline from the registry, then:
    - official/primary sources are authoritative for FACT claims about themselves,
      discounted for OPINION/PREDICTION (self-interest);
    - community/social sources are capped for anything but leads."""
    base = float(source.get("credibility_score") or 0.5)
    stype = source.get("source_type") or "NEWS"
    if claim_type in ("OPINION", "PREDICTION"):
        if stype in ("OFFICIAL",):
            base *= 0.6
        elif stype in ("RESEARCH", "NEWS", "FINANCIAL"):
            base *= 0.85
    if stype in ("COMMUNITY", "SOCIAL"):
        base = min(base, 0.4)
    if claim_type == "RUMOR":
        base *= 0.75
    return round(max(0.0, min(1.0, base)), 3)


def sync_sources(db) -> int:
    """Upsert seeds without clobbering operator-managed columns."""
    existing = {r["slug"]: r for r in (db.table("sources").select("slug,active,credibility_score").execute().data or [])}
    rows = []
    for seed in SEED_SOURCES:
        row = seed.row()
        if seed.slug in existing:
            # Operators own these once the row exists.
            row.pop("credibility_score", None)
            row["active"] = existing[seed.slug]["active"]
        rows.append(row)
    if rows:
        db.table("sources").upsert(rows, on_conflict="slug").execute()
    return len(rows)
