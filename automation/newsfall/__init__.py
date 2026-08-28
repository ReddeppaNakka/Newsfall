"""
Newsfall intelligence pipeline.

Transforms raw source content into structured, evidence-linked intelligence:

    sources → raw_articles → normalize/dedupe → entities + claims → events
            → verification → scoring → analysis → watch items → briefings

Every stage lives in its own module and is independently runnable via
``python -m newsfall.run --stage <name>``. See docs/INTELLIGENCE_ARCHITECTURE.md.
"""

__version__ = "0.1.0"
