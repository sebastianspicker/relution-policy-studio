"""CLI orchestration for rebuilding source-specific Relution artifacts."""

from __future__ import annotations

import argparse

from .artifact_io_json import read_json
from .artifact_io_settings import update_baseline_summary
from .artifact_io_settings import update_readme
from .artifact_io_json import write_json
from .artifact_io_settings import write_settings_files
from .artifact_paths import (
    SOURCE_CONFIGS,
)
from .artifact_coverage import build_coverage_matrix
from .artifact_semantic_index import build_semantic_index
from .unified_analysis_builders import build_unified_recommendation_analysis
from .recommendation_normalizer import normalize_recommendations
from .baseline_template_writer import write_baseline_templates
from .bsi_mandatory_ledger_reporting import write_bsi_mandatory_mapping_ledger
from .manual_mapping_promotion_storage import manual_promotions_by_recommendation
from .mapping_review_builders import build_mapping_candidate_review_artifacts
from .relution_update_artifacts import build_relution_mapping_update_artifacts
from .mapping_source_snapshots import previous_source_change_rows
from .relution_update_artifacts import previous_relution_mapping_change_rows
from .ruleset_rules_core import build_ruleset
from .ruleset_catalog import build_setting_catalog


def main() -> None:
    """Run the artifact rebuild CLI for selected recommendation sources."""

    parser = argparse.ArgumentParser(
        description="Build Relution import artifacts from harvested recommendation catalogs."
    )
    parser.add_argument(
        "sources", nargs="*", help="Sources to regenerate. Defaults to all."
    )
    args = parser.parse_args()

    unknown_sources = [
        source for source in args.sources if source not in SOURCE_CONFIGS
    ]
    if unknown_sources:
        raise SystemExit(f"unknown source(s): {', '.join(unknown_sources)}")
    selected_sources = args.sources or sorted(SOURCE_CONFIGS)
    build_artifacts_for_sources(selected_sources)
    write_baseline_templates()


def build_artifacts_for_sources(sources: list[str]) -> None:
    """Rebuild selected catalogs before generating cross-source artifacts once."""

    previous_source_rows = previous_source_change_rows()
    previous_mapping_rows = previous_relution_mapping_change_rows()
    normalized_by_source = {
        source: normalize_source_recommendations(source) for source in sources
    }
    for source in sources:
        build_source_catalog_artifacts(source, normalized_by_source[source])
    build_global_artifacts(previous_source_rows, previous_mapping_rows)


def normalize_source_recommendations(source: str) -> list[dict[str, object]]:
    """Normalize one selected source while retaining manual mapping promotions."""

    config = SOURCE_CONFIGS[source]
    recommendations = normalize_recommendations(
        config.source,
        read_json(config.recommendation_catalog_path),
        get_promotions=manual_promotions_by_recommendation,
    )
    write_json(config.recommendation_catalog_path, recommendations)
    return recommendations


def build_source_catalog_artifacts(
    source: str, recommendations: list[dict[str, object]]
) -> None:
    """Rebuild settings and rulesets owned by one recommendation source."""

    config = SOURCE_CONFIGS[source]
    baseline = read_json(config.baseline_path)
    verified_as_of = baseline.get("verifiedAsOf")
    bundle_result = build_setting_catalog(config, recommendations, verified_as_of)
    write_json(config.settings_catalog_path, bundle_result["catalog"])
    if source == "bsi":
        write_bsi_mandatory_mapping_ledger(recommendations, bundle_result["catalog"])
    write_settings_files(config, bundle_result["catalog"])
    write_json(
        config.ruleset_path,
        build_ruleset(
            config, recommendations, bundle_result["catalog"], verified_as_of
        ),
    )
    update_baseline_summary(config, baseline)
    update_readme(config)


def build_global_artifacts(
    previous_source_rows: list[dict[str, object]],
    previous_mapping_rows: list[dict[str, object]],
) -> None:
    """Generate cross-source coverage, review, and change artifacts once."""

    build_coverage_matrix()
    build_semantic_index()
    build_unified_recommendation_analysis()
    recommendations_by_global_id, reference_payload, review_payload, generated_at = (
        build_mapping_candidate_review_artifacts(previous_source_rows)
    )
    build_relution_mapping_update_artifacts(
        recommendations_by_global_id,
        reference_payload,
        review_payload,
        generated_at,
        previous_mapping_rows,
    )


def build_source_artifacts(source: str) -> None:
    """Compatibility entry point for a complete one-source artifact rebuild."""

    build_artifacts_for_sources([source])
