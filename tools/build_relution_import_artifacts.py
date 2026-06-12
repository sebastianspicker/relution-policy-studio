#!/usr/bin/env python3
"""Compatibility launcher and export facade for Relution import artifact builds."""

import sys

from _build_relution_import_artifacts_modules.artifact_io import write_settings_files
from _build_relution_import_artifacts_modules.artifact_pipeline import (
    SourceConfig,
    build_coverage_matrix,
    build_semantic_index,
    build_unified_recommendation_analysis,
    exact_leaf_difference_is_hard,
    normalize_recommendations,
    semantic_support_level,
)
from _build_relution_import_artifacts_modules.mapping_review_artifacts import (
    build_source_change_rows,
    classify_mapping_update,
    classify_source_change,
    ensure_manual_mapping_promotions_file,
    manual_promotion_ruleset_mapping,
    manual_promotions_by_recommendation,
    source_text_hash,
    validate_manual_mapping_promotions,
)
from _build_relution_import_artifacts_modules.orchestration import (
    build_source_artifacts,
    main,
)
from _build_relution_import_artifacts_modules.relution_mapping_updates import (
    classify_recommendation_mapping_change,
    relution_mapping_snapshot,
)
from _build_relution_import_artifacts_modules.ruleset_builder import (
    importable_native_mappings,
)
from _build_relution_import_artifacts_modules.semantic_review_candidates import (
    detect_mapping_language,
    extracted_action,
)

sys.dont_write_bytecode = True

__all__ = [
    "SourceConfig",
    "build_coverage_matrix",
    "build_semantic_index",
    "build_source_artifacts",
    "build_source_change_rows",
    "build_unified_recommendation_analysis",
    "classify_mapping_update",
    "classify_recommendation_mapping_change",
    "classify_source_change",
    "detect_mapping_language",
    "ensure_manual_mapping_promotions_file",
    "exact_leaf_difference_is_hard",
    "extracted_action",
    "importable_native_mappings",
    "main",
    "manual_promotion_ruleset_mapping",
    "manual_promotions_by_recommendation",
    "normalize_recommendations",
    "relution_mapping_snapshot",
    "semantic_support_level",
    "source_text_hash",
    "validate_manual_mapping_promotions",
    "write_settings_files",
]

if __name__ == "__main__":
    main()
