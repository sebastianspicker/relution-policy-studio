"""CLI parsing and orchestration for guideline mapping updates."""

from __future__ import annotations

import argparse

from _build_relution_import_artifacts_modules.relution_update_application import apply_safe_relution_mapping_updates

from .contracts import (
    EXPECTED_UPDATE_ARTIFACT_PATHS,
    REPO_ROOT,
    SUPPORTED_SOURCES,
    selected_sources,
)
from .workflow import (
    rebuild_sources_offline,
    refresh_sources,
    run_build_relution_import_artifacts,
    verify_expected_outputs,
)


def build_parser() -> argparse.ArgumentParser:
    """Build the stable command-line parser."""

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
    return parser


def main() -> None:
    """Run the guideline mapping refresh wrapper from CLI arguments."""

    args = build_parser().parse_args()
    sources = selected_sources(args.source)
    if args.refresh:
        refresh_sources(sources)
    else:
        rebuild_sources_offline(sources)

    run_build_relution_import_artifacts(sources)
    if args.apply_safe:
        apply_summary = apply_safe_relution_mapping_updates(sources)
        print(
            "Applied safe recommendation-to-Relution mapping rows: "
            f"{apply_summary['appliedRows']} applied, {apply_summary['skippedRows']} skipped."
        )
    verify_expected_outputs()
    for output_path in EXPECTED_UPDATE_ARTIFACT_PATHS:
        print(f"Wrote {output_path.relative_to(REPO_ROOT)}")
