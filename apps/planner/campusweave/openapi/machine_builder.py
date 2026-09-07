"""Assembly and JSON rendering for the generated machine catalog."""

from __future__ import annotations

import hashlib
import json
from typing import Any, Mapping

from .contract import collect_operations, fixed_http_method_fields
from .machine_data import (
    catalog_contract_servers,
    catalog_operation_servers,
    catalog_parameters,
    catalog_request_body,
    catalog_responses,
    catalog_security,
    catalog_security_schemes,
)
from .types import Operation

CatalogInputs = tuple[list[Operation], Mapping[str, Any], set[str]]


def operation_machine_key(operation: Operation) -> str:
    """Return a deterministic binding key derived from the operation location."""
    key_material = json.dumps(
        [
            operation.surface,
            operation.location,
            operation.lineage or "",
            operation.method,
            operation.path,
        ],
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    return "operation.sha256." + hashlib.sha256(key_material).hexdigest()


def build_machine_catalog(spec: Mapping[str, Any], raw: bytes, source_name: str) -> dict[str, Any]:
    """Build the generated, machine-readable operation catalog."""
    inputs = _catalog_inputs(spec)
    operations, _, _ = inputs
    for operation in operations:
        _validate_operation(operation)
    records = _operation_records(operations, spec)
    return _catalog_document(spec, raw, source_name, inputs, records)


def _catalog_inputs(spec: Mapping[str, Any]) -> CatalogInputs:
    return (
        collect_operations(spec),
        _catalog_info(spec),
        {method.upper() for method in fixed_http_method_fields(spec)},
    )


def _catalog_info(spec: Mapping[str, Any]) -> Mapping[str, Any]:
    raw_info = spec.get("info")
    info: Mapping[str, Any] = raw_info if isinstance(raw_info, Mapping) else {}
    for field in ("title", "version"):
        if info.get(field) is not None and not isinstance(info[field], str):
            raise ValueError(f"info.{field} must be a string")
    return info


def _operation_records(
    operations: list[Operation], spec: Mapping[str, Any]
) -> list[dict[str, Any]]:
    seen_keys: set[str] = set()
    global_security = spec.get("security")
    return [
        _operation_record(operation, spec, global_security, seen_keys) for operation in operations
    ]


def _catalog_document(
    spec: Mapping[str, Any],
    raw: bytes,
    source_name: str,
    inputs: CatalogInputs,
    operation_records: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "document_type": "relution_openapi_operation_catalog",
        "schema_version": "1.0.0",
        "status": "generated",
        "generated_by": "scripts/render_relution_openapi.py",
        "source": _source_record(raw, source_name),
        "contract": _contract_record(spec, inputs),
        "operation_count": len(inputs[0]),
        "operation_key": _operation_key_record(),
        "completeness": _completeness(),
        "servers": _servers_record(spec),
        "security_schemes": catalog_security_schemes(spec),
        "global_security": _global_security_record(spec),
        "operations": operation_records,
    }


def _source_record(raw: bytes, source_name: str) -> dict[str, str]:
    return {
        "file": source_name,
        "sha256": hashlib.sha256(raw).hexdigest(),
        "authority": "supplied_contract",
    }


def _contract_record(spec: Mapping[str, Any], inputs: CatalogInputs) -> dict[str, Any]:
    counts = _operation_counts(spec, inputs)
    return {
        "kind": "openapi" if spec.get("openapi") else "swagger",
        "version": spec.get("openapi") or spec.get("swagger"),
        "info": {"title": inputs[1].get("title"), "version": inputs[1].get("version")},
        "counts": counts,
    }


def _operation_counts(spec: Mapping[str, Any], inputs: CatalogInputs) -> dict[str, int]:
    operations = inputs[0]
    return {
        "paths": len(spec.get("paths") or {}),
        "webhooks": len(spec.get("webhooks") or {}),
        "callback_operations": _callback_operation_count(operations),
        "additional_method_operations": _additional_operation_count(inputs),
        "operations": len(operations),
    }


def _callback_operation_count(operations: list[Operation]) -> int:
    return sum(operation.surface == "callbacks" for operation in operations)


def _additional_operation_count(inputs: CatalogInputs) -> int:
    return sum(operation.method.upper() not in inputs[2] for operation in inputs[0])


def _operation_key_record() -> dict[str, str]:
    return {
        "format": "operation.sha256.<64 lowercase hexadecimal digits>",
        "algorithm": (
            "SHA-256 of the UTF-8 canonical JSON array "
            "[surface, source_location, lineage_or_empty, method, path] "
            "using ensure_ascii=false and separators ',' ':'"
        ),
    }


def _completeness() -> dict[str, Any]:
    return {
        "operation_coverage": "complete_for_supplied_contract",
        "surfaces": ["paths", "webhooks", "callbacks"],
        "openapi_3_2_query_included": True,
        "openapi_3_2_additional_operations_included": True,
        "recursive_callbacks_included": True,
        "local_operation_bearing_references": "resolved",
        "external_operation_bearing_references": "rejected",
        "schema_detail": "structural_summaries_only",
        "examples_included": False,
        "extensions_included": False,
        "source_contract_authoritative": True,
        "runtime_permissions_verified": False,
        "licensed_features_verified": False,
    }


def _servers_record(spec: Mapping[str, Any]) -> dict[str, Any]:
    entries = catalog_contract_servers(spec)
    return {"source": "contract" if entries else "not_declared", "entries": entries}


def _global_security_record(spec: Mapping[str, Any]) -> dict[str, Any]:
    declared = "security" in spec
    return {
        "source": "contract" if declared else "not_declared",
        **catalog_security(spec.get("security"), context="security"),
    }


def _validate_operation(operation: Operation) -> None:
    details = operation.operation
    _validate_operation_strings(details, operation)
    _validate_operation_tags(details, operation)
    if "deprecated" in details and not isinstance(details["deprecated"], bool):
        raise ValueError(f"{operation.location}.deprecated must be a boolean")


def _validate_operation_strings(details: Mapping[str, Any], operation: Operation) -> None:
    for field in ("operationId", "summary"):
        if details.get(field) is not None and not isinstance(details[field], str):
            raise ValueError(f"{operation.location}.{field} must be a string")


def _validate_operation_tags(details: Mapping[str, Any], operation: Operation) -> None:
    tags = details.get("tags") or []
    if not isinstance(tags, list) or not all(isinstance(tag, str) for tag in tags):
        raise ValueError(f"{operation.location}.tags must be a string array")


def _operation_record(
    operation: Operation,
    spec: Mapping[str, Any],
    global_security: Any,
    seen_keys: set[str],
) -> dict[str, Any]:
    details = operation.operation
    key = operation_machine_key(operation)
    _record_unique_key(key, operation, seen_keys)
    callbacks = _declared_callbacks(operation)
    source, security = _operation_security(details, spec, global_security)
    return {
        "key": key,
        "source_location": operation.location,
        "surface": operation.surface,
        "method": operation.method,
        "path": operation.path,
        "operation_id": details.get("operationId"),
        "tags": list(details.get("tags") or []),
        "summary": details.get("summary"),
        "deprecated": details.get("deprecated") is True,
        "lineage": operation.lineage,
        "parameters": catalog_parameters(operation),
        "request_body": catalog_request_body(operation, spec),
        "responses": catalog_responses(operation, spec),
        "security": {
            "source": source,
            **catalog_security(security, context=f"{operation.location}.effective_security"),
        },
        "servers": catalog_operation_servers(operation, spec),
        "declared_callbacks": callbacks,
    }


def _record_unique_key(key: str, operation: Operation, seen_keys: set[str]) -> None:
    if key in seen_keys:
        raise ValueError(
            "duplicate generated operation key for "
            f"{operation.location}; the contract traversal location is ambiguous"
        )
    seen_keys.add(key)


def _declared_callbacks(operation: Operation) -> list[str]:
    callbacks = operation.operation.get("callbacks") or {}
    if not isinstance(callbacks, Mapping):
        raise ValueError(f"{operation.location}.callbacks must be an object")
    return sorted(str(name) for name in callbacks)


def _operation_security(
    details: Mapping[str, Any], spec: Mapping[str, Any], global_security: Any
) -> tuple[str, Any]:
    if "security" in details:
        return "operation", details["security"]
    if "security" in spec:
        return "contract", global_security
    return "not_declared", None


def render_machine_catalog(spec: Mapping[str, Any], raw: bytes, source_name: str) -> str:
    """Render a deterministic JSON catalog with a terminal newline."""
    return (
        json.dumps(
            build_machine_catalog(spec, raw, source_name),
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        )
        + "\n"
    )
