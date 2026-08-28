"""
Pure text utilities — no I/O, fully unit-tested. Normalisation, hashing, slugs,
alias keys, similarity, and the hashed-embedding fallback.
"""

from __future__ import annotations

import hashlib
import html as html_lib
import math
import re
import unicodedata
from datetime import datetime, timezone
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")
_SLUG_RE = re.compile(r"[^a-z0-9]+")
_TOKEN_RE = re.compile(r"[a-z0-9]+")

TRACKING_PARAMS = {
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id",
    "fbclid", "gclid", "mc_cid", "mc_eid", "ref", "ref_src", "source", "s", "igshid",
}

# Corporate suffixes and honorifics that should not distinguish aliases.
_ALIAS_STOP = {"inc", "inc.", "corp", "corp.", "corporation", "co", "co.", "ltd", "ltd.", "llc", "plc",
               "ag", "sa", "se", "nv", "the", "company", "holdings", "group", "technologies", "labs"}


def strip_html(value: str | None) -> str:
    if not value:
        return ""
    text = _TAG_RE.sub(" ", value)
    text = html_lib.unescape(text)
    return _WS_RE.sub(" ", text).strip()


def normalize_whitespace(value: str) -> str:
    return _WS_RE.sub(" ", value or "").strip()


def canonical_url(url: str) -> str:
    """Lowercase host, drop fragments and tracking params, strip trailing slash."""
    try:
        parts = urlsplit(url.strip())
    except ValueError:
        return url.strip()
    if not parts.scheme or not parts.netloc:
        return url.strip()
    query = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if k.lower() not in TRACKING_PARAMS]
    path = parts.path.rstrip("/") or "/"
    netloc = parts.netloc.lower()
    if netloc.startswith("www."):
        netloc = netloc[4:]
    return urlunsplit((parts.scheme.lower(), netloc, path, urlencode(query), ""))


def domain_of(url: str | None) -> str | None:
    if not url:
        return None
    try:
        host = urlsplit(url).netloc.lower()
    except ValueError:
        return None
    return host[4:] if host.startswith("www.") else host or None


def content_hash(title: str, content: str) -> str:
    """Stable hash of the *meaning-bearing* text: lowercased, punctuation-free."""
    base = _SLUG_RE.sub(" ", f"{title} {content}".lower()).strip()
    return hashlib.sha256(base.encode("utf-8")).hexdigest()


def slugify(value: str, max_len: int = 80) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    slug = _SLUG_RE.sub("-", value.lower()).strip("-")
    return slug[:max_len].rstrip("-") or "item"


def short_hash(value: str, n: int = 8) -> str:
    return hashlib.sha1(value.encode("utf-8")).hexdigest()[:n]


def alias_key(name: str) -> str:
    """Normalise an entity alias so 'NVIDIA Corp.', 'Nvidia' and 'nvidia corporation' collide."""
    value = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii").lower()
    tokens = [t for t in _TOKEN_RE.findall(value) if t not in _ALIAS_STOP]
    return " ".join(tokens) if tokens else _SLUG_RE.sub(" ", value).strip()


def tokens(value: str) -> list[str]:
    return _TOKEN_RE.findall((value or "").lower())


def jaccard(a: set, b: set) -> float:
    if not a and not b:
        return 0.0
    return len(a & b) / len(a | b)


def title_similarity(a: str, b: str) -> float:
    """Token-set similarity with a bigram boost — cheap, symmetric, good enough for near-dup titles."""
    ta, tb = tokens(a), tokens(b)
    if not ta or not tb:
        return 0.0
    uni = jaccard(set(ta), set(tb))
    ba = {f"{x} {y}" for x, y in zip(ta, ta[1:])}
    bb = {f"{x} {y}" for x, y in zip(tb, tb[1:])}
    bi = jaccard(ba, bb) if ba and bb else uni
    return round(0.5 * uni + 0.5 * bi, 4)


def cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def hashed_embedding(text: str, dim: int = 1536) -> list[float]:
    """Deterministic feature-hashing embedding (unigrams + bigrams, L2-normalised).

    A no-cost fallback when no embedding API is configured. Weaker than a learned
    model but stable, and good enough for near-duplicate and same-story detection.
    Rows are tagged embedding_model='hash-v1' so they are never compared with API vectors.
    """
    vec = [0.0] * dim
    toks = tokens(text)
    feats = toks + [f"{x}_{y}" for x, y in zip(toks, toks[1:])]
    for f in feats:
        h = int(hashlib.md5(f.encode("utf-8")).hexdigest(), 16)
        idx = h % dim
        sign = 1.0 if (h >> 64) & 1 else -1.0
        vec[idx] += sign
    norm = math.sqrt(sum(v * v for v in vec))
    return [v / norm for v in vec] if norm else vec


def excerpt(text: str, n: int = 300) -> str:
    text = normalize_whitespace(text)
    if len(text) <= n:
        return text
    cut = text[:n]
    last = cut.rfind(" ")
    return (cut[:last] if last > n // 2 else cut).rstrip(",;:") + "…"


def parse_datetime(value) -> datetime | None:
    """Accepts feedparser struct_time, ISO strings, or datetimes → aware UTC datetime."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if hasattr(value, "tm_year"):  # time.struct_time
        try:
            import calendar

            return datetime.fromtimestamp(calendar.timegm(value), tz=timezone.utc)
        except (OverflowError, ValueError):
            return None
    if isinstance(value, str):
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    return None


def iso(dt: datetime | None) -> str | None:
    return dt.astimezone(timezone.utc).isoformat() if dt else None
