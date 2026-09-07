"""Target binding validation for machine-readable Relution documents."""

from pathlib import Path
from typing import Any, Mapping

from .bindings_records import BindingValidationContext, validate_binding_record
from .common import (
    SCHEMA_VERSION,
    TARGET_BINDING_CONTRACT_KEYS,
    TARGET_BINDING_ROOT_KEYS,
    TARGET_BINDING_TARGET_KEYS,
    catalog_digest,
    error,
    expect_list,
    expect_mapping,
    parse_timestamp,
    require_exact_keys,
    validate_https_url,
    validate_string_array,
)


def validate_bindings(
    document: Any,
    path: Path,
    errors: list[str],
    concept_ids: set[str],
    catalog: Mapping[str, Any],
    operations: Mapping[str, Mapping[str, Any]],
) -> None:
    """Validate target bindings against one generated catalog."""

    root = expect_mapping(document, errors, path, "$")
    if root is None:
        return
    status = validate_binding_root(root, path, errors)
    bindings = expect_list(root.get("bindings"), errors, path, "$.bindings") or []
    unresolved = validate_unresolved_ids(root, concept_ids, path, errors)
    if status == "template":
        validate_template_bindings(bindings, path, errors)
        return
    validate_operational_binding_root(root, catalog, status, path, errors)
    digest = catalog_digest(catalog)
    if digest is None:
        error(
            errors,
            path,
            "$.contract.source_sha256",
            "cannot validate bindings without a catalog digest",
        )
        return
    validate_binding_records(
        bindings, concept_ids, digest, operations, status, unresolved, path, errors
    )
    if status == "resolved" and unresolved:
        error(errors, path, "$.unresolved_concept_ids", "must be empty when resolved")


def validate_binding_root(root: Mapping[str, Any], path: Path, errors: list[str]) -> Any:
    """Validate root shape and return its declared binding status."""

    require_exact_keys(root, TARGET_BINDING_ROOT_KEYS, errors, path, "$")
    if root.get("document_type") != "relution-target-contract-bindings":
        error(errors, path, "$.document_type", "is not a target binding document")
    if root.get("schema_version") != SCHEMA_VERSION:
        error(errors, path, "$.schema_version", f"must equal {SCHEMA_VERSION!r}")
    if root.get("sensitive_values_present") is not False:
        error(errors, path, "$.sensitive_values_present", "must be false")
    status = root.get("binding_status")
    if status not in {"template", "partial", "resolved", "stale"}:
        error(errors, path, "$.binding_status", "is invalid")
    validate_binding_root_sections(root, path, errors)
    return status


def validate_binding_root_sections(root: Mapping[str, Any], path: Path, errors: list[str]) -> None:
    """Validate target and contract section key sets."""

    target = expect_mapping(root.get("target"), errors, path, "$.target")
    if target is not None:
        require_exact_keys(target, TARGET_BINDING_TARGET_KEYS, errors, path, "$.target")
    contract = expect_mapping(root.get("contract"), errors, path, "$.contract")
    if contract is not None:
        require_exact_keys(contract, TARGET_BINDING_CONTRACT_KEYS, errors, path, "$.contract")


def validate_unresolved_ids(
    root: Mapping[str, Any], concept_ids: set[str], path: Path, errors: list[str]
) -> list[str]:
    """Validate unresolved IDs and return them for cross-record checks."""

    unresolved = validate_string_array(
        root.get("unresolved_concept_ids"), errors, path, "$.unresolved_concept_ids"
    )
    for concept_id in unresolved:
        if concept_id not in concept_ids:
            error(errors, path, "$.unresolved_concept_ids", f"unknown ID {concept_id!r}")
    return unresolved


def validate_template_bindings(bindings: list[Any], path: Path, errors: list[str]) -> None:
    """Require templates to remain non-operational."""

    if bindings:
        error(errors, path, "$.bindings", "template bindings must be empty")


def validate_operational_binding_root(
    root: Mapping[str, Any], catalog: Mapping[str, Any], status: Any, path: Path, errors: list[str]
) -> None:
    """Validate root constraints that apply to operational binding documents."""

    bindings = root.get("bindings")
    if status == "stale":
        error(
            errors,
            path,
            "$.binding_status",
            "stale bindings are non-operational; regenerate and re-resolve them",
        )
    if status in {"partial", "resolved"} and not bindings:
        error(errors, path, "$.bindings", "must not be empty for operational bindings")
    validate_target(root.get("target"), path, errors)
    if catalog.get("status") != "generated":
        error(errors, path, "$.binding_status", "requires a generated target catalog")
    validate_contract(root.get("contract"), catalog, status, path, errors)


def validate_target(target_value: Any, path: Path, errors: list[str]) -> None:
    """Validate resolved target identity values when the target is a mapping."""

    target = target_value if isinstance(target_value, Mapping) else None
    if target is None:
        return
    validate_https_url(
        target.get("authorized_origin"),
        errors,
        path,
        "$.target.authorized_origin",
        origin_only=True,
    )
    for field in ("reported_version", "organization_id"):
        if not isinstance(target.get(field), str) or not target[field]:
            error(errors, path, f"$.target.{field}", "must be resolved")


def validate_contract(
    contract_value: Any, catalog: Mapping[str, Any], status: Any, path: Path, errors: list[str]
) -> None:
    """Validate catalog integrity metadata when the contract is a mapping."""

    contract = contract_value if isinstance(contract_value, Mapping) else None
    if contract is None:
        return
    validate_contract_catalog_identity(contract, catalog, path, errors)
    validate_contract_freshness(contract, status, path, errors)


def validate_contract_catalog_identity(
    contract: Mapping[str, Any], catalog: Mapping[str, Any], path: Path, errors: list[str]
) -> None:
    """Validate immutable catalog identity values in a binding contract."""

    if contract.get("source_sha256") != catalog_digest(catalog):
        error(errors, path, "$.contract.source_sha256", "does not match catalog digest")
    if contract.get("operation_count") != catalog.get("operation_count"):
        error(errors, path, "$.contract.operation_count", "does not match catalog")


def validate_contract_freshness(
    contract: Mapping[str, Any], status: Any, path: Path, errors: list[str]
) -> None:
    """Validate freshness metadata required by operational bindings."""

    if status in {"partial", "resolved"} and contract.get("catalog_checked_current") is not True:
        error(errors, path, "$.contract.catalog_checked_current", "must be true")
    if not isinstance(contract.get("catalog_path"), str) or not contract["catalog_path"]:
        error(errors, path, "$.contract.catalog_path", "must be non-empty")
    if status in {"partial", "resolved"}:
        parse_timestamp(contract.get("validated_at"), errors, path, "$.contract.validated_at")


def validate_binding_records(
    bindings: list[Any],
    concept_ids: set[str],
    digest: str,
    operations: Mapping[str, Mapping[str, Any]],
    status: Any,
    unresolved: list[str],
    path: Path,
    errors: list[str],
) -> None:
    """Validate each binding while retaining duplicate-binding state."""

    seen_keys: set[tuple[str, str | None]] = set()
    context = BindingValidationContext(
        concept_ids, digest, operations, status, unresolved, seen_keys
    )
    for index, raw_binding in enumerate(bindings):
        validate_binding_record(raw_binding, f"$.bindings[{index}]", context, path, errors)


def binding_role_index(document: Any) -> dict[str, dict[str, set[str]]]:
    """Index validated-shape concept operation roles for cross-document checks."""

    index: dict[str, dict[str, set[str]]] = {}
    if not isinstance(document, Mapping):
        return index
    bindings = document.get("bindings")
    if not isinstance(bindings, list):
        return index
    for binding in bindings:
        index_binding_roles(binding, index)
    return index


def index_binding_roles(binding: Any, index: dict[str, dict[str, set[str]]]) -> None:
    """Add one shape-checked binding's operation roles to an index."""

    if not isinstance(binding, Mapping):
        return
    concept_id = binding.get("concept_id")
    operation_bindings = binding.get("operations")
    if not isinstance(concept_id, str) or not isinstance(operation_bindings, list):
        return
    concept_index = index.setdefault(concept_id, {})
    for operation in operation_bindings:
        index_operation_role(operation, concept_index)


def index_operation_role(operation: Any, concept_index: dict[str, set[str]]) -> None:
    """Add one shape-checked operation role to a concept index."""

    if not isinstance(operation, Mapping):
        return
    key = operation.get("operation_key")
    role = operation.get("role")
    if isinstance(key, str) and isinstance(role, str):
        concept_index.setdefault(key, set()).add(role)
