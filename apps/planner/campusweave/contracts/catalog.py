"""Catalog and registry validation for machine-readable Relution documents."""

from .catalog_concepts import validate_concept_registry
from .catalog_operations import (
    operation_key,
    request_body_media_types,
    validate_catalog,
    validate_operation_reference,
)
from .catalog_public import validate_public_api_registry

__all__ = [
    "operation_key",
    "request_body_media_types",
    "validate_catalog",
    "validate_concept_registry",
    "validate_operation_reference",
    "validate_public_api_registry",
]


def schema_refs(value: object) -> set[str]:
    """Collect reference strings from a generated operation summary."""
    if isinstance(value, dict):
        return _mapping_schema_refs(value)
    if isinstance(value, list):
        return _list_schema_refs(value)
    return set()


def _mapping_schema_refs(value: dict[object, object]) -> set[str]:
    found: set[str] = set()
    for key, child in value.items():
        if key in {"ref", "$ref"} and isinstance(child, str):
            found.add(child)
        found.update(schema_refs(child))
    return found


def _list_schema_refs(value: list[object]) -> set[str]:
    found: set[str] = set()
    for child in value:
        found.update(schema_refs(child))
    return found
