"""Supports BSI Grundschutz harvesting and recommendation-mapping workflows."""
from __future__ import annotations

import re
from typing import Any

from _recommendation_mapping_modules._mapping_lexical_constants import unique_preserving_order

from .bsi_source_text import normalize_space


def split_values(values: list[str]) -> list[str]:
    """Split comma-separated source values and deduplicate in source order."""

    split = []
    for value in values:
        split.extend(
            normalize_space(part) for part in value.split(",") if normalize_space(part)
        )
    return unique_preserving_order(split)


def count_values(values: Any) -> dict[str, int]:
    """Count non-null values with deterministic key ordering."""

    counts: dict[str, int] = {}
    for value in values:
        if value is None:
            continue
        key = str(value)
        counts[key] = counts.get(key, 0) + 1
    return dict(sorted(counts.items()))


def natural_control_sort_key(control_id: str) -> tuple[Any, ...]:
    """Build a natural sort key for dotted control identifiers."""

    parts: list[Any] = []
    for part in re.split(r"(\d+)", control_id):
        if part.isdigit():
            parts.append(int(part))
        elif part:
            parts.append(part)
    return tuple(parts)
