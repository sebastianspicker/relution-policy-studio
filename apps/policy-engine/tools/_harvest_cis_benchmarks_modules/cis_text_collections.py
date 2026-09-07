"""Collection and whitespace helpers shared by CIS harvesters."""
from __future__ import annotations

def unique_profile_keys(keys: list[dict[str, str]]) -> list[dict[str, str]]:
    """Deduplicate profile key/value entries while preserving source order."""

    seen = set()
    unique: list[dict[str, str]] = []
    for entry in keys:
        marker = (entry["key"], entry["value"])
        if marker in seen:
            continue
        seen.add(marker)
        unique.append(entry)
    return unique


def unique_preserving_order(values: list[str]) -> list[str]:
    """Return non-empty strings in first-seen order."""

    return list(dict.fromkeys(value for value in values if value))


def normalize_space(value: str) -> str:
    """Collapse all whitespace in a string to single spaces."""

    return " ".join(value.split())

