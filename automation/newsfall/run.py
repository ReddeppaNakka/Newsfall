"""
CLI entry point.

    python -m newsfall.run                       # full pipeline
    python -m newsfall.run --stage process       # one stage group (ingest|process|cluster|verify|analyze|report)
    python -m newsfall.run --only embed,entities # individual stages
"""

from __future__ import annotations

import argparse
import json

from .orchestrator import GROUPS, STAGES, run_pipeline


def main() -> None:
    parser = argparse.ArgumentParser(description="Newsfall intelligence pipeline")
    parser.add_argument("--stage", choices=sorted(GROUPS), help="run one stage group")
    parser.add_argument("--only", help="comma-separated stage names: " + ",".join(n for n, _ in STAGES))
    args = parser.parse_args()

    only: list[str] | None = None
    if args.stage:
        only = GROUPS[args.stage]
    if args.only:
        only = [s.strip() for s in args.only.split(",") if s.strip()]
    stats = run_pipeline(only=only)
    print(json.dumps(stats, indent=2, default=str))


if __name__ == "__main__":
    main()
