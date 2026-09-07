"""Cohesive implementation stage 5 for semantic_review_candidates."""

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class PreparedExactReference:
    """Exact reference with immutable token and concept lookup sets."""

    reference: dict[str, Any]
    tokens: frozenset[str]
    concepts: frozenset[str]


def prepare_exact_references(
    references: list[dict[str, Any]],
) -> tuple[PreparedExactReference, ...]:
    """Precompute immutable matching sets once for one artifact build."""

    return tuple(
        PreparedExactReference(
            reference=reference,
            tokens=frozenset(
                str(token)
                for token in reference.get("normalizedTokens", [])
                if isinstance(token, str)
            ),
            concepts=frozenset(
                str(concept)
                for concept in reference.get("semanticConceptIds", [])
                if isinstance(concept, str)
            ),
        )
        for reference in references
    )


def nearest_exact_references(
    platform: str,
    tokens: list[str],
    semantic_ids: list[str],
    references: list[dict[str, Any]] | tuple[PreparedExactReference, ...],
    *,
    limit: int,
) -> list[dict[str, Any]]:
    """Rank exact mappings that can provide review context for a non-exact row."""
    scored: list[tuple[int, dict[str, Any], list[str], list[str]]] = []
    token_set = set(tokens)
    concept_set = set(semantic_ids)
    prepared_references = (
        references
        if isinstance(references, tuple)
        else prepare_exact_references(references)
    )
    for prepared in prepared_references:
        reference = prepared.reference
        shared_tokens = sorted(token_set & prepared.tokens)
        shared_concepts = sorted(concept_set & prepared.concepts)
        score = min(40, len(shared_concepts) * 20) + min(40, len(shared_tokens) * 4)
        if platform == reference.get("platform"):
            score += 20
        if score <= 20:
            continue
        scored.append((score, reference, shared_tokens, shared_concepts))
    scored.sort(
        key=lambda item: (
            -item[0],
            str(item[1]["source"]),
            str(item[1]["recommendationId"]),
            str(item[1]["mappingId"]),
        )
    )
    return [
        {
            "mappingId": reference["mappingId"],
            "source": reference["source"],
            "recommendationId": reference["recommendationId"],
            "language": reference["language"],
            "title": reference["title"],
            "score": score,
            "sharedTokens": shared_tokens[:12],
            "sharedSemanticConceptIds": shared_concepts,
            "mapping": reference["mapping"],
        }
        for score, reference, shared_tokens, shared_concepts in scored[:limit]
    ]

def reference_candidate_overlap(spec: dict[str, Any], reference: dict[str, Any]) -> int:
    """Score how closely a candidate target matches an exact-reference mapping."""
    mapping = reference.get("mapping", {})
    if not isinstance(mapping, dict):
        return 0
    score = 0
    if spec.get("kind") == mapping.get("kind"):
        score += 10
    if spec.get("target") == mapping.get("target"):
        score += 20
    candidate_paths = {
        str(path) for path in spec.get("fieldPaths", []) if isinstance(path, str)
    }
    reference_paths = {
        str(path) for path in mapping.get("fieldPaths", []) if isinstance(path, str)
    }
    score += min(20, len(candidate_paths & reference_paths) * 10)
    return score
