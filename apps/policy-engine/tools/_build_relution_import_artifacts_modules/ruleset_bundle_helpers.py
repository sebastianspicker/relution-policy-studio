"""Value-merging helpers for Relution setting bundles."""

from __future__ import annotations

from typing import Any

from .artifact_io_values import path_to_string
from .artifact_io_values import stable_json


def find_conflicting_paths(entries: list[dict[str, Any]]) -> set[tuple[str, ...]]:
    """Return flattened value paths with more than one serialized value."""

    values_by_path: dict[tuple[str, ...], set[str]] = {}
    for entry in entries:
        for path, value in entry["flattenedValues"].items():
            values_by_path.setdefault(path, set()).add(stable_json(value))
    return {path for path, values in values_by_path.items() if len(values) > 1}


def merged_non_conflicting_paths(
    entries: list[dict[str, Any]], conflicting_paths: set[tuple[str, ...]]
) -> dict[tuple[str, ...], Any]:
    """Merge flattened paths that are safe to share across all variants."""

    merged: dict[tuple[str, ...], Any] = {}
    for entry in entries:
        for path, value in sorted(entry["flattenedValues"].items()):
            if path in conflicting_paths:
                continue
            merged[path] = value
    return merged


def inflate_values(flattened: dict[tuple[str, ...], Any]) -> dict[str, Any]:
    """Rebuild nested values from flattened tuple paths."""

    root: dict[str, Any] = {}
    for path in sorted(flattened):
        cursor = root
        for key in path[:-1]:
            cursor = cursor.setdefault(key, {})
        cursor[path[-1]] = flattened[path]
    return root


def variant_entries_by_signature(
    entries: list[dict[str, Any]],
    conflicts: set[tuple[str, ...]],
) -> dict[tuple[tuple[str, str], ...], list[dict[str, Any]]]:
    """Group entries by serialized values at conflicting paths."""

    variants_by_signature: dict[tuple[tuple[str, str], ...], list[dict[str, Any]]] = {}
    for entry in entries:
        if not any(path in entry["flattenedValues"] for path in conflicts):
            continue
        signature = variant_signature(entry, conflicts)
        variants_by_signature.setdefault(signature, []).append(entry)
    return variants_by_signature


def variant_signature(
    entry: dict[str, Any], conflicts: set[tuple[str, ...]]
) -> tuple[tuple[str, str], ...]:
    """Return the stable conflict-value signature for one variant entry."""

    return tuple(
        sorted(
            (path_to_string(path), stable_json(entry["flattenedValues"][path]))
            for path in conflicts
            if path in entry["flattenedValues"]
        )
    )
