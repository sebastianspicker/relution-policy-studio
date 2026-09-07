"""Android helpers for recommendation mapping."""

from ._android_analog_rules import ANDROID_ANALOG_RULES
from ._android_analog_rules import ANDROID_CANDIDATE_RULES
from ._mapping_models import AndroidAnalogRule
from typing import Any
from .field_matching_text import matched_rule_terms
from .field_matching_text import normalize_search_text
from .field_matching_text import phrase_groups_match
from .field_matching_text import stable_match_value
from .field_matching_text import values_from_pairs

from .candidate_inference_apple_analog import (
    curated_analog_context,
)

def android_relution_analog_mappings_for(
    platform: str,
    title: str,
    recommended_value: Any,
    *,
    extra_texts: tuple[str, ...] = (),
) -> list[dict[str, Any]]:
    """Return curated exact Android Enterprise analog mappings."""
    if platform not in {"ANDROID", "ANDROID_ENTERPRISE"}:
        return []
    haystack, mappings, seen = curated_analog_context(
        title, extra_texts, recommended_value
    )

    for rule in ANDROID_ANALOG_RULES:
        if not phrase_groups_match(haystack, rule.required) or any(
            normalize_search_text(phrase) in haystack for phrase in rule.excluded
        ):
            continue
        key = (
            rule.target,
            tuple(
                sorted((path, stable_match_value(value)) for path, value in rule.values)
            ),
        )
        if key in seen:
            continue
        seen.add(key)
        mappings.append(android_relution_mapping(rule, haystack))
    return mappings
def android_relution_candidates_for(
    platform: str,
    title: str,
    *,
    extra_texts: tuple[str, ...] = (),
) -> list[dict[str, Any]]:
    """Return Android Enterprise candidate targets for organization-specific review."""
    if platform not in {"ANDROID", "ANDROID_ENTERPRISE"}:
        return []
    haystack = normalize_search_text(
        " ".join((title, *(str(text) for text in extra_texts)))
    )
    candidates: list[dict[str, Any]] = []
    seen: set[tuple[str, tuple[str, ...]]] = set()
    for target, field_paths, required, note in ANDROID_CANDIDATE_RULES:
        if not phrase_groups_match(haystack, required):
            continue
        key = (target, field_paths)
        if key in seen:
            continue
        seen.add(key)
        candidates.append(
            {
                "kind": "relution-native",
                "target": target,
                "fieldPaths": list(field_paths),
                "match": {
                    "score": 80,
                    "matchedTerms": matched_rule_terms(haystack, required),
                    "valueCompatibility": "org-specific-android-enterprise",
                    "reason": note,
                },
            }
        )
    return candidates
def android_relution_mapping(rule: AndroidAnalogRule, haystack: str) -> dict[str, Any]:
    """Render an exact Android Relution mapping from a curated analog rule."""
    mapping: dict[str, Any] = {
        "kind": "relution-native",
        "type": rule.target,
        "values": values_from_pairs(rule.values),
        "match": {
            "score": 100,
            "matchedTerms": matched_rule_terms(haystack, rule.required),
            "valueCompatibility": "curated-android-analog",
            "reason": rule.reason,
        },
    }
    if rule.constraints:
        mapping["constraints"] = [
            {"path": path, "operator": operator, "value": value}
            for path, operator, value in rule.constraints
        ]
    return mapping
