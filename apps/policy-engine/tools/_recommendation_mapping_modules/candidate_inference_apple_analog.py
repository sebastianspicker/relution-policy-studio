"""Apple Analog helpers for recommendation mapping."""

from ._apple_analog_constants import APPLE_ANALOG_RULES
from typing import Any
from ._mapping_models import AppleAnalogRule
from .field_matching_text import flatten_leaf_items
from .field_matching_text import matched_rule_terms
from .field_matching_apple_mapping import merge_apple_schema_mappings
from .field_matching_text import normalize_search_text
from .field_matching_text import phrase_groups_match
from .field_matching_text import stable_match_value
from .field_matching_text import values_from_pairs

from .candidate_inference_apple_numeric import (
    apple_numeric_analog_mappings_for,
)

def apple_schema_analog_mappings_for(
    platform: str,
    title: str,
    recommended_value: Any,
    *,
    extra_texts: tuple[str, ...] = (),
) -> list[dict[str, Any]]:
    """Return curated Apple schema analog mappings for iOS and macOS text."""
    if platform not in {"IOS", "MACOS"}:
        return []
    haystack, mappings, seen = curated_analog_context(
        title, extra_texts, recommended_value
    )

    for rule in APPLE_ANALOG_RULES:
        mapping, key = apple_analog_rule_mapping(platform, haystack, rule)
        if mapping is None or key in seen:
            continue
        seen.add(key)
        mappings.append(mapping)

    append_unique_apple_mappings(
        mappings, seen, apple_numeric_analog_mappings_for(platform, haystack)
    )
    return merge_apple_schema_mappings(mappings)
def apple_analog_rule_mapping(
    platform: str, haystack: str, rule: AppleAnalogRule
) -> tuple[dict[str, Any] | None, tuple[str, tuple[tuple[str, str], ...]]]:
    """Apply one curated Apple analog rule and return its dedupe key."""
    key = (
        rule.schema_id,
        tuple(sorted((path, stable_match_value(value)) for path, value in rule.values)),
    )
    if (
        platform not in rule.platforms
        or not phrase_groups_match(haystack, rule.required)
        or any(phrase in haystack for phrase in rule.excluded)
    ):
        return None, key
    mapping: dict[str, Any] = {
        "kind": "apple-schema-profile",
        "schemaId": rule.schema_id,
        "values": values_from_pairs(rule.values),
        "match": {
            "score": 100,
            "matchedTerms": matched_rule_terms(haystack, rule.required),
            "valueCompatibility": "curated-analog",
            "reason": rule.reason,
        },
    }
    if rule.constraints:
        mapping["constraints"] = [
            {"path": path, "operator": operator, "value": value}
            for path, operator, value in rule.constraints
        ]
    return mapping, key
def append_unique_apple_mappings(
    mappings: list[dict[str, Any]],
    seen: set[tuple[str, tuple[tuple[str, str], ...]]],
    candidates: list[dict[str, Any]],
) -> None:
    """Append Apple mappings whose schema/value key has not been seen."""
    for mapping in candidates:
        key = apple_mapping_key(mapping)
        if key in seen:
            continue
        seen.add(key)
        mappings.append(mapping)
def apple_mapping_key(
    mapping: dict[str, Any],
) -> tuple[str, tuple[tuple[str, str], ...]]:
    """Build the schema/value key used to dedupe Apple mappings."""
    return (
        str(mapping.get("schemaId", "")),
        tuple(
            sorted(
                (path, stable_match_value(value))
                for path, value in flatten_leaf_items(mapping.get("values", {}))
            )
        ),
    )
def curated_analog_context(
    title: str, extra_texts: tuple[str, ...], recommended_value: Any
) -> tuple[
    str,
    list[dict[str, Any]],
    set[tuple[str, tuple[tuple[str, str], ...]]],
]:
    """Initialize normalized text and dedupe state for curated analog rules."""
    haystack = normalize_search_text(
        " ".join((title, *(str(text) for text in extra_texts), str(recommended_value or "")))
    )
    return haystack, [], set()
