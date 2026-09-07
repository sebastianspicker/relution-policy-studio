"""Registry aggregation for machine documentation coordination."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Mapping

from .catalog import validate_concept_registry, validate_public_api_registry
from .common import REGISTRY_DOCUMENT_TYPES, error, relative
from .manifest_validation import RegistryEntry

ConceptIds = dict[str, tuple[Path, Mapping[str, Any]]]
References = dict[str, list[str]]


def validate_registries(
    entries: list[RegistryEntry], manifest_path: Path, errors: list[str]
) -> tuple[ConceptIds, References]:
    """Validate manifest registries and return the stable concept indexes."""
    concept_entries, public_entries = _partition_entries(entries, errors)
    all_ids, all_references = _validate_concept_entries(concept_entries, manifest_path, errors)
    _validate_public_entries(public_entries, all_ids, manifest_path, errors)
    return all_ids, all_references


def _partition_entries(
    entries: list[RegistryEntry], errors: list[str]
) -> tuple[
    list[tuple[Path, Mapping[str, Any], Mapping[str, Any] | None]],
    list[tuple[Path, Any, Mapping[str, Any] | None]],
]:
    concept_entries: list[tuple[Path, Mapping[str, Any], Mapping[str, Any] | None]] = []
    public_entries: list[tuple[Path, Any, Mapping[str, Any] | None]] = []
    for registry_path, metadata in entries:
        document = _load_registry(registry_path, errors)
        if document is None:
            continue
        if _is_concept_registry(document):
            concept_entries.append((registry_path, document, metadata))
        else:
            public_entries.append((registry_path, document, metadata))
    return concept_entries, public_entries


def _load_registry(path: Path, errors: list[str]) -> Any | None:
    from .common import ValidationFailure, load_json

    try:
        return load_json(path)
    except ValidationFailure as failure:
        errors.append(str(failure))
        return None


def _is_concept_registry(document: Any) -> bool:
    return (
        isinstance(document, Mapping) and document.get("document_type") in REGISTRY_DOCUMENT_TYPES
    )


def _validate_concept_entries(
    entries: list[tuple[Path, Mapping[str, Any], Mapping[str, Any] | None]],
    manifest_path: Path,
    errors: list[str],
) -> tuple[ConceptIds, References]:
    all_ids: ConceptIds = {}
    all_references: References = {}
    for path, document, metadata in entries:
        ids, references = validate_concept_registry(document, path, errors)
        _validate_metadata(metadata, document, "records", manifest_path, path, errors)
        _merge_concept_ids(ids, all_ids, path, errors)
        all_references.update(references)
    return all_ids, all_references


def _merge_concept_ids(ids: ConceptIds, all_ids: ConceptIds, path: Path, errors: list[str]) -> None:
    for concept_id, source in ids.items():
        if concept_id in all_ids:
            error(
                errors,
                path,
                "$.records",
                f"ID {concept_id!r} also exists in {relative(all_ids[concept_id][0])}",
            )
        else:
            all_ids[concept_id] = source


def _validate_public_entries(
    entries: list[tuple[Path, Any, Mapping[str, Any] | None]],
    all_ids: ConceptIds,
    manifest_path: Path,
    errors: list[str],
) -> None:
    for path, document, metadata in entries:
        validate_public_api_registry(document, path, errors, set(all_ids))
        if isinstance(document, Mapping):
            _validate_metadata(metadata, document, "operations", manifest_path, path, errors)


def _validate_metadata(
    metadata: Mapping[str, Any] | None,
    document: Mapping[str, Any],
    record_key: str,
    manifest_path: Path,
    document_path: Path,
    errors: list[str],
) -> None:
    if metadata is None:
        return
    if metadata.get("id") != document.get("document_id"):
        error(
            errors,
            manifest_path,
            "$.datasets",
            f"dataset ID does not match {relative(document_path)}",
        )
    if metadata.get("record_count") != len(document.get(record_key, [])):
        error(
            errors,
            manifest_path,
            "$.datasets",
            f"record_count does not match {relative(document_path)}",
        )
    if metadata.get("document_type") != document.get("document_type"):
        error(
            errors,
            manifest_path,
            "$.datasets",
            f"document_type does not match {relative(document_path)}",
        )
    if metadata.get("schema_path") != document.get("$schema"):
        error(
            errors,
            manifest_path,
            "$.datasets",
            f"schema_path does not match {relative(document_path)}",
        )
    completeness = document.get("completeness")
    if isinstance(completeness, Mapping) and metadata.get("completeness") != completeness.get(
        "level"
    ):
        error(
            errors,
            manifest_path,
            "$.datasets",
            f"completeness does not match {relative(document_path)}",
        )


def validate_dangling_references(
    all_ids: ConceptIds, references: References, manifest_path: Path, errors: list[str]
) -> None:
    """Report concept references whose target IDs do not exist."""
    for source_id, target_ids in sorted(references.items()):
        for target_id in target_ids:
            if target_id not in all_ids:
                source_path = all_ids.get(source_id, (manifest_path, {}))[0]
                error(
                    errors,
                    source_path,
                    f"record {source_id!r}.related_ids",
                    f"dangling reference {target_id!r}",
                )
