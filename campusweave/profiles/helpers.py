"""Shared structural and safety helpers for university profile validation."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Mapping, Sequence

from ..json_snapshot import load_strict_json
from .constants import (
    EMAIL,
    FORBIDDEN_KEYS,
    FORBIDDEN_NORMALIZED_KEYS,
    ID_PATTERNS,
    MAX_DOCUMENT_BYTES,
    SECRET_TEXT,
    URL,
    UUID,
)


def load_json(path: Path) -> Any:
    return load_strict_json(path, max_bytes=MAX_DOCUMENT_BYTES)[0]


def add(errors: list[str], location: str, message: str) -> None:
    errors.append(f"{location}: {message}")


def mapping(value: Any, errors: list[str], location: str) -> Mapping[str, Any] | None:
    if not isinstance(value, Mapping):
        add(errors, location, "must be an object")
        return None
    return value


def array(value: Any, errors: list[str], location: str) -> list[Any]:
    if not isinstance(value, list):
        add(errors, location, "must be an array")
        return []
    return value


def exact_keys(
    value: Mapping[str, Any], expected: set[str], errors: list[str], location: str
) -> None:
    missing = sorted(expected - set(value))
    unknown = sorted(set(value) - expected)
    if missing:
        add(errors, location, f"missing keys: {', '.join(missing)}")
    if unknown:
        add(errors, location, f"unknown keys: {', '.join(unknown)}")


def _non_empty_string(value: Any, errors: list[str], location: str) -> str | None:
    if not isinstance(value, str) or not value:
        add(errors, location, "must be a non-empty string")
        return None
    return value


def string_list(
    value: Any, errors: list[str], location: str, *, nonempty: bool = False
) -> list[str]:
    items = array(value, errors, location)
    if nonempty and not items:
        add(errors, location, "must not be empty")
    strings: list[str] = []
    for index, item in enumerate(items):
        string = _non_empty_string(item, errors, f"{location}[{index}]")
        if string is not None:
            strings.append(string)
    duplicates = sorted({item for item in strings if strings.count(item) > 1})
    if duplicates:
        add(errors, location, f"duplicate values: {', '.join(duplicates)}")
    return strings


def records(
    root: Mapping[str, Any],
    field: str,
    expected_keys: set[str],
    id_field: str,
    errors: list[str],
) -> tuple[list[Mapping[str, Any]], dict[str, Mapping[str, Any]]]:
    result: list[Mapping[str, Any]] = []
    indexed: dict[str, Mapping[str, Any]] = {}
    for index, raw in enumerate(array(root.get(field), errors, f"$.{field}")):
        location = f"$.{field}[{index}]"
        item = mapping(raw, errors, location)
        if item is None:
            continue
        exact_keys(item, expected_keys, errors, location)
        identifier = item.get(id_field)
        if not isinstance(identifier, str) or not identifier:
            add(errors, f"{location}.{id_field}", "must be a non-empty string")
        elif id_field in ID_PATTERNS and ID_PATTERNS[id_field].fullmatch(identifier) is None:
            add(errors, f"{location}.{id_field}", "does not match its stable ID namespace")
        elif identifier in indexed:
            add(errors, f"{location}.{id_field}", f"duplicate ID {identifier!r}")
        else:
            indexed[identifier] = item
        result.append(item)
    return result, indexed


def require_reference(
    value: Any,
    known: Mapping[str, Any] | set[str],
    errors: list[str],
    location: str,
) -> None:
    if not isinstance(value, str) or value not in known:
        add(errors, location, f"unresolved reference {value!r}")


def require_references(
    value: Any,
    known: Mapping[str, Any] | set[str],
    errors: list[str],
    location: str,
    *,
    nonempty: bool = False,
) -> list[str]:
    values = string_list(value, errors, location, nonempty=nonempty)
    for item in values:
        require_reference(item, known, errors, location)
    return values


def _walk_dependency_graph(
    start: str,
    graph: Mapping[str, Sequence[str]],
    state: dict[str, int],
    errors: list[str],
    location: str,
) -> None:
    state[start] = 1
    path = [start]
    positions = {start: 0}
    frames: list[tuple[str, Any]] = [(start, iter(graph.get(start, ())))]
    while frames:
        node, targets = frames[-1]
        try:
            target = next(targets)
        except StopIteration:
            frames.pop()
            state[node] = 2
            positions.pop(node, None)
            path.pop()
            continue
        if target == node:
            add(errors, location, f"self-reference {node!r}")
            continue
        if target not in graph:
            continue
        marker = state.get(target, 0)
        if marker == 1:
            cycle_start = positions.get(target, 0)
            add(errors, location, "dependency cycle: " + " -> ".join(path[cycle_start:] + [target]))
        elif marker == 0:
            state[target] = 1
            positions[target] = len(path)
            path.append(target)
            frames.append((target, iter(graph.get(target, ()))))


def validate_acyclic(graph: Mapping[str, Sequence[str]], errors: list[str], location: str) -> None:
    state: dict[str, int] = {}
    for start in graph:
        if state.get(start, 0) == 0:
            _walk_dependency_graph(start, graph, state, errors, location)


def _scan_commit_mapping(
    value: Mapping[str, Any], errors: list[str], location: str, depth: int
) -> None:
    for key, item in value.items():
        normalized_key = re.sub(r"[^a-z0-9]", "", key.lower())
        if key.lower() in FORBIDDEN_KEYS or normalized_key in FORBIDDEN_NORMALIZED_KEYS:
            add(errors, f"{location}.{key}", "target, executable, or sensitive field is forbidden")
        scan_commit_boundary(item, errors, f"{location}.{key}", depth + 1)


def _scan_commit_list(value: list[Any], errors: list[str], location: str, depth: int) -> None:
    for index, item in enumerate(value):
        scan_commit_boundary(item, errors, f"{location}[{index}]", depth + 1)


def _scan_commit_text(value: str, errors: list[str], location: str) -> None:
    patterns = (
        (SECRET_TEXT, "looks like secret or credential material"),
        (EMAIL, "person or contact email is forbidden"),
        (UUID, "target-like UUID is forbidden"),
        (URL, "network URLs are forbidden in the commit-safe package"),
    )
    for pattern, message in patterns:
        if pattern.search(value):
            add(errors, location, message)
    if value.startswith("/") or re.match(r"^[A-Za-z]:[\\/]", value):
        add(errors, location, "absolute filesystem paths are forbidden")


def scan_commit_boundary(
    value: Any, errors: list[str], location: str = "$", depth: int = 0
) -> None:
    if depth > 40:
        add(errors, location, "nesting exceeds the 40-level safety bound")
        return
    if isinstance(value, Mapping):
        _scan_commit_mapping(value, errors, location, depth)
    elif isinstance(value, list):
        _scan_commit_list(value, errors, location, depth)
    elif isinstance(value, str):
        _scan_commit_text(value, errors, location)


def _registry_relative_path(
    entry: Mapping[str, Any], index: int, errors: list[str]
) -> tuple[Path, str] | None:
    location = f"manifest.$.datasets[{index}].file"
    relative_path = entry.get("file")
    if not isinstance(relative_path, str) or not relative_path:
        add(errors, location, "must be a non-empty string")
        return None
    registry_relative = Path(relative_path)
    if registry_relative.is_absolute() or ".." in registry_relative.parts:
        add(errors, location, "must be a contained relative path without '..'")
        return None
    return registry_relative, location


def _contained_registry_path(
    relative_path: Path,
    location: str,
    manifest_path: Path,
    manifest_root: Path,
    errors: list[str],
) -> Path | None:
    registry_candidate = manifest_path.parent
    for component in relative_path.parts:
        registry_candidate = registry_candidate / component
        if registry_candidate.is_symlink():
            add(errors, location, f"symlinked path component is forbidden: {registry_candidate}")
            return None
    try:
        registry_path = (manifest_path.parent / relative_path).resolve(strict=True)
    except OSError as exc:
        add(errors, location, f"cannot resolve regular registry file: {exc}")
        return None
    if not registry_path.is_relative_to(manifest_root):
        add(errors, location, "resolves outside the manifest directory")
        return None
    return registry_path


def _registry_concept_ids(path: Path, errors: list[str]) -> set[str]:
    try:
        registry = load_json(path)
    except ValueError as exc:
        errors.append(str(exc))
        return set()
    if not isinstance(registry, Mapping):
        return set()
    return {
        record["id"]
        for record in registry.get("records", [])
        if isinstance(record, Mapping) and isinstance(record.get("id"), str)
    }


def _concept_ids_from_entries(
    entries: list[Any], manifest_path: Path, manifest_root: Path, errors: list[str]
) -> set[str]:
    known: set[str] = set()
    for index, entry in enumerate(entries):
        if not isinstance(entry, Mapping):
            continue
        if entry.get("document_type") not in {
            "feature_registry",
            "setting_registry",
            "policy_registry",
            "group_registry",
        }:
            continue
        relative = _registry_relative_path(entry, index, errors)
        if relative is None:
            continue
        relative_path, location = relative
        registry_path = _contained_registry_path(
            relative_path, location, manifest_path, manifest_root, errors
        )
        if registry_path is not None:
            known.update(_registry_concept_ids(registry_path, errors))
    return known


def concept_ids_from_manifest(manifest_path: Path, errors: list[str]) -> set[str]:
    try:
        manifest = load_json(manifest_path)
    except ValueError as exc:
        errors.append(str(exc))
        return set()
    try:
        manifest_root = manifest_path.parent.resolve(strict=True)
    except OSError as exc:
        errors.append(f"{manifest_path.parent}: cannot resolve manifest directory: {exc}")
        return set()
    root = mapping(manifest, errors, "manifest.$")
    if root is None:
        return set()
    entries = array(root.get("datasets"), errors, "manifest.$.datasets")
    return _concept_ids_from_entries(entries, manifest_path, manifest_root, errors)
