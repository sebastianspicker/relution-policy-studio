#!/usr/bin/env python3
"""Refresh guideline-derived mapping artifacts.

Use `--offline` for the normal reproducible path from checked-in source
material. Online refresh intentionally fails closed for BSI/CIS until their
downloaders are explicit and reviewable; vendor guidance is the only refreshable
source in this wrapper.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

import build_relution_import_artifacts as artifacts


REPO_ROOT = Path(__file__).resolve().parents[1]
SUPPORTED_SOURCES = ("bsi", "cis", "vendor")


def main() -> None:
    parser = argparse.ArgumentParser(description="Refresh or rebuild guideline mapping drift artifacts.")
    parser.add_argument("--source", choices=(*SUPPORTED_SOURCES, "all"), default="all", help="Guideline source to process.")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--offline", action="store_true", help="Use checked-in downloads and manifests.")
    mode.add_argument("--refresh", action="store_true", help="Refresh sources where the existing harvester supports it.")
    parser.add_argument("--apply-safe", action="store_true", help="Apply deterministic safe updates only. Risky updates remain review-gated.")
    args = parser.parse_args()

    selected_sources = list(SUPPORTED_SOURCES if args.source == "all" else (args.source,))
    if args.refresh:
        refresh_sources(selected_sources)
    else:
        rebuild_sources_offline(selected_sources)

    run_command([sys.executable, "tools/build_relution_import_artifacts.py", *selected_sources])
    if args.apply_safe:
        apply_summary = artifacts.apply_safe_relution_mapping_updates(selected_sources)
        print(
            "Applied safe recommendation-to-Relution mapping rows: "
            f"{apply_summary['appliedRows']} applied, {apply_summary['skippedRows']} skipped."
        )
    print("Wrote example/recommendation-coverage/source-change-report.json")
    print("Wrote example/recommendation-coverage/ruleset-update-plan.json")
    print("Wrote example/recommendation-coverage/relution-mapping-change-report.json")
    print("Wrote example/recommendation-coverage/relution-mapping-update-plan.json")


def rebuild_sources_offline(sources: list[str]) -> None:
    for source in sources:
        if source == "bsi":
            run_command([sys.executable, "tools/harvest_bsi_grundschutz.py"])
        elif source == "cis":
            run_command([sys.executable, "tools/harvest_cis_benchmarks.py"])
        elif source == "vendor":
            run_command([sys.executable, "tools/harvest_vendor_guidance.py", "--offline"])


def refresh_sources(sources: list[str]) -> None:
    unsupported = [source for source in sources if source in {"bsi", "cis"}]
    if unsupported:
        raise SystemExit(
            "Online refresh is currently implemented only for vendor guidance. "
            f"Update checked-in downloads for {', '.join(unsupported)} and rerun with --offline."
        )
    run_command([sys.executable, "tools/harvest_vendor_guidance.py", "--refresh"])


def run_command(command: list[str]) -> None:
    subprocess.run(command, cwd=REPO_ROOT, check=True)


if __name__ == "__main__":
    main()
