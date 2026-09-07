"""Manifest-specific validation for machine documentation coordination."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Mapping

from .common import (
    DATE,
    EVIDENCE_CLASSES,
    MANIFEST_KEYS,
    SCHEMA_VERSION,
    error,
    expect_list,
    expect_mapping,
    require_exact_keys,
    validate_string_array,
)

RegistryEntry = tuple[Path, Mapping[str, Any] | None]


def manifest_registry_paths(document: Any, path: Path, errors: list[str]) -> list[RegistryEntry]:
    """Resolve registry dataset paths from the central manifest."""
    root = expect_mapping(document, errors, path, "$")
    if root is None:
        return []
    _validate_manifest_header(root, path, errors)
    _validate_evidence_classes(root, path, errors)
    datasets = expect_list(root.get("datasets"), errors, path, "$.datasets")
    return _dataset_entries(datasets, path, errors)


def _validate_manifest_header(root: Mapping[str, Any], path: Path, errors: list[str]) -> None:
    require_exact_keys(root, MANIFEST_KEYS, errors, path, "$")
    if root.get("schema_version") != SCHEMA_VERSION:
        error(errors, path, "$.schema_version", f"must equal {SCHEMA_VERSION!r}")
    if root.get("product") != "Relution MDM":
        error(errors, path, "$.product", "must equal 'Relution MDM'")
    if not isinstance(root.get("as_of"), str) or not DATE.fullmatch(root["as_of"]):
        error(errors, path, "$.as_of", "must use YYYY-MM-DD")
    validate_string_array(
        root.get("authority_order"), errors, path, "$.authority_order", nonempty=True
    )
    validate_string_array(
        root.get("cross_reference_rules"), errors, path, "$.cross_reference_rules", nonempty=True
    )


def _validate_evidence_classes(root: Mapping[str, Any], path: Path, errors: list[str]) -> None:
    evidence_classes = (
        expect_list(root.get("evidence_classes"), errors, path, "$.evidence_classes") or []
    )
    declared = _declared_evidence_classes(evidence_classes, path, errors)
    if declared != EVIDENCE_CLASSES:
        missing = sorted(EVIDENCE_CLASSES - declared)
        if missing:
            error(errors, path, "$.evidence_classes", f"missing: {', '.join(missing)}")


def _declared_evidence_classes(
    evidence_classes: list[Any], path: Path, errors: list[str]
) -> set[str]:
    declared: set[str] = set()
    for index, raw_item in enumerate(evidence_classes):
        location = f"$.evidence_classes[{index}]"
        item = expect_mapping(raw_item, errors, path, location)
        if item is None:
            continue
        _validate_evidence_class(item, location, path, errors, declared)
    return declared


def _validate_evidence_class(
    item: Mapping[str, Any], location: str, path: Path, errors: list[str], declared: set[str]
) -> None:
    evidence_id = item.get("id")
    if evidence_id not in EVIDENCE_CLASSES:
        error(errors, path, f"{location}.id", "is not a supported evidence class")
    elif evidence_id in declared:
        error(errors, path, f"{location}.id", "is duplicated")
    else:
        declared.add(evidence_id)
    if not isinstance(item.get("meaning"), str) or not item["meaning"]:
        error(errors, path, f"{location}.meaning", "must be non-empty")


def _dataset_entries(
    datasets: list[Any] | None, path: Path, errors: list[str]
) -> list[RegistryEntry]:
    if datasets is None:
        return []
    entries: list[RegistryEntry] = []
    seen: set[Path] = set()
    for index, item in enumerate(datasets):
        entry = _dataset_entry(item, index, path, errors, seen)
        if entry is not None:
            entries.append(entry)
    return entries


def _dataset_entry(
    item: Any, index: int, path: Path, errors: list[str], seen: set[Path]
) -> RegistryEntry | None:
    location = f"$.datasets[{index}]"
    filename, metadata = _dataset_details(item, path, location, errors)
    if filename is None:
        return None
    resolved = _resolve_dataset(filename, path, location, errors)
    if resolved is None or resolved in seen:
        if resolved in seen:
            error(errors, path, location, f"duplicate dataset {filename!r}")
        return None
    seen.add(resolved)
    if metadata is not None:
        _validate_dataset_metadata(metadata, path, location, errors)
    return resolved, metadata


def _dataset_details(
    item: Any, path: Path, location: str, errors: list[str]
) -> tuple[str | None, Mapping[str, Any] | None]:
    if isinstance(item, str):
        return item, None
    if isinstance(item, Mapping):
        filename = item.get("file") or item.get("path")
        if isinstance(filename, str) and filename:
            return filename, item
        error(errors, path, location, "must declare a non-empty file/path")
        return None, None
    error(errors, path, location, "must be a filename or object")
    return None, None


def _resolve_dataset(filename: str, path: Path, location: str, errors: list[str]) -> Path | None:
    resolved = (path.parent / filename).resolve()
    if path.parent.resolve() in resolved.parents:
        return resolved
    error(errors, path, location, "dataset must remain inside the registry directory")
    return None


def _validate_dataset_metadata(
    metadata: Mapping[str, Any], path: Path, location: str, errors: list[str]
) -> None:
    record_count = metadata.get("record_count")
    if not isinstance(record_count, int) or isinstance(record_count, bool) or record_count < 1:
        error(errors, path, f"{location}.record_count", "must be a positive integer")
    schema_path = metadata.get("schema_path")
    if not isinstance(schema_path, str) or not schema_path:
        error(errors, path, f"{location}.schema_path", "must be non-empty")
    elif not (path.parent / schema_path).resolve().is_file():
        error(errors, path, f"{location}.schema_path", "does not exist")
