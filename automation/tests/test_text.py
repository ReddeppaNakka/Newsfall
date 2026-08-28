from newsfall.text import (alias_key, canonical_url, content_hash, cosine, excerpt, hashed_embedding,
                           slugify, strip_html, title_similarity)


def test_canonical_url_strips_tracking_and_www():
    a = canonical_url("https://www.Example.com/post/?utm_source=x&id=2#frag")
    b = canonical_url("https://example.com/post?id=2")
    assert a == b == "https://example.com/post?id=2"


def test_content_hash_ignores_case_and_punctuation():
    assert content_hash("NVIDIA Launches Chip!", "Big news.") == content_hash("nvidia launches chip", "big news")


def test_alias_key_collapses_corporate_suffixes():
    assert alias_key("NVIDIA Corp.") == alias_key("Nvidia") == alias_key("nvidia corporation") == "nvidia"
    assert alias_key("Elon Musk") == "elon musk"
    assert alias_key("OpenAI, Inc.") == "openai"


def test_title_similarity_detects_near_duplicates():
    assert title_similarity("OpenAI releases GPT-5 to all users", "OpenAI releases GPT-5 to all users today") > 0.8
    assert title_similarity("OpenAI releases GPT-5", "NVIDIA reports record earnings") < 0.2


def test_slugify_and_strip_html():
    assert slugify("Hello, World! — Ünïcode") == "hello-world-unicode"
    assert strip_html("<p>Hi <b>there</b>&amp; you</p>") == "Hi there & you"


def test_hashed_embedding_is_deterministic_and_normalised():
    a = hashed_embedding("nvidia custom chips", 256)
    b = hashed_embedding("nvidia custom chips", 256)
    assert a == b and len(a) == 256
    assert abs(cosine(a, b) - 1.0) < 1e-9
    assert cosine(a, hashed_embedding("completely unrelated text about cooking", 256)) < 0.3


def test_excerpt_cuts_at_word_boundary():
    text = "word " * 100
    out = excerpt(text, 50)
    assert len(out) <= 52 and out.endswith("…")
