"""
News_Pond — Automation entry point
==================================

Run by GitHub Actions daily (and locally). Orchestrates two pipelines:

  1. tools_pipeline       — tracks languages, frameworks & AI models. Targeted feeds
                            for the always-on tools PLUS broad "discovery" feeds where
                            an LLM auto-detects brand-new tools (e.g. a fresh model
                            from ZhipuAI) and creates them with no hardcoding.

  2. opportunities_pipeline — hackathons, competitions, conferences, internships &
                            jobs for freshers. Curated JSON + Devpost + Unstop.

  3. jobs_pipeline        — fresher-focused remote jobs from RemoteOK + We Work
                            Remotely (free, LLM-free, deduped on apply_url).

  4. learning_pipeline    — free courses, certifications & talks from Microsoft Learn
                            + YouTube RSS (free, LLM-free, deduped on url).

  5. repos_pipeline       — trending GitHub repositories to learn from / contribute to
                            (free GitHub Search API, LLM-free, deduped on url).

Everything is idempotent (dedupe on a unique url), so re-running is safe.

Run locally:
    pip install -r requirements.txt
    cp .env.example .env   # fill in values
    python scraper.py
"""

from __future__ import annotations

import common
import jobs_pipeline
import learning_pipeline
import opportunities_pipeline
import repos_pipeline
import tools_pipeline


def run() -> None:
    db = common.get_db()

    tools_n = tools_pipeline.run(db)
    print("\n=== TOOLS: curated homepages (for real logos) ===")
    tools_pipeline.apply_curated_homepages(db)
    opps_n = opportunities_pipeline.run(db)
    print("\n=== JOBS ===")
    jobs_n = jobs_pipeline.run(db)
    print("\n=== LEARNING (courses, certs, talks) ===")
    learn_n = learning_pipeline.run(db)
    print("\n=== REPOS ===")
    repos_n = repos_pipeline.run(db)

    print(
        f"\nDone. Tools: {tools_n} updates · Opportunities: {opps_n} · "
        f"Jobs: {jobs_n} · Learning: {learn_n} · Repos: {repos_n} upserted."
    )


if __name__ == "__main__":
    run()
