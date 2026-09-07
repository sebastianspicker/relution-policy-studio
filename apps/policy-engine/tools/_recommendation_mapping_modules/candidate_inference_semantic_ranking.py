"""Pure ordering rules for inferred semantic concepts."""

from typing import Any
from ._semantic_matching_metadata import DIRECT_SEMANTIC_SOURCES
from ._semantic_matching_metadata import GS_PLUSPLUS_SEMANTIC_SOURCES
from ._semantic_matching_metadata import MANAGEMENT_SUPPORT_CONCEPT_IDS
from ._semantic_matching_metadata import RELATED_SEMANTIC_SOURCES


def semantic_concept_sort_key(concept: dict[str, Any]) -> tuple[int, int, float, str]:
    """Sort concepts by actionability, source quality, confidence, and identifier."""

    concept_id = str(concept.get("id", ""))
    return (
        1 if concept_id in MANAGEMENT_SUPPORT_CONCEPT_IDS else 0,
        semantic_concept_source_rank(concept),
        -float(concept.get("confidence", 0.0)),
        concept_id,
    )


def semantic_concept_source_rank(concept: dict[str, Any]) -> int:
    """Rank the strongest evidence-source family attached to a concept."""

    evidence = concept.get("evidence", [])
    sources = {
        str(entry.get("source", "")) for entry in evidence if isinstance(entry, dict)
    }
    if sources.intersection(DIRECT_SEMANTIC_SOURCES):
        return 0
    if sources.intersection(RELATED_SEMANTIC_SOURCES):
        return 1
    if sources.intersection(GS_PLUSPLUS_SEMANTIC_SOURCES):
        return 2
    return 3
