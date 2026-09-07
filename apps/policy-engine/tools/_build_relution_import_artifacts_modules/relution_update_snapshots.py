"""Cohesive implementation stage 2 for relution_mapping_updates."""

from typing import Any
from .semantic_evidence_extraction import bilingual_tokens
from .semantic_evidence_extraction import detect_mapping_language
import hashlib
from .mapping_exact_targets import mapping_target
from .artifact_io_values import normalize_policy_platform
from .semantic_evidence_extraction import recommendation_semantic_concepts
from .semantic_evidence_extraction import recommendation_source_text
from .artifact_io_values import stable_json

def relution_mapping_change_row_payload(
    current_snapshot: dict[str, Any],
    previous_snapshot: dict[str, Any],
    classification: str,
) -> dict[str, Any]:
    """Combine current mapping evidence with previous signatures and classification."""
    return {
        **current_snapshot,
        "changeClassification": classification,
        "classification": classification,
        "previousMappingStatus": str(previous_snapshot.get("currentMappingStatus", "")),
        "previousExactMappings": [
            mapping
            for mapping in previous_snapshot.get("exactMappings", [])
            if isinstance(mapping, dict)
        ],
        "previousExactMappingSignature": str(
            previous_snapshot.get("exactMappingSignature", "")
        ),
        "previousCandidateMappingSignature": str(
            previous_snapshot.get("candidateMappingSignature", "")
        ),
    }

def relution_mapping_snapshot(
    recommendation: dict[str, Any],
    exact_refs: list[dict[str, Any]],
    review_row: dict[str, Any] | None,
) -> dict[str, Any]:
    """Capture stable mapping, candidate, semantic, and source-text signatures."""
    from .relution_update_classification import candidate_mapping_snapshots
    source = str(recommendation.get("_source", ""))
    source_text = recommendation_source_text(source, recommendation)
    exact_mappings = [
        mapping_snapshot(row.get("mapping", {}))
        for row in exact_refs
        if isinstance(row.get("mapping"), dict)
    ]
    diagnostics = [
        dict(diagnostic)
        for diagnostic in recommendation.get("normalizationDiagnostics", [])
        if isinstance(diagnostic, dict)
    ]
    candidate_mappings = candidate_mapping_snapshots(
        recommendation, review_row, diagnostics
    )
    semantic_ids = [
        str(concept["id"])
        for concept in recommendation_semantic_concepts(recommendation)
    ]
    snapshot = {
        "source": source,
        "recommendationId": str(recommendation.get("id", "")),
        "globalRecommendationId": str(recommendation.get("_globalId", "")),
        "platform": normalize_policy_platform(str(recommendation.get("platform", ""))),
        "language": detect_mapping_language(source_text),
        "title": str(recommendation.get("title", "")),
        "currentMappingStatus": str(
            recommendation.get("relutionMapping", {}).get("status", "none")
        ),
        "currentImplementationCategory": str(
            recommendation.get("implementation", {}).get("category", "gap")
        ),
        "exactMappingIds": [
            str(row["mappingId"])
            for row in exact_refs
            if isinstance(row.get("mappingId"), str)
        ],
        "exactMappings": exact_mappings,
        "exactMappingSignature": stable_json(exact_mappings),
        "candidateMappings": candidate_mappings,
        "candidateMappingSignature": stable_json(candidate_mappings),
        "semanticConceptIds": semantic_ids,
        "semanticConceptSignature": stable_json(semantic_ids),
        "normalizedTokens": bilingual_tokens(source_text, recommendation),
        "sourceTextSha256": hashlib.sha256(source_text.encode("utf8")).hexdigest(),
    }
    if diagnostics:
        snapshot["normalizationDiagnostics"] = diagnostics
    return snapshot

def relution_mapping_removed_snapshot(
    previous_snapshot: dict[str, Any],
) -> dict[str, Any]:
    """Return the empty current snapshot used for removed recommendations."""
    return {
        "source": str(previous_snapshot.get("source", "")),
        "recommendationId": str(previous_snapshot.get("recommendationId", "")),
        "globalRecommendationId": str(
            previous_snapshot.get("globalRecommendationId", "")
        ),
        "platform": str(previous_snapshot.get("platform", "")),
        "language": str(previous_snapshot.get("language", "")),
        "title": str(previous_snapshot.get("title", "")),
        "currentMappingStatus": "removed",
        "currentImplementationCategory": "removed",
        "exactMappingIds": [],
        "exactMappings": [],
        "exactMappingSignature": "[]",
        "candidateMappings": [],
        "candidateMappingSignature": "[]",
        "semanticConceptIds": [],
        "semanticConceptSignature": "[]",
        "normalizedTokens": [],
        "sourceTextSha256": "",
    }

def mapping_snapshot(mapping: dict[str, Any]) -> dict[str, Any]:
    """Normalize one exact mapping into the stable change-report shape."""
    return {
        "kind": str(mapping.get("kind", "")),
        "target": str(mapping.get("target", mapping_target(mapping) or "")),
        "fieldPaths": [
            str(path) for path in mapping.get("fieldPaths", []) if isinstance(path, str)
        ],
        "values": mapping.get("values", {})
        if isinstance(mapping.get("values"), dict)
        else {},
        **(
            {"constraints": mapping["constraints"]}
            if isinstance(mapping.get("constraints"), list)
            else {}
        ),
    }
