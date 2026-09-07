"""Vendor guidance recommendation and artifact-generation pipeline."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from _build_relution_import_artifacts_modules.orchestration import build_source_artifacts
from _build_relution_import_artifacts_modules.manual_mapping_promotion_storage import manual_promotions_by_recommendation
from _build_relution_import_artifacts_modules.recommendation_normalizer import normalize_recommendations
from _recommendation_mapping_modules.candidate_inference_index import build_setting_index
from _recommendation_mapping_modules.field_matching_windows_csp import load_windows_custom_csp_evidence

from _harvest_vendor_guidance_modules.common import REPO_ROOT, VENDOR_DIR, WINDOWS_WORKBOOK_PATH
from _harvest_vendor_guidance_modules.vendor_mapping_artifacts import build_baseline_summary, update_readme
from _harvest_vendor_guidance_modules.vendor_mapping_semantic import workbook_help_by_title
from _tooling_text_io import read_json
from _harvest_vendor_guidance_modules.vendor_mapping_text import write_json
from _harvest_vendor_guidance_modules.vendor_windows_mapping import build_windows_recommendation
from _harvest_vendor_guidance_modules.vendor_source_catalog import (
    CURATED_PLATFORM_GUIDANCE,
    WINDOWS_BASELINE_PATH,
    WINDOWS_POLICY_RULES_PATH,
    WINDOWS_REXP_EVIDENCE_PATH,
)
from _harvest_vendor_guidance_modules.vendor_source_recommendations import (
    build_recommendations as _build_recommendations,
)
from _harvest_vendor_guidance_modules.vendor_source_refresh import (
    copy_downloads,
    refresh_downloads,
)


def build_recommendations(
    field_index: dict[str, list[dict[str, Any]]],
) -> list[dict[str, Any]]:
    """Build curated Android/macOS and Windows vendor recommendations."""

    return _build_recommendations(
        field_index,
        CURATED_PLATFORM_GUIDANCE,
        WINDOWS_BASELINE_PATH,
        WINDOWS_REXP_EVIDENCE_PATH,
        read_json,
        workbook_help_by_title,
        build_windows_recommendation,
        load_windows_custom_csp_evidence,
    )


def public_windows_policy_rules(value: Any) -> Any:
    """Remove publisher workstation prefixes from Windows baseline source paths."""

    if not isinstance(value, list):
        return value
    marker = "\\Windows 11 v24H2 Security Baseline\\"
    rows: list[Any] = []
    for entry in value:
        if not isinstance(entry, dict):
            rows.append(entry)
            continue
        row = dict(entry)
        source_file = row.get("SourceFile")
        if isinstance(source_file, str) and marker in source_file:
            row["SourceFile"] = f"Windows 11 v24H2 Security Baseline\\{source_file.split(marker, 1)[1]}"
        rows.append(row)
    return rows


def harvest_vendor_guidance(
    output_root: Path, refresh: bool, *, build_artifacts: bool = True
) -> None:
    """Build vendor artifacts from checked-in or refreshed source downloads."""

    output_root = output_root.resolve()
    output_vendor_dir = output_root / "example" / "vendor-references"
    if refresh:
        refresh_downloads(output_vendor_dir)
    elif output_root != REPO_ROOT:
        copy_downloads(output_vendor_dir)

    sources = read_json(VENDOR_DIR / "sources.json")
    field_index = build_setting_index()
    recommendations = normalize_recommendations(
        "vendor",
        build_recommendations(field_index),
        get_promotions=manual_promotions_by_recommendation,
    )
    write_json(output_vendor_dir / "sources.json", sources)
    write_json(
        output_vendor_dir
        / "downloads"
        / "derived"
        / "windows-25h2-intune-baseline.json",
        read_json(WINDOWS_BASELINE_PATH),
    )
    write_json(
        output_vendor_dir / "downloads" / "derived" / "windows-24h2-policy-rules.json",
        public_windows_policy_rules(read_json(WINDOWS_POLICY_RULES_PATH)),
    )
    write_json(
        output_vendor_dir / "downloads" / "derived" / "windows-24h2-workbook.json",
        read_json(WINDOWS_WORKBOOK_PATH),
    )
    write_json(output_vendor_dir / "vendor-recommendations.json", recommendations)
    write_json(
        output_vendor_dir / "vendor-relution-baseline.json",
        build_baseline_summary(sources, recommendations),
    )
    if output_root == REPO_ROOT and build_artifacts:
        build_source_artifacts("vendor")
    update_readme(output_vendor_dir, sources, recommendations)
