#!/usr/bin/env python3
"""Refresh guideline-derived mapping artifacts.

Use `--offline` for the normal reproducible path from checked-in source
material. Online refresh intentionally fails closed for BSI/CIS until their
downloaders are explicit and reviewable; vendor guidance is the only refreshable
source in this wrapper.
"""

from __future__ import annotations

import argparse
import os
import runpy
import sys
from pathlib import Path

from _build_relution_import_artifacts_modules.relution_mapping_updates import (
    apply_safe_relution_mapping_updates,
)


REPO_ROOT = Path(__file__).resolve().parents[1]
SUPPORTED_SOURCES = ("bsi", "cis", "vendor")
EXPECTED_UPDATE_ARTIFACT_PATHS = (
    REPO_ROOT / "example" / "recommendation-coverage" / "source-change-report.json",
    REPO_ROOT / "example" / "recommendation-coverage" / "ruleset-update-plan.json",
    REPO_ROOT
    / "example"
    / "recommendation-coverage"
    / "relution-mapping-change-report.json",
    REPO_ROOT
    / "example"
    / "recommendation-coverage"
    / "relution-mapping-update-plan.json",
)


def main() -> None:
    """Run the guideline mapping refresh wrapper from CLI arguments."""

    parser = argparse.ArgumentParser(
        description="Refresh or rebuild guideline mapping drift artifacts."
    )
    parser.add_argument(
        "--source",
        choices=(*SUPPORTED_SOURCES, "all"),
        default="all",
        help="Guideline source to process.",
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--offline", action="store_true", help="Use checked-in downloads and manifests."
    )
    mode.add_argument(
        "--refresh",
        action="store_true",
        help="Refresh sources where the existing harvester supports it.",
    )
    parser.add_argument(
        "--apply-safe",
        action="store_true",
        help="Apply deterministic safe updates only. Risky updates remain review-gated.",
    )
    args = parser.parse_args()

    selected_sources = list(
        SUPPORTED_SOURCES if args.source == "all" else (args.source,)
    )
    if args.refresh:
        refresh_sources(selected_sources)
    else:
        rebuild_sources_offline(selected_sources)

    run_build_relution_import_artifacts(selected_sources)
    if args.apply_safe:
        apply_summary = apply_safe_relution_mapping_updates(selected_sources)
        print(
            "Applied safe recommendation-to-Relution mapping rows: "
            f"{apply_summary['appliedRows']} applied, {apply_summary['skippedRows']} skipped."
        )
    assert_expected_outputs_written(EXPECTED_UPDATE_ARTIFACT_PATHS)
    for output_path in EXPECTED_UPDATE_ARTIFACT_PATHS:
        print(f"Wrote {output_path.relative_to(REPO_ROOT)}")


def assert_expected_outputs_written(output_paths: tuple[Path, ...]) -> None:
    """Raise when a required mapping drift artifact was not written."""

    missing = [path for path in output_paths if not path.is_file()]
    if missing:
        missing_paths = ", ".join(str(path) for path in missing)
        raise AssertionError(
            f"Expected update artifact(s) not written: {missing_paths}"
        )


def rebuild_sources_offline(sources: list[str]) -> None:
    """Rebuild selected guideline sources from checked-in inputs."""

    for source in sources:
        if source == "bsi":
            run_repo_python_tool("tools/harvest_bsi_grundschutz.py")
        elif source == "cis":
            run_repo_python_tool("tools/harvest_cis_benchmarks.py")
        elif source == "vendor":
            run_repo_python_tool("tools/harvest_vendor_guidance.py", "--offline")


def refresh_sources(sources: list[str]) -> None:
    """Refresh selected sources that support online download in this wrapper."""

    unsupported = [source for source in sources if source in {"bsi", "cis"}]
    if unsupported:
        raise SystemExit(
            "Online refresh is currently implemented only for vendor guidance. "
            f"Update checked-in downloads for {', '.join(unsupported)} and rerun with --offline."
        )
    run_repo_python_tool("tools/harvest_vendor_guidance.py", "--refresh")


def run_build_relution_import_artifacts(sources: list[str]) -> None:
    """Run the import artifact builder with the selected source arguments."""

    source_key = tuple(sources)
    if source_key == ("bsi",):
        run_repo_python_tool("tools/build_relution_import_artifacts.py", "bsi")
    elif source_key == ("cis",):
        run_repo_python_tool("tools/build_relution_import_artifacts.py", "cis")
    elif source_key == ("vendor",):
        run_repo_python_tool("tools/build_relution_import_artifacts.py", "vendor")
    elif source_key == SUPPORTED_SOURCES:
        run_repo_python_tool(
            "tools/build_relution_import_artifacts.py", "bsi", "cis", "vendor"
        )
    else:
        raise AssertionError(f"Unsupported source selection: {sources}")


def run_repo_python_tool(script: str, *args: str) -> None:
    """Run a repository Python script with isolated argv and cwd state."""

    previous_argv = sys.argv[:]
    previous_cwd = Path.cwd()
    try:
        os.chdir(REPO_ROOT)
        sys.argv = [script, *args]
        runpy.run_path(str(REPO_ROOT / script), run_name="__main__")
    finally:
        sys.argv = previous_argv
        os.chdir(previous_cwd)


if __name__ == "__main__":
    main()
