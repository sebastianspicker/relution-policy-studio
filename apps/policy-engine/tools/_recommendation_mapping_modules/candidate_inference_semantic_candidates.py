"""Semantic Candidates helpers for recommendation mapping."""

from typing import Any
from ._semantic_matching_metadata import BSI_CONCEPT_MATCH_REASON
from ._semantic_matching_metadata import MANAGEMENT_SUPPORT_CONCEPT_IDS
from ._mapping_models import SemanticConceptRule
from .field_matching_candidates import candidate_key

def semantic_candidates_for(
    platform: str, concepts: list[dict[str, Any]], *, limit: int = 12
) -> list[dict[str, Any]]:
    """Build review candidates from semantic concepts for one platform."""
    candidates: list[dict[str, Any]] = []
    seen: set[tuple[str, str, tuple[str, ...]]] = set()
    for concept in concepts:
        for target in concept.get("candidateTargets", []):
            if not isinstance(target, dict) or target.get("platform") != platform:
                continue
            field_paths = tuple(
                str(path)
                for path in target.get("fieldPaths", [])
                if isinstance(path, str)
            )
            candidate = {
                "kind": str(target.get("kind", "")),
                "target": str(target.get("target", "")),
                "fieldPaths": list(field_paths),
                "semanticConceptId": str(concept.get("id", "")),
                "match": {
                    "score": int(round(float(concept.get("confidence", 0.0)) * 100)),
                    "matchedTerms": [
                        str(term)
                        for term in concept.get("matchedTerms", [])
                        if isinstance(term, str)
                    ],
                    "valueCompatibility": "concept-candidate",
                    "reason": f"{BSI_CONCEPT_MATCH_REASON}: {target.get('reason', '')}",
                },
            }
            key = candidate_key(candidate)
            if key in seen:
                continue
            seen.add(key)
            candidates.append(candidate)
    concept_order = {
        str(concept.get("id", "")): index for index, concept in enumerate(concepts)
    }
    candidates.sort(
        key=lambda candidate: semantic_candidate_sort_key(candidate, concept_order)
    )
    return candidates[:limit]
def semantic_candidate_targets_for(
    platform: str, rule: SemanticConceptRule
) -> list[dict[str, Any]]:
    """Return semantic rule targets applicable to one platform."""
    targets = []
    for target in rule.targets:
        if platform not in target.platforms:
            continue
        targets.append(
            {
                "platform": platform,
                "kind": target.kind,
                "target": target.target,
                "fieldPaths": list(target.field_paths),
                "reason": target.note,
            }
        )
    return targets
def semantic_candidate_sort_key(
    candidate: dict[str, Any], concept_order: dict[str, int]
) -> tuple[int, int, int, str, str]:
    """Sort semantic candidates by concept order, score, kind, and target."""
    concept_id = str(candidate.get("semanticConceptId", ""))
    match = candidate.get("match", {})
    score = int(match.get("score", 0)) if isinstance(match, dict) else 0
    return (
        1 if concept_id in MANAGEMENT_SUPPORT_CONCEPT_IDS else 0,
        concept_order.get(concept_id, 999),
        -score,
        str(candidate.get("kind", "")),
        str(candidate.get("target", "")),
    )
