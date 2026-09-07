"""Semantic target text helpers for generated Relution artifacts."""

from typing import Any

from _recommendation_mapping_modules.candidate_inference_semantic_concepts import semantic_concepts_for

from .artifact_io_values import flatten_values, split_camel_text, stringify_value


def semantic_concept_ids_for_target_spec(
    platform: str, spec: dict[str, Any]
) -> list[str]:
    """Infer semantic concept ids from a target specification."""

    concepts = semantic_concepts_for(
        platform,
        [{"source": "mapping-target", "text": semantic_target_spec_text(spec), "sourceId": str(spec.get("target", ""))}],
    )
    return [str(concept["id"]) for concept in concepts if isinstance(concept.get("id"), str)]


def semantic_target_spec_text(spec: dict[str, Any]) -> str:
    """Collect target, field, match, and value text for semantic classification."""

    match = spec.get("match")
    matched_terms = []
    if isinstance(match, dict):
        matched_terms = [str(term) for term in match.get("matchedTerms", []) if isinstance(term, str)]
    field_paths = [str(path) for path in spec.get("fieldPaths", []) if isinstance(path, str)]
    values = [stringify_value(value) for value in flatten_values(spec.get("values", {})).values()]
    return " ".join(
        [
            " ".join(matched_terms),
            split_camel_text(str(spec.get("target", ""))),
            " ".join(split_camel_text(path) for path in field_paths),
            " ".join(split_camel_text(value) for value in values),
        ]
    )
