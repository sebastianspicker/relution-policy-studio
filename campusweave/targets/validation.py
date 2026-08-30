"""Target-context validation orchestration."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Mapping

from .. import openapi, profiles
from ..contracts.bindings import validate_bindings
from ..contracts.catalog import validate_catalog
from ..private_artifacts import load_json_beneath
from ._support import (
    ROOT_KEYS,
    TARGET_FORMAT,
    TARGET_SCHEMA,
    UTC_TIMESTAMP,
    _exact_keys,
    _load_evidence,
    _mapping,
    _origin,
    _relative_path,
    _scan_for_secrets,
    _validate_inventory,
    _validate_profile_binding_coverage,
)

INVENTORY_FORMAT = "relution-university-inventory-snapshot"
INVENTORY_SCHEMA = "urn:campusweave-relution:schema:university-inventory-snapshot:1.0.0"


def _validate_header(
    document: Any,
    profile: Mapping[str, Any],
    errors: list[str],
) -> tuple[
    Mapping[str, Any] | None,
    Mapping[str, Any] | None,
    Mapping[str, Any] | None,
    Mapping[str, Any] | None,
    Mapping[str, Any] | None,
    str | None,
    Any,
    str | None,
]:
    root = _mapping(document, "$", errors)
    if root is None:
        return None, None, None, None, None, None, None, None
    _exact_keys(root, ROOT_KEYS, "$", errors)
    _validate_header_identity(root, errors)
    status = root.get("context_status")
    _validate_header_status(root, status, errors)
    _scan_for_secrets(root, "$", errors)
    sections = _sections(root, profile, errors)
    stop_reasons = root.get("stop_reasons")
    if (
        not isinstance(stop_reasons, list)
        or not stop_reasons
        or not all(isinstance(item, str) and item for item in stop_reasons)
        or len(stop_reasons) != len(set(stop_reasons))
    ):
        errors.append("$.stop_reasons: must be a non-empty unique array of strings")
    evidence_root = _relative_path(root.get("evidence_root"), "$.evidence_root", errors)
    return (*sections, status, evidence_root)


def _validate_header_identity(root: Mapping[str, Any], errors: list[str]) -> None:
    expected = (
        ("$schema", TARGET_SCHEMA),
        ("schema_version", "1.0.0"),
        ("document_type", TARGET_FORMAT),
    )
    for field, value in expected:
        if root.get(field) != value:
            message = (
                "$.document_type: is not a university runtime target context"
                if field == "document_type"
                else f"$.{field}: must equal {value!r}"
            )
            errors.append(message)


def _validate_header_status(root: Mapping[str, Any], status: Any, errors: list[str]) -> None:
    if status not in {"template", "evidence_bound", "stale"}:
        errors.append("$.context_status: must be template, evidence_bound, or stale")
    if status == "stale":
        errors.append("$.context_status: stale target contexts are non-operational")
    if root.get("sensitive_values_present") is not False:
        errors.append("$.sensitive_values_present: must be false")
    if root.get("execution_authorized") is not False:
        errors.append("$.execution_authorized: target context can never authorize execution")


def _sections(
    root: Mapping[str, Any],
    profile: Mapping[str, Any],
    errors: list[str],
) -> tuple[
    Mapping[str, Any] | None,
    Mapping[str, Any] | None,
    Mapping[str, Any] | None,
    Mapping[str, Any] | None,
    Mapping[str, Any] | None,
    str | None,
]:
    profile_ref = _mapping(root.get("profile"), "$.profile", errors)
    target = _mapping(root.get("target"), "$.target", errors)
    contract = _mapping(root.get("contract"), "$.contract", errors)
    bindings = _mapping(root.get("bindings"), "$.bindings", errors)
    inventory = _mapping(root.get("inventory"), "$.inventory", errors)
    if profile_ref is not None:
        _exact_keys(profile_ref, {"path", "package_id", "sha256"}, "$.profile", errors)
        profile_relative = _relative_path(profile_ref.get("path"), "$.profile.path", errors)
        if profile_ref.get("package_id") != profile.get("package", {}).get("package_id"):
            errors.append("$.profile.package_id: does not match the supplied profile")
    else:
        profile_relative = None
    _section_keys(target, contract, bindings, inventory, errors)
    return profile_ref, target, contract, bindings, inventory, profile_relative


def _section_keys(
    target: Mapping[str, Any] | None,
    contract: Mapping[str, Any] | None,
    bindings: Mapping[str, Any] | None,
    inventory: Mapping[str, Any] | None,
    errors: list[str],
) -> None:
    if target is not None:
        _exact_keys(
            target,
            {
                "authorized_origin",
                "effective_api_server",
                "relution_version",
                "organization_id",
                "organization_name",
            },
            "$.target",
            errors,
        )
    if contract is not None:
        _exact_keys(
            contract,
            {
                "openapi_path",
                "openapi_sha256",
                "catalog_path",
                "catalog_sha256",
                "operation_count",
                "checked_current",
            },
            "$.contract",
            errors,
        )
    if bindings is not None:
        _exact_keys(
            bindings, {"path", "sha256", "status", "semantic_role_status"}, "$.bindings", errors
        )
    if inventory is not None:
        _exact_keys(
            inventory,
            {"path", "sha256", "captured_at", "complete_for_scope"},
            "$.inventory",
            errors,
        )


def _template_errors(
    profile_ref: Mapping[str, Any] | None,
    target: Mapping[str, Any] | None,
    contract: Mapping[str, Any] | None,
    bindings: Mapping[str, Any] | None,
    inventory: Mapping[str, Any] | None,
    errors: list[str],
) -> None:
    fields = {
        "profile": (profile_ref, ("sha256",)),
        "target": (
            target,
            (
                "authorized_origin",
                "effective_api_server",
                "relution_version",
                "organization_id",
                "organization_name",
            ),
        ),
        "contract": (
            contract,
            ("openapi_path", "openapi_sha256", "catalog_path", "catalog_sha256", "operation_count"),
        ),
        "bindings": (bindings, ("path", "sha256")),
        "inventory": (inventory, ("path", "sha256", "captured_at")),
    }
    for name, (section, names) in fields.items():
        _template_section_errors(name, section, names, errors)
    _template_state_errors(contract, bindings, inventory, errors)


def _template_state_errors(
    contract: Mapping[str, Any] | None,
    bindings: Mapping[str, Any] | None,
    inventory: Mapping[str, Any] | None,
    errors: list[str],
) -> None:
    checks = (
        (contract, "checked_current", False, "$.contract.checked_current: template must be false"),
        (
            bindings,
            "status",
            "template",
            "$.bindings.status: template context requires template bindings",
        ),
        (
            bindings,
            "semantic_role_status",
            "unresolved",
            "$.bindings.semantic_role_status: template context requires unresolved semantics",
        ),
        (
            inventory,
            "complete_for_scope",
            False,
            "$.inventory.complete_for_scope: template must be false",
        ),
    )
    for section, field, expected, message in checks:
        if section is not None and section.get(field) != expected:
            errors.append(message)


def _template_section_errors(
    name: str, section: Mapping[str, Any] | None, names: tuple[str, ...], errors: list[str]
) -> None:
    if section is None:
        return
    for field in names:
        if section.get(field) is not None:
            errors.append(f"$.{name}.{field}: template target field must remain null")


def _context_root(context_path: Path, document: Any, errors: list[str]) -> Path | None:
    try:
        context_root = context_path.parent.resolve(strict=True)
    except OSError as exc:
        errors.append(str(exc))
        return None
    try:
        reloaded, _, _, _ = load_json_beneath(context_root, context_path.name, private=True)
    except ValueError as exc:
        errors.append(str(exc))
        return context_root
    if reloaded != document:
        errors.append("$: context changed between the supplied and private descriptor reads")
    return context_root


def _validate_target_values(target: Mapping[str, Any] | None, errors: list[str]) -> str | None:
    if target is None:
        return None
    authorized = _origin(target.get("authorized_origin"), "$.target.authorized_origin", errors)
    effective = _origin(target.get("effective_api_server"), "$.target.effective_api_server", errors)
    _validate_canonical_origin(target, "authorized_origin", authorized, errors)
    _validate_canonical_origin(target, "effective_api_server", effective, errors)
    if authorized is not None and effective is not None and authorized != effective:
        errors.append("$.target.effective_api_server: must equal the explicitly authorized origin")
    _validate_target_texts(target, errors)
    return authorized


def _validate_canonical_origin(
    target: Mapping[str, Any], field: str, canonical: str | None, errors: list[str]
) -> None:
    if canonical is not None and target.get(field) != canonical:
        errors.append(f"$.target.{field}: must use its canonical origin form")


def _validate_target_texts(target: Mapping[str, Any], errors: list[str]) -> None:
    for field in ("relution_version", "organization_id", "organization_name"):
        value = target.get(field)
        if not isinstance(value, str) or not value or value.strip() != value:
            errors.append(f"$.target.{field}: must be an evidence-bound, trimmed string")


def _load_profile_snapshot(
    context_root: Path,
    evidence_root: str,
    profile_ref: Mapping[str, Any] | None,
    profile_relative: str | None,
    profile: Mapping[str, Any],
    profile_path: Path,
    profile_sha256: str | None,
    errors: list[str],
) -> tuple[Any, str, Path, bytes] | None:
    if profile_ref is None or profile_relative is None:
        return None
    loaded = _load_evidence(
        context_root,
        evidence_root,
        profile_relative,
        "$.profile.sha256",
        profile_ref.get("sha256"),
        errors,
    )
    if loaded is None:
        return None
    value, digest, artifact_path, raw = loaded
    _validate_profile_path(artifact_path, profile_path, errors)
    _validate_profile_value(value, profile, errors)
    if profile_sha256 is not None and profile_sha256 != digest:
        errors.append("$.profile.sha256: differs from the supplied profile snapshot")
    return value, digest, artifact_path, raw


def _validate_profile_path(actual: Path, supplied: Path, errors: list[str]) -> None:
    try:
        expected = supplied.resolve(strict=True)
    except OSError as exc:
        errors.append(f"$.profile.path: cannot resolve the supplied profile: {exc}")
    else:
        if actual != expected:
            errors.append("$.profile.path: does not resolve to the supplied profile")


def _validate_profile_value(value: Any, profile: Mapping[str, Any], errors: list[str]) -> None:
    if not isinstance(value, Mapping):
        errors.append("$.profile.path: profile JSON root must be an object")
    elif value != profile:
        errors.append("$.profile.path: private profile snapshot differs from the supplied profile")


def _load_artifacts(
    context_root: Path,
    evidence_root: str,
    sections: tuple[tuple[str, str, Mapping[str, Any] | None, str, str], ...],
    errors: list[str],
) -> dict[str, tuple[Any, str, Path, bytes]]:
    loaded: dict[str, tuple[Any, str, Path, bytes]] = {}
    for name, section_name, section, path_field, digest_field in sections:
        if section is None:
            continue
        relative = _relative_path(section.get(path_field), f"$.{section_name}.{path_field}", errors)
        if relative is None:
            continue
        artifact = _load_evidence(
            context_root,
            evidence_root,
            relative,
            f"$.{section_name}.{digest_field}",
            section.get(digest_field),
            errors,
        )
        if artifact is not None:
            loaded[name] = artifact
    return loaded


def _validate_contract(
    contract: Mapping[str, Any] | None,
    loaded: dict[str, tuple[Any, str, Path, bytes]],
    errors: list[str],
) -> tuple[Mapping[str, Any] | None, dict[str, Mapping[str, Any]]]:
    _validate_contract_metadata(contract, errors)
    openapi_artifact, catalog_artifact = loaded.get("openapi"), loaded.get("catalog")
    if openapi_artifact is None or catalog_artifact is None:
        return None, {}
    openapi_document, _, openapi_path, openapi_raw = openapi_artifact
    catalog_document, _, catalog_path, _ = catalog_artifact
    if not _mapping_artifacts(openapi_document, catalog_document, errors):
        return None, {}
    if not isinstance(openapi_document, Mapping) or not isinstance(catalog_document, Mapping):
        return None, {}
    _validate_exact_catalog(openapi_document, openapi_raw, openapi_path, catalog_document, errors)
    machine_errors: list[str] = []
    validated_operations = validate_catalog(catalog_document, catalog_path, machine_errors)
    operations = _operation_index(validated_operations, errors)
    errors.extend(machine_errors)
    _validate_contract_operation_count(contract, catalog_document, errors)
    return catalog_document, operations


def _validate_exact_catalog(
    openapi_document: Mapping[str, Any],
    openapi_raw: bytes,
    openapi_path: Path,
    catalog_document: Mapping[str, Any],
    errors: list[str],
) -> None:
    try:
        expected = openapi.build_machine_catalog(openapi_document, openapi_raw, openapi_path.name)
    except (TypeError, ValueError, RecursionError) as exc:
        errors.append(f"$.contract.openapi_path: cannot render exact catalog: {exc}")
    else:
        if catalog_document != expected:
            errors.append(
                "$.contract.catalog_path: catalog is not the renderer's exact output for the bound OpenAPI bytes"
            )


def _operation_index(validated_operations: Any, errors: list[str]) -> dict[str, Mapping[str, Any]]:
    operations: dict[str, Mapping[str, Any]] = {}
    if isinstance(validated_operations, Mapping):
        for key, operation in validated_operations.items():
            if isinstance(key, str) and isinstance(operation, Mapping):
                operations[key] = operation
            else:
                errors.append(
                    "$.contract.catalog_path: catalog validator returned an invalid operation index"
                )
                break
    else:
        errors.append(
            "$.contract.catalog_path: catalog validator returned an invalid operation index"
        )
    return operations


def _validate_contract_operation_count(
    contract: Mapping[str, Any] | None, catalog_document: Mapping[str, Any], errors: list[str]
) -> None:
    if contract is not None and catalog_document.get("operation_count") != contract.get(
        "operation_count"
    ):
        errors.append("$.contract.operation_count: does not match the exact catalog")


def _validate_contract_metadata(contract: Mapping[str, Any] | None, errors: list[str]) -> None:
    if contract is None:
        return
    if contract.get("checked_current") is not True:
        errors.append("$.contract.checked_current: must be true")
    count = contract.get("operation_count")
    if not isinstance(count, int) or isinstance(count, bool) or count < 1:
        errors.append("$.contract.operation_count: must be a positive integer")


def _mapping_artifacts(openapi: Any, catalog: Any, errors: list[str]) -> bool:
    if not isinstance(openapi, Mapping):
        errors.append("$.contract.openapi_path: OpenAPI JSON root must be an object")
        return False
    if not isinstance(catalog, Mapping):
        errors.append("$.contract.catalog_path: catalog JSON root must be an object")
        return False
    return True


def _validate_bindings(inputs: Mapping[str, Any], errors: list[str]) -> None:
    bindings, artifact = inputs["section"], inputs["artifact"]
    catalog, operations = inputs["catalog"], inputs["operations"]
    target, contract, authorized, profile = (
        inputs[key] for key in ("target", "contract", "authorized", "profile")
    )
    if bindings is not None:
        if bindings.get("status") != "contract_bound":
            errors.append(
                "$.bindings.status: evidence-bound context requires contract_bound bindings"
            )
        if bindings.get("semantic_role_status") != "operator_asserted_unproven":
            errors.append(
                "$.bindings.semantic_role_status: evidence-bound context requires operator_asserted_unproven semantics"
            )
    if artifact is None:
        return
    document, _, path, _ = artifact
    if not isinstance(document, Mapping):
        errors.append("$.bindings.path: bindings JSON root must be an object")
    elif catalog is None:
        errors.append("$.bindings.path: cannot validate bindings without an exact catalog")
    else:
        _validate_binding_document(
            {
                "document": document,
                "path": path,
                "catalog": catalog,
                "operations": operations,
                "target": target,
                "contract": contract,
                "authorized": authorized,
                "profile": profile,
            },
            errors,
        )


def _validate_binding_document(inputs: Mapping[str, Any], errors: list[str]) -> None:
    document, path, catalog, operations = (
        inputs[key] for key in ("document", "path", "catalog", "operations")
    )
    target, contract, authorized, profile = (
        inputs[key] for key in ("target", "contract", "authorized", "profile")
    )
    _scan_for_secrets(document, "bindings.$", errors)
    concept_errors: list[str] = []
    concept_ids = profiles.concept_ids_from_manifest(profiles.DEFAULT_MANIFEST, concept_errors)
    errors.extend(concept_errors)
    machine_errors: list[str] = []
    validate_bindings(document, path, machine_errors, concept_ids, catalog, operations)
    errors.extend(machine_errors)
    if document.get("binding_status") != "resolved":
        errors.append("$.bindings.path: binding document must be structurally resolved")
    _validate_profile_binding_coverage(document, profile, errors)
    _validate_binding_identity(document, target, contract, authorized, errors)


def _validate_binding_identity(
    document: Mapping[str, Any],
    target: Mapping[str, Any] | None,
    contract: Mapping[str, Any] | None,
    authorized: str | None,
    errors: list[str],
) -> None:
    binding_target = document.get("target")
    expected = (
        {
            "authorized_origin": authorized,
            "reported_version": target.get("relution_version"),
            "organization_id": target.get("organization_id"),
        }
        if target is not None
        else None
    )
    if (
        isinstance(binding_target, Mapping)
        and expected is not None
        and dict(binding_target) != expected
    ):
        errors.append("$.bindings.path: binding target does not match this context")
    _validate_binding_contract(document.get("contract"), contract, errors)


def _validate_binding_contract(
    binding_contract: Any, contract: Mapping[str, Any] | None, errors: list[str]
) -> None:
    if not isinstance(binding_contract, Mapping) or contract is None:
        return
    if binding_contract.get("source_sha256") != contract.get("openapi_sha256"):
        errors.append("$.bindings.path: binding contract digest does not match this context")
    if binding_contract.get("operation_count") != contract.get("operation_count"):
        errors.append("$.bindings.path: binding operation count does not match this context")


def _validate_inventory_section(
    inventory: Mapping[str, Any] | None,
    artifact: tuple[Any, str, Path, bytes] | None,
    target: Mapping[str, Any] | None,
    contract: Mapping[str, Any] | None,
    profile_loaded: tuple[Any, str, Path, bytes] | None,
    openapi_artifact: tuple[Any, str, Path, bytes] | None,
    errors: list[str],
) -> None:
    if inventory is None:
        return
    _validate_inventory_metadata(inventory, errors)
    captured_at = inventory.get("captured_at")
    if artifact is not None and target is not None and contract is not None:
        _validate_inventory(
            artifact[0],
            profile_sha256=profile_loaded[1] if profile_loaded else "",
            contract_sha256=openapi_artifact[1] if openapi_artifact else "",
            target=target,
            captured_at=captured_at,
            errors=errors,
        )


def _validate_inventory_metadata(inventory: Mapping[str, Any], errors: list[str]) -> None:
    if inventory.get("complete_for_scope") is not True:
        errors.append("$.inventory.complete_for_scope: must be true")
    captured_at = inventory.get("captured_at")
    if not isinstance(captured_at, str) or UTC_TIMESTAMP.fullmatch(captured_at) is None:
        errors.append("$.inventory.captured_at: must be an exact UTC timestamp ending in Z")


def validate_target_context(
    document: Any,
    context_path: Path,
    profile: Mapping[str, Any],
    profile_path: Path,
    profile_sha256: str | None = None,
) -> list[str]:
    """Validate a template or evidence-bound context without credentials or HTTP."""
    errors: list[str] = []
    root = _mapping(document, "$", errors)
    if root is None:
        return errors
    profile_ref, target, contract, bindings, inventory, profile_relative, status, evidence_root = (
        _validate_header(document, profile, errors)
    )
    if status == "template":
        _template_errors(profile_ref, target, contract, bindings, inventory, errors)
        return sorted(set(errors))
    if status != "evidence_bound" or evidence_root is None:
        return sorted(set(errors))
    context_root = _context_root(context_path, document, errors)
    if context_root is None:
        return sorted(set(errors))
    authorized = _validate_target_values(target, errors)
    profile_loaded = _load_profile_snapshot(
        context_root,
        evidence_root,
        profile_ref,
        profile_relative,
        profile,
        profile_path,
        profile_sha256,
        errors,
    )
    sections = (
        ("openapi", "contract", contract, "openapi_path", "openapi_sha256"),
        ("catalog", "contract", contract, "catalog_path", "catalog_sha256"),
        ("bindings", "bindings", bindings, "path", "sha256"),
        ("inventory", "inventory", inventory, "path", "sha256"),
    )
    loaded = _load_artifacts(context_root, evidence_root, sections, errors)
    catalog, operations = _validate_contract(contract, loaded, errors)
    _validate_bindings(
        {
            "section": bindings,
            "artifact": loaded.get("bindings"),
            "catalog": catalog,
            "operations": operations,
            "target": target,
            "contract": contract,
            "authorized": authorized,
            "profile": profile,
        },
        errors,
    )
    _validate_inventory_section(
        inventory,
        loaded.get("inventory"),
        target,
        contract,
        profile_loaded,
        loaded.get("openapi"),
        errors,
    )
    return sorted(set(errors))
