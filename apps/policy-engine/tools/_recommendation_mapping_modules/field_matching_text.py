"""Text helpers for recommendation mapping."""

from typing import Any
import json
import re

from .field_matching_values import (
    value_at_path,
)

def normalize_search_text(value: str) -> str:
    """Normalize bilingual free text for phrase containment checks."""

    normalized = value.lower()
    normalized = (
        normalized.replace("ä", "ae")
        .replace("ö", "oe")
        .replace("ü", "ue")
        .replace("ß", "ss")
    )
    normalized = normalized.replace("–", "-").replace("—", "-")
    normalized = re.sub(r"[^a-z0-9/+-]+", " ", normalized)
    return re.sub(r"\s+", " ", normalized).strip()
def phrase_groups_match(haystack: str, required: tuple[tuple[str, ...], ...]) -> bool:
    """Return true when each required phrase group has one phrase in the text."""

    return all(
        any(normalize_search_text(phrase) in haystack for phrase in group)
        for group in required
    )
def matched_rule_terms(
    haystack: str, required: tuple[tuple[str, ...], ...]
) -> list[str]:
    """Return the normalized phrase selected from each matched phrase group."""

    matched: list[str] = []
    for group in required:
        for phrase in group:
            normalized = normalize_search_text(phrase)
            if normalized in haystack:
                matched.append(normalized)
                break
    return matched
def values_from_pairs(pairs: tuple[tuple[str, Any], ...]) -> dict[str, Any]:
    """Expand dotted path/value pairs into one nested value object."""

    values: dict[str, Any] = {}
    for path, value in pairs:
        values.update(value_at_path(path, value))
    return values
def flatten_leaf_items(
    value: Any, prefix: tuple[str, ...] = ()
) -> list[tuple[str, Any]]:
    """Flatten a nested value tree into dotted leaf paths with values."""

    if isinstance(value, dict):
        items: list[tuple[str, Any]] = []
        for key in sorted(value):
            items.extend(flatten_leaf_items(value[key], (*prefix, str(key))))
        return items
    return [(".".join(prefix), value)]
def stable_match_value(value: Any) -> str:
    """Serialize a value deterministically for candidate comparison."""

    return json.dumps(value, ensure_ascii=False, sort_keys=True)
def first_int(value: str) -> int | None:
    """Return the first integer embedded in text, if any."""

    match = re.search(r"\d+", value)
    return int(match.group(0)) if match is not None else None
