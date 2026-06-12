"""CLI orchestration for rebuilding source-specific Relution artifacts."""

from __future__ import annotations

import argparse

from .artifact_io import (
    read_json,
    update_baseline_summary,
    update_readme,
    write_json,
    write_settings_files,
)
from .artifact_pipeline import (
    SOURCE_CONFIGS,
    build_coverage_matrix,
    build_semantic_index,
    build_unified_recommendation_analysis,
    normalize_recommendations,
)
from .baseline_template_writer import write_baseline_templates
from .bsi_mandatory_ledger import write_bsi_mandatory_mapping_ledger
from .mapping_review_artifacts import (
    build_mapping_candidate_review_artifacts,
    manual_promotions_by_recommendation,
)
from .relution_mapping_updates import build_relution_mapping_update_artifacts
from .ruleset_builder import build_ruleset, build_setting_catalog


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
    for source in selected_sources:
        build_source_artifacts(source)
    write_baseline_templates()


def build_source_artifacts(source: str) -> None:
    """Rebuild normalized catalogs, rulesets, and review artifacts for one source."""

    config = SOURCE_CONFIGS[source]
    recommendations = normalize_recommendations(
        config.source,
        read_json(config.recommendation_catalog_path),
        get_promotions=manual_promotions_by_recommendation,
    )
    write_json(config.recommendation_catalog_path, recommendations)
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
    build_coverage_matrix()
    build_semantic_index()
    build_unified_recommendation_analysis()
    recommendations_by_global_id, reference_payload, review_payload, generated_at = (
        build_mapping_candidate_review_artifacts()
    )
    build_relution_mapping_update_artifacts(
        recommendations_by_global_id, reference_payload, review_payload, generated_at
    )
