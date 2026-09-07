"""Apple Merge helpers for recommendation mapping."""

from typing import Any
from ._mapping_lexical_constants import unique_preserving_order

def merge_without_conflict(left: Any, right: Any) -> dict[str, Any] | None:
    """Merge nested dictionaries, returning None when a leaf value conflicts."""

    if not isinstance(left, dict) or not isinstance(right, dict):
        return None
    merged = dict(left)
    for key, value in right.items():
        if key not in merged:
            merged[key] = value
            continue
        if isinstance(merged[key], dict) and isinstance(value, dict):
            child = merge_without_conflict(merged[key], value)
            if child is None:
                return None
            merged[key] = child
            continue
        if merged[key] != value:
            return None
    return merged
def merge_match_metadata(left: Any, right: Any) -> dict[str, Any]:
    """Merge match details while preserving the strongest score and unique terms."""

    left_match = left if isinstance(left, dict) else {}
    right_match = right if isinstance(right, dict) else {}
    return {
        "score": max(int(left_match.get("score", 0)), int(right_match.get("score", 0))),
        "matchedTerms": unique_preserving_order(
            [
                *[
                    str(term)
                    for term in left_match.get("matchedTerms", [])
                    if isinstance(term, str)
                ],
                *[
                    str(term)
                    for term in right_match.get("matchedTerms", [])
                    if isinstance(term, str)
                ],
            ]
        ),
        "valueCompatibility": "curated-analog",
        "reason": "Curated Apple schema analogs matched managed-device recommendation wording.",
    }
