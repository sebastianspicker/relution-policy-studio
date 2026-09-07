"""Cohesive implementation stage 9 for mapping_review_artifacts."""

from typing import Any
from .artifact_paths import PLATFORM_ORDER
from .semantic_evidence_extraction import bilingual_tokens
from .semantic_evidence_extraction import detect_mapping_language
from .semantic_review_formatting import exact_mapping_match_evidence
from .mapping_exact_targets import exact_mappings
from _recommendation_mapping_modules.field_matching_values import flatten_value_paths
from .mapping_candidate_review_rows import mapping_candidate_review_row
from .mapping_exact_targets import mapping_target
from .artifact_io_values import normalize_policy_platform
from .semantic_evidence_extraction import recommendation_semantic_concepts
from .semantic_evidence_extraction import recommendation_source_text
from .semantic_review_formatting import shorten_review_text
from _tooling_text_io import slugify
from .artifact_io_values import stable_json
from _recommendation_mapping_modules._mapping_lexical_constants import unique_preserving_order

def build_exact_mapping_reference_rows(
    recommendations: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    """Build bilingual exact-mapping reference rows for offline review."""

    rows: list[dict[str, Any]] = []
    for global_id, recommendation in sorted(recommendations.items()):
        source = str(recommendation["_source"])
        platform = normalize_policy_platform(str(recommendation.get("platform", "")))
        source_text = recommendation_source_text(source, recommendation)
        language = detect_mapping_language(source_text)
        tokens = bilingual_tokens(source_text, recommendation)
        semantic_concepts = recommendation_semantic_concepts(recommendation)
        for mapping in exact_mappings(recommendation):
            target = mapping_target(mapping)
            if target is None:
                continue
            field_paths = unique_preserving_order(
                [
                    *flatten_value_paths(mapping.get("values", {})),
                    *[
                        str(constraint.get("path"))
                        for constraint in mapping.get("constraints", [])
                        if isinstance(constraint, dict)
                        and isinstance(constraint.get("path"), str)
                    ],
                ]
            )
            mapping_id_parts = (
                global_id,
                mapping["kind"],
                target,
                stable_json(field_paths),
                stable_json(mapping.get("values", {})),
            )
            mapping_id = slugify("-".join(mapping_id_parts))
            rows.append(
                {
                    "mappingId": mapping_id,
                    "source": source,
                    "recommendationId": str(recommendation["id"]),
                    "globalRecommendationId": global_id,
                    "platform": platform,
                    "language": language,
                    "title": str(recommendation.get("title", "")),
                    "sourceText": shorten_review_text(source_text, 700),
                    "normalizedTokens": tokens,
                    "semanticConcepts": semantic_concepts,
                    "semanticConceptIds": [
                        str(concept["id"]) for concept in semantic_concepts
                    ],
                    "mapping": {
                        "kind": str(mapping["kind"]),
                        "target": target,
                        "fieldPaths": field_paths,
                        "values": mapping.get("values", {}),
                        **(
                            {"constraints": mapping["constraints"]}
                            if isinstance(mapping.get("constraints"), list)
                            else {}
                        ),
                    },
                    "matchEvidence": exact_mapping_match_evidence(mapping),
                }
            )
    rows.sort(
        key=lambda row: (
            row["source"],
            PLATFORM_ORDER.get(row["platform"], 99),
            row["platform"],
            row["recommendationId"],
            row["mappingId"],
        )
    )
    return rows

def build_mapping_candidate_review_rows(
    recommendations: dict[str, dict[str, Any]],
    exact_references: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Build candidate-review rows for recommendations not already exact."""

    rows: list[dict[str, Any]] = []
    from .semantic_reference_matching import prepare_exact_references

    raw_references_by_platform: dict[str, list[dict[str, Any]]] = {}
    for reference in exact_references:
        raw_references_by_platform.setdefault(str(reference["platform"]), []).append(
            reference
        )
    references_by_platform = {
        platform: prepare_exact_references(references)
        for platform, references in raw_references_by_platform.items()
    }

    for global_id, recommendation in sorted(recommendations.items()):
        relution_mapping = recommendation.get("relutionMapping", {})
        current_status = str(relution_mapping.get("status", "none"))
        if current_status == "exact":
            continue
        rows.append(
            mapping_candidate_review_row(
                global_id, recommendation, current_status, references_by_platform
            )
        )
    rows.sort(
        key=lambda row: (
            row["source"],
            PLATFORM_ORDER.get(row["platform"], 99),
            row["platform"],
            row["recommendationId"],
        )
    )
    return rows
