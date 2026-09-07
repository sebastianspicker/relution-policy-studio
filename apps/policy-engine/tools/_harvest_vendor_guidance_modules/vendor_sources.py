#!/usr/bin/env python3
"""Vendor guidance harvest command implementation."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any as Any

from _build_relution_import_artifacts_modules.orchestration import build_source_artifacts as build_source_artifacts

from _harvest_vendor_guidance_modules.common import (
    REPO_ROOT,
    SAFE_SOURCE_ID_RE as SAFE_SOURCE_ID_RE,
    VENDOR_DIR as VENDOR_DIR,
    WINDOWS_WORKBOOK_PATH as WINDOWS_WORKBOOK_PATH,
    merge_candidate_lists as merge_candidate_lists,
)
from _harvest_vendor_guidance_modules.vendor_source_catalog import (
    CURATED_PLATFORM_GUIDANCE as CURATED_PLATFORM_GUIDANCE,
    WINDOWS_BASELINE_PATH as WINDOWS_BASELINE_PATH,
    WINDOWS_POLICY_RULES_PATH as WINDOWS_POLICY_RULES_PATH,
    WINDOWS_REXP_EVIDENCE_PATH as WINDOWS_REXP_EVIDENCE_PATH,
)
from _harvest_vendor_guidance_modules.vendor_source_pipeline import (
    harvest_vendor_guidance,
)
from _harvest_vendor_guidance_modules.vendor_source_recommendations import (
    build_recommendations as _build_recommendations,  # noqa: F401
    )

sys.dont_write_bytecode = True


def main() -> None:
    """Run the vendor guidance harvester in offline or refresh mode."""

    parser = argparse.ArgumentParser(
        description="Harvest vendor guidance into the repo's normalized recommendation catalog."
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--offline",
        action="store_true",
        help="Use the checked-in downloads and derived artifacts.",
    )
    mode.add_argument(
        "--refresh",
        action="store_true",
        help="Download source bodies before rebuilding derived artifacts.",
    )
    parser.add_argument(
        "--output-root",
        type=Path,
        default=REPO_ROOT,
        help="Output repository root. Defaults to the current checkout.",
    )
    parser.add_argument(
        "--defer-artifacts",
        action="store_true",
        help="Write the harvested catalog without rebuilding derived global artifacts.",
    )
    args = parser.parse_args()
    harvest_vendor_guidance(
        args.output_root, args.refresh, build_artifacts=not args.defer_artifacts
    )
