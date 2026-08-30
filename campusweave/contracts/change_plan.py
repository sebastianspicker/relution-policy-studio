"""Validate resolved Relution settings change plans."""

import re
from pathlib import Path
from typing import Any, Mapping, Sequence

from .bindings import binding_role_index
from .catalog import validate_operation_reference
from .catalog_operations import (
    OperationReferenceContext,
    OperationReferencePolicy,
)
from .change_plan_controls import (
    _validate_change_plan_impact,
    _validate_change_plan_request,
    _validate_change_plan_target_resource_change,
)
from .change_plan_lifecycle import (
    _validate_change_plan_audit_and_rollback,
    _validate_change_plan_authorization,
    _validate_change_plan_outcome,
)
from .common import (
    CHANGE_PLAN_CONTRACT_KEYS,
    CHANGE_PLAN_OPERATION_KEYS,
    CHANGE_PLAN_ROOT_KEYS,
    CLIENT_OPERATION_SURFACE,
    NON_MUTATING_METHODS,
    PLAN_OPERATION_ROLES,
    PLAN_ROLE_BINDING_ROLES,
    READ_LIKE_METHODS,
    REQUEST_KEYS,
    SCHEMA_VERSION,
    catalog_digest,
    error,
    expect_mapping,
    require_exact_keys,
    validate_string_array,
)


def _resolve_operation(
    role: str,
    reference: Any,
    path: Path,
    errors: list[str],
    digest: str | None,
    operations: Mapping[str, Mapping[str, Any]],
) -> Mapping[str, Any] | None:
    if reference is None:
        return None
    location = f"$.operations.{role}"
    mapping = expect_mapping(reference, errors, path, location)
    if mapping is None:
        return None
    require_exact_keys(mapping, CHANGE_PLAN_OPERATION_KEYS, errors, path, location)
    return validate_operation_reference(
        mapping,
        OperationReferenceContext(
            path,
            location,
            errors,
            digest,
            operations,
            OperationReferencePolicy("catalog_sha256", allowed_surfaces={CLIENT_OPERATION_SURFACE}),
        ),
    )


def _resolve_change_plan_operations(
    plan_operations: Any,
    path: Path,
    errors: list[str],
    digest: str | None,
    operations: Mapping[str, Mapping[str, Any]],
) -> dict[str, Mapping[str, Any] | None] | None:
    if not isinstance(plan_operations, Mapping):
        error(errors, path, "$.operations", "must be an object")
        return None
    require_exact_keys(plan_operations, PLAN_OPERATION_ROLES, errors, path, "$.operations")
    resolved = {
        role: _resolve_operation(role, plan_operations.get(role), path, errors, digest, operations)
        for role in ("read", "write", "readback", "rollback", "audit", "status")
    }
    for role in ("read", "write", "readback"):
        if resolved[role] is None:
            error(errors, path, f"$.operations.{role}", "is required")
    return resolved


def _binding_document_identity(
    root: Mapping[str, Any], bindings: Mapping[str, Any], path: Path, errors: list[str]
) -> None:
    _binding_target_identity(root, bindings, path, errors)
    _binding_contract_identity(root, bindings, path, errors)


def _binding_target_identity(
    root: Mapping[str, Any], bindings: Mapping[str, Any], path: Path, errors: list[str]
) -> None:
    target, plan_target = bindings.get("target"), root.get("target")
    if isinstance(target, Mapping) and isinstance(plan_target, Mapping):
        for binding_field, plan_field in (
            ("authorized_origin", "authorized_origin"),
            ("reported_version", "relution_version"),
            ("organization_id", "organization_id"),
        ):
            if target.get(binding_field) != plan_target.get(plan_field):
                error(
                    errors,
                    path,
                    f"$.target.{plan_field}",
                    "does not match the target binding document",
                )


def _binding_contract_identity(
    root: Mapping[str, Any], bindings: Mapping[str, Any], path: Path, errors: list[str]
) -> None:
    contract, plan_contract = bindings.get("contract"), root.get("contract")
    if isinstance(contract, Mapping) and isinstance(plan_contract, Mapping):
        for binding_field, plan_field in (
            ("source_sha256", "sha256"),
            ("operation_count", "operation_count"),
        ):
            if contract.get(binding_field) != plan_contract.get(plan_field):
                error(
                    errors,
                    path,
                    f"$.contract.{plan_field}",
                    "does not match the target binding document",
                )


def _binding_concepts(
    concept_ids: Sequence[str], index: Mapping[str, Any], path: Path, errors: list[str]
) -> None:
    for concept_id in concept_ids:
        if concept_id not in index:
            error(errors, path, "$.concept_ids", f"{concept_id!r} has no target binding")


def _binding_roles(
    concept_ids: Sequence[str],
    operations: Mapping[str, Any],
    index: Mapping[str, Any],
    path: Path,
    errors: list[str],
) -> None:
    for role, compatible in PLAN_ROLE_BINDING_ROLES.items():
        reference = operations.get(role)
        key = reference.get("operation_key") if isinstance(reference, Mapping) else None
        if not isinstance(key, str):
            continue
        matches = {
            binding_role
            for concept_id in concept_ids
            for binding_role in index.get(concept_id, {}).get(key, set())
        }
        if not matches.intersection(compatible):
            error(
                errors,
                path,
                f"$.operations.{role}.operation_key",
                "is not bound to a compatible role for any plan concept",
            )


def _validate_change_plan_target_bindings(
    root: Mapping[str, Any],
    path: Path,
    errors: list[str],
    plan_concept_ids: Sequence[str],
    plan_operations: Mapping[str, Any],
    bindings_document: Mapping[str, Any],
) -> None:
    if bindings_document.get("binding_status") not in {"partial", "resolved"}:
        error(
            errors,
            path,
            "$.operations",
            "a resolved plan requires current partial/resolved target bindings",
        )
    _binding_document_identity(root, bindings_document, path, errors)
    index = binding_role_index(bindings_document)
    _binding_concepts(plan_concept_ids, index, path, errors)
    _binding_roles(plan_concept_ids, plan_operations, index, path, errors)


def _read_operation_roles(
    resolved: Mapping[str, Mapping[str, Any] | None], path: Path, errors: list[str]
) -> None:
    for role in ("read", "readback", "audit", "status"):
        operation = resolved.get(role)
        if operation is not None and operation.get("method") not in READ_LIKE_METHODS:
            error(
                errors,
                path,
                f"$.operations.{role}.method",
                "must use a read-like method for this role",
            )


def _write_operation_role(
    write: Mapping[str, Any] | None, request: Any, path: Path, errors: list[str]
) -> None:
    if write is None:
        return
    if write.get("method") in NON_MUTATING_METHODS:
        error(
            errors,
            path,
            "$.operations.write.method",
            "must use a mutating method for the write role",
        )
    if not isinstance(request, Mapping):
        return
    _write_request_identity(write, request, path, errors)
    _write_response_statuses(write, request, path, errors)


def _write_request_identity(
    write: Mapping[str, Any], request: Mapping[str, Any], path: Path, errors: list[str]
) -> None:
    if request.get("method") != write.get("method"):
        error(errors, path, "$.request.method", "does not match write operation")
    if request.get("path_template") != write.get("path"):
        error(errors, path, "$.request.path_template", "does not match write operation")


def _write_response_statuses(
    write: Mapping[str, Any], request: Mapping[str, Any], path: Path, errors: list[str]
) -> None:
    statuses = {
        response.get("status")
        for response in write.get("responses", [])
        if isinstance(response, Mapping)
    }
    for status_code in validate_string_array(
        request.get("expected_success_statuses"),
        errors,
        path,
        "$.request.expected_success_statuses",
        nonempty=True,
    ):
        if not re.fullmatch(r"2(?:[0-9]{2}|XX)", status_code):
            error(
                errors,
                path,
                "$.request.expected_success_statuses",
                f"status {status_code!r} is not an explicit 2xx success response",
            )
        if status_code not in statuses:
            error(
                errors,
                path,
                "$.request.expected_success_statuses",
                f"status {status_code!r} is absent from the write operation",
            )


def _distinct_read_keys(operations: Mapping[str, Any], path: Path, errors: list[str]) -> None:
    write = operations.get("write")
    write_key = write.get("operation_key") if isinstance(write, Mapping) else None
    for role in ("read", "readback"):
        reference = operations.get(role)
        if isinstance(reference, Mapping) and reference.get("operation_key") == write_key:
            error(
                errors,
                path,
                f"$.operations.{role}.operation_key",
                "must differ from the write operation",
            )


def _validate_change_plan_operation_roles(
    resolved: Mapping[str, Mapping[str, Any] | None],
    plan_operations: Mapping[str, Any],
    raw_request: Any,
    path: Path,
    errors: list[str],
) -> None:
    _read_operation_roles(resolved, path, errors)
    _write_operation_role(resolved.get("write"), raw_request, path, errors)
    rollback = resolved.get("rollback")
    if rollback is not None and rollback.get("method") in NON_MUTATING_METHODS:
        error(
            errors,
            path,
            "$.operations.rollback.method",
            "must use a mutating method for the rollback role",
        )
    _distinct_read_keys(plan_operations, path, errors)


def _root_and_request(
    document: Any, path: Path, errors: list[str]
) -> tuple[Mapping[str, Any] | None, Mapping[str, Any]]:
    root = expect_mapping(document, errors, path, "$")
    if root is None:
        return None, {}
    require_exact_keys(root, CHANGE_PLAN_ROOT_KEYS, errors, path, "$")
    if root.get("document_type") != "relution-settings-change-plan":
        error(errors, path, "$.document_type", "is not a settings change plan")
    if root.get("schema_version") != SCHEMA_VERSION:
        error(errors, path, "$.schema_version", f"must equal {SCHEMA_VERSION!r}")
    if root.get("sensitive_values_present") is not False:
        error(errors, path, "$.sensitive_values_present", "must be false")
    request = root.get("request")
    if not isinstance(request, Mapping):
        error(errors, path, "$.request", "must be an object")
        request = {}
    else:
        require_exact_keys(request, REQUEST_KEYS, errors, path, "$.request")
    if request.get("automatic_retry_allowed") is not False:
        error(errors, path, "$.request.automatic_retry_allowed", "must be false")
    if request.get("maximum_attempts") != 1:
        error(errors, path, "$.request.maximum_attempts", "must equal 1")
    return root, request


def _plan_status(
    root: Mapping[str, Any], path: Path, errors: list[str]
) -> tuple[str, set[str]] | None:
    status = root.get("plan_status")
    if status == "template":
        if root.get("execution_authorized") is not False:
            error(errors, path, "$.execution_authorized", "template must be false")
        return None
    executable = {"approved", "executing"}
    non_executable = {
        "discovery",
        "planned",
        "verified",
        "rolled_back",
        "blocked",
        "outcome_unknown",
    }
    _status_authorization(root, status, executable, non_executable, path, errors)
    if status not in non_executable | executable:
        error(errors, path, "$.plan_status", "is invalid")
        return None
    if status in executable and root.get("stop_reasons"):
        error(errors, path, "$.stop_reasons", "must be empty before execution")
    return status, executable


def _status_authorization(
    root: Mapping[str, Any],
    status: Any,
    executable: set[str],
    non_executable: set[str],
    path: Path,
    errors: list[str],
) -> None:
    if status in non_executable and root.get("execution_authorized") is not False:
        error(errors, path, "$.execution_authorized", "must be false for this status")
    if status in executable and root.get("execution_authorized") is not True:
        error(errors, path, "$.execution_authorized", "must be true for this status")


def validate_change_plan(
    document: Any,
    path: Path,
    errors: list[str],
    concept_ids: set[str],
    catalog: Mapping[str, Any],
    operations: Mapping[str, Mapping[str, Any]],
    bindings_document: Mapping[str, Any] | None = None,
) -> None:
    root, request = _root_and_request(document, path, errors)
    if root is None:
        return
    plan_concept_ids = validate_string_array(root.get("concept_ids"), errors, path, "$.concept_ids")
    for concept_id in plan_concept_ids:
        if concept_id not in concept_ids:
            error(errors, path, "$.concept_ids", f"unknown ID {concept_id!r}")
    validate_string_array(root.get("stop_reasons"), errors, path, "$.stop_reasons")
    state = _plan_status(root, path, errors)
    if state is None:
        return
    status, executable = state
    if status in {"planned", "approved", "executing", "verified", "rolled_back", "outcome_unknown"}:
        _validate_resolved_change_plan(
            root,
            path,
            errors,
            {
                "concept_ids": plan_concept_ids,
                "catalog": catalog,
                "operations": operations,
                "bindings_document": bindings_document,
                "request": request,
                "status": status,
                "executable": executable,
            },
        )


def _contract(
    root: Mapping[str, Any], catalog: Mapping[str, Any], path: Path, errors: list[str]
) -> str | None:
    if catalog.get("status") != "generated":
        error(errors, path, "$.contract", "planned mutation requires generated catalog")
    digest = catalog_digest(catalog)
    contract = root.get("contract")
    if isinstance(contract, Mapping):
        require_exact_keys(contract, CHANGE_PLAN_CONTRACT_KEYS, errors, path, "$.contract")
    _contract_matches(contract, catalog, digest, path, errors)
    if isinstance(contract, Mapping) and (
        not isinstance(contract.get("catalog_path"), str) or not contract["catalog_path"]
    ):
        error(errors, path, "$.contract.catalog_path", "must be non-empty")
    return digest


def _contract_matches(
    contract: Any, catalog: Mapping[str, Any], digest: str | None, path: Path, errors: list[str]
) -> None:
    if not isinstance(contract, Mapping) or contract.get("sha256") != digest:
        error(errors, path, "$.contract.sha256", "does not match catalog digest")
    if not isinstance(contract, Mapping) or contract.get("checked_current") is not True:
        error(errors, path, "$.contract.checked_current", "must be true")
    if not isinstance(contract, Mapping) or contract.get("operation_count") != catalog.get(
        "operation_count"
    ):
        error(errors, path, "$.contract.operation_count", "does not match catalog")


def _validate_resolved_change_plan(
    root: Mapping[str, Any], path: Path, errors: list[str], context: Mapping[str, Any]
) -> None:
    plan_concept_ids = context["concept_ids"]
    catalog = context["catalog"]
    operations = context["operations"]
    bindings_document = context["bindings_document"]
    request_record = context["request"]
    status = context["status"]
    executable = context["executable"]
    if not plan_concept_ids:
        error(errors, path, "$.concept_ids", "must not be empty for a resolved plan")
    resolved = _resolve_change_plan_operations(
        root.get("operations"), path, errors, _contract(root, catalog, path, errors), operations
    )
    if resolved is None or not isinstance(root.get("operations"), Mapping):
        return
    plan_operations = root["operations"]
    if bindings_document is not None:
        _validate_change_plan_target_bindings(
            root, path, errors, plan_concept_ids, plan_operations, bindings_document
        )
    _validate_change_plan_operation_roles(
        resolved, plan_operations, root.get("request"), path, errors
    )
    _validate_change_plan_request(
        root, path, errors, resolved.get("write"), request_record, status, executable
    )
    impact = root.get("impact")
    _validate_change_plan_impact(root, path, errors)
    _validate_change_plan_target_resource_change(root, path, errors)
    _validate_change_plan_audit_and_rollback(root, path, errors, resolved, impact)
    _validate_change_plan_authorization(root, path, errors, status, executable, impact)
    _validate_change_plan_outcome(root, path, errors, status)
