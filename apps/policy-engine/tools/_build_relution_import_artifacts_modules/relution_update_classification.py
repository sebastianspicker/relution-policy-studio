"""Cohesive implementation stage 3 for relution_mapping_updates."""

from typing import Any
from .ruleset_semantic_targets import candidate_target_specs
from .recommendation_mapping_entries import optional_dict_entries
from .recommendation_mapping_entries import optional_string_entries
from .artifact_io_values import stable_json

def candidate_mapping_snapshots(
    recommendation: dict[str, Any],
    review_row: dict[str, Any] | None,
    diagnostics: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Normalize ranked or generated candidates into stable snapshot rows."""
    source = str(recommendation.get("_source", ""))
    raw_candidates: list[dict[str, Any]] = []
    if isinstance(review_row, dict):
        raw_candidates.extend(
            optional_dict_entries(
                source,
                recommendation,
                "review.rankedCandidates",
                review_row.get("rankedCandidates"),
                diagnostics,
            )
        )
    if not raw_candidates:
        raw_candidates.extend(candidate_target_specs(recommendation))
    snapshots: list[dict[str, Any]] = []
    for index, candidate in enumerate(raw_candidates):
        snapshots.append(
            {
                "kind": str(candidate.get("kind", "")),
                "target": str(candidate.get("target", "")),
                "fieldPaths": optional_string_entries(
                    source,
                    recommendation,
                    f"candidateMappings[{index}].fieldPaths",
                    candidate.get("fieldPaths"),
                    diagnostics,
                ),
                "referenceMappingIds": optional_string_entries(
                    source,
                    recommendation,
                    f"candidateMappings[{index}].referenceMappingIds",
                    candidate.get("referenceMappingIds"),
                    diagnostics,
                ),
                "semanticConceptId": str(candidate.get("semanticConceptId", "")),
            }
        )
    snapshots.sort(
        key=lambda row: (
            row["kind"],
            row["target"],
            row["fieldPaths"],
            row["referenceMappingIds"],
            row["semanticConceptId"],
        )
    )
    return snapshots

def classify_recommendation_mapping_change(
    previous: dict[str, Any] | None, current: dict[str, Any] | None
) -> str:
    """Classify mapping drift by exact target, value, candidate, or evidence changes."""
    for classification, changed in (
        ("unchanged", previous is None and current is None),
        ("new-recommendation", previous is None),
        ("removed-recommendation", current is None),
    ):
        if changed:
            return classification
    if previous is None or current is None:
        return "unchanged"
    for classification, changed in (
        (
            "status-changed",
            previous.get("currentMappingStatus") != current.get("currentMappingStatus"),
        ),
        (
            "exact-target-changed",
            exact_mapping_target_signature(previous)
            != exact_mapping_target_signature(current),
        ),
        (
            "exact-value-changed",
            previous.get("exactMappingSignature")
            != current.get("exactMappingSignature"),
        ),
        (
            "candidate-target-changed",
            previous.get("candidateMappingSignature")
            != current.get("candidateMappingSignature"),
        ),
        (
            "semantic-only",
            previous.get("semanticConceptSignature")
            != current.get("semanticConceptSignature"),
        ),
    ):
        if changed:
            return classification
    evidence_keys = ("title", "language", "sourceTextSha256")
    if any(previous.get(key) != current.get(key) for key in evidence_keys):
        return "evidence-only"
    return "unchanged"

def exact_mapping_target_signature(snapshot: dict[str, Any]) -> str:
    """Return a stable signature that ignores exact mapping values."""
    targets = [
        {
            "kind": str(mapping.get("kind", "")),
            "target": str(mapping.get("target", "")),
            "fieldPaths": [
                str(path)
                for path in mapping.get("fieldPaths", [])
                if isinstance(path, str)
            ],
        }
        for mapping in snapshot.get("exactMappings", [])
        if isinstance(mapping, dict)
    ]
    return stable_json(
        sorted(targets, key=lambda row: (row["kind"], row["target"], row["fieldPaths"]))
    )
