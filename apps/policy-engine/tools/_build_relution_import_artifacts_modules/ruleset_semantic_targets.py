"""Candidate semantic-target extraction for Relution ruleset artifacts."""

from __future__ import annotations

from typing import Any

from .artifact_io_values import normalize_policy_platform
from .ruleset_semantic_core import semantic_target_id
from .ruleset_semantic_links import exact_target_specs


def candidate_target_specs(recommendation: dict[str, Any]) -> list[dict[str, Any]]:
    """Extract candidate mapping target specs that are not already exact."""

    exact_target_ids = {
        semantic_target_id(
            normalize_policy_platform(str(recommendation["platform"])),
            spec["kind"],
            spec["target"],
            spec["fieldPaths"],
        )
        for spec in exact_target_specs(recommendation)
    }
    specs = []
    for candidate in recommendation.get("relutionMapping", {}).get("candidates", []):
        if (
            not isinstance(candidate, dict)
            or not isinstance(candidate.get("target"), str)
            or not isinstance(candidate.get("kind"), str)
        ):
            continue
        spec = {
            "kind": str(candidate["kind"]),
            "target": str(candidate["target"]),
            "fieldPaths": [
                str(path)
                for path in candidate.get("fieldPaths", [])
                if isinstance(path, str)
            ],
            **(
                {"match": candidate["match"]}
                if isinstance(candidate.get("match"), dict)
                else {}
            ),
            **(
                {"semanticConceptId": candidate["semanticConceptId"]}
                if isinstance(candidate.get("semanticConceptId"), str)
                else {}
            ),
        }
        if (
            semantic_target_id(
                normalize_policy_platform(str(recommendation["platform"])),
                spec["kind"],
                spec["target"],
                spec["fieldPaths"],
            )
            in exact_target_ids
        ):
            continue
        specs.append(spec)
    return specs
