"""Validation for private, digest-bound university target contexts."""

from __future__ import annotations

import ipaddress
import re
from pathlib import Path, PurePosixPath
from typing import Any, Mapping
from urllib.parse import urlsplit

import render_relution_openapi
import university_profile
import validate_machine_docs

from .io import load_json_beneath


TARGET_FORMAT = "relution-university-runtime-target"
TARGET_SCHEMA = "urn:campusweave-relution:schema:university-runtime-target:1.0.0"
INVENTORY_FORMAT = "relution-university-inventory-snapshot"
INVENTORY_SCHEMA = "urn:campusweave-relution:schema:university-inventory-snapshot:1.0.0"
UTC_TIMESTAMP = re.compile(
    r"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?Z$"
)
RELATIVE_PATH = re.compile(r"^[A-Za-z0-9._/-]+$")
PLATFORM_FAMILIES = {
    "ios_ipados",
    "macos",
    "windows",
    "android_enterprise",
}
SECRET_TEXT = re.compile(
    r"(?i)(?:bearer\s+[a-z0-9._~+/=-]+|-----BEGIN [A-Z ]+PRIVATE KEY-----|"
    r"(?:access[_ -]?token|password|client[_ -]?secret|api[_ -]?key)\s*[:=]\s*\S+)"
)
FORBIDDEN_NORMALIZED_KEYS = {
    "token",
    "accesstoken",
    "bearertoken",
    "apikey",
    "password",
    "secret",
    "clientsecret",
    "credential",
    "credentials",
    "privatekey",
    "cookie",
    "session",
    "authorization",
    "requestbody",
}
ROOT_KEYS = {
    "$schema",
    "schema_version",
    "document_type",
    "context_status",
    "sensitive_values_present",
    "execution_authorized",
    "profile",
    "target",
    "contract",
    "bindings",
    "inventory",
    "evidence_root",
    "stop_reasons",
}
INVENTORY_KEYS = {
    "$schema",
    "schema_version",
    "document_type",
    "snapshot_status",
    "sensitive_values_present",
    "profile_sha256",
    "target",
    "contract_sha256",
    "captured_at",
    "scope",
    "set_digests",
    "capture_proof",
}


def _exact_keys(
    value: Mapping[str, Any],
    expected: set[str],
    location: str,
    errors: list[str],
) -> None:
    missing = expected - set(value)
    unknown = set(value) - expected
    if missing:
        errors.append(f"{location}: missing keys: {', '.join(sorted(missing))}")
    if unknown:
        errors.append(f"{location}: unknown keys: {', '.join(sorted(unknown))}")


def _mapping(
    value: Any,
    location: str,
    errors: list[str],
) -> Mapping[str, Any] | None:
    if not isinstance(value, Mapping):
        errors.append(f"{location}: must be an object")
        return None
    return value


def _sha(value: Any, location: str, errors: list[str]) -> str | None:
    if not isinstance(value, str) or re.fullmatch(r"[0-9a-f]{64}", value) is None:
        errors.append(f"{location}: must be a lowercase SHA-256 digest")
        return None
    return value


def _relative_path(value: Any, location: str, errors: list[str]) -> str | None:
    if not isinstance(value, str) or not value or len(value) > 512:
        errors.append(f"{location}: must be a non-empty relative path of at most 512 characters")
        return None
    pure = PurePosixPath(value)
    if (
        pure.is_absolute()
        or value != pure.as_posix()
        or RELATIVE_PATH.fullmatch(value) is None
        or any(part in {"", ".", ".."} for part in pure.parts)
    ):
        errors.append(f"{location}: must be a normalized traversal-free relative path")
        return None
    return value


def _origin(value: Any, location: str, errors: list[str]) -> str | None:
    if (
        not isinstance(value, str)
        or not value
        or any(character.isspace() or ord(character) < 0x20 or ord(character) == 0x7F for character in value)
    ):
        errors.append(f"{location}: must be an HTTPS origin without whitespace or control characters")
        return None
    try:
        parsed = urlsplit(value)
        hostname = parsed.hostname
        port = parsed.port
    except ValueError:
        errors.append(f"{location}: contains an invalid host or port")
        return None
    if (
        parsed.scheme.lower() != "https"
        or not hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.path not in {"", "/"}
        or parsed.query
        or parsed.fragment
        or parsed.netloc.endswith(":")
    ):
        errors.append(
            f"{location}: must be an HTTPS origin without credentials, path, query, or fragment"
        )
        return None
    normalized_host = hostname.lower()
    try:
        address = ipaddress.ip_address(normalized_host)
    except ValueError:
        if (
            len(normalized_host) > 253
            or not all(
                re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label)
                for label in normalized_host.split(".")
            )
        ):
            errors.append(f"{location}: contains an invalid DNS hostname")
            return None
    else:
        normalized_host = address.compressed
        if address.version == 6:
            normalized_host = f"[{normalized_host}]"
    if port == 0:
        errors.append(f"{location}: port zero is not a usable HTTPS origin")
        return None
    normalized_port = "" if port in {None, 443} else f":{port}"
    return f"https://{normalized_host}{normalized_port}"


def _scan_for_secrets(value: Any, location: str, errors: list[str]) -> None:
    if isinstance(value, Mapping):
        for key, child in value.items():
            normalized = re.sub(r"[^a-z0-9]", "", str(key).lower())
            if normalized in FORBIDDEN_NORMALIZED_KEYS:
                errors.append(f"{location}.{key}: credential-bearing fields are forbidden")
            _scan_for_secrets(child, f"{location}.{key}", errors)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            _scan_for_secrets(child, f"{location}[{index}]", errors)
    elif isinstance(value, str) and SECRET_TEXT.search(value):
        errors.append(f"{location}: credential-like text is forbidden")


def _profile_binding_requirements(
    profile: Mapping[str, Any],
) -> tuple[dict[str, tuple[set[str], bool]], set[tuple[str, str]]]:
    workflows: dict[str, tuple[set[str], bool]] = {}
    required_pairs: set[tuple[str, str]] = set()
    raw_workflows = profile.get("api_workflows")
    if isinstance(raw_workflows, list):
        for item in raw_workflows:
            if not isinstance(item, Mapping) or not isinstance(item.get("workflow_id"), str):
                continue
            workflow_id = item["workflow_id"]
            roles = item.get("required_roles")
            role_set = {
                role for role in roles if isinstance(role, str)
            } if isinstance(roles, list) else set()
            workflows[workflow_id] = (
                role_set,
                item.get("organization_scope_required") is True,
            )
            concepts = item.get("concept_ids")
            if isinstance(concepts, list):
                required_pairs.update(
                    (concept, workflow_id)
                    for concept in concepts
                    if isinstance(concept, str)
                )
    raw_policies = profile.get("policy_units")
    if isinstance(raw_policies, list):
        for item in raw_policies:
            if not isinstance(item, Mapping):
                continue
            concepts = item.get("concept_ids")
            workflow_ids = item.get("workflow_ids")
            if not isinstance(concepts, list) or not isinstance(workflow_ids, list):
                continue
            required_pairs.update(
                (concept, workflow_id)
                for concept in concepts
                for workflow_id in workflow_ids
                if isinstance(concept, str)
                and isinstance(workflow_id, str)
                and workflow_id in workflows
            )
    return workflows, required_pairs


def _validate_profile_binding_coverage(
    document: Mapping[str, Any],
    profile: Mapping[str, Any],
    errors: list[str],
) -> None:
    workflows, required_pairs = _profile_binding_requirements(profile)
    records: dict[tuple[str, str], Mapping[str, Any]] = {}
    raw_records = document.get("bindings")
    if isinstance(raw_records, list):
        for item in raw_records:
            if not isinstance(item, Mapping):
                continue
            concept_id = item.get("concept_id")
            workflow_id = item.get("workflow_id")
            if isinstance(concept_id, str) and isinstance(workflow_id, str):
                records.setdefault((concept_id, workflow_id), item)

    missing = sorted(required_pairs - set(records))
    if missing:
        errors.append(
            "$.bindings.path: missing profile concept/workflow bindings: "
            + ", ".join(f"{concept}@{workflow}" for concept, workflow in missing)
        )
    unexpected = sorted(set(records) - required_pairs)
    if unexpected:
        errors.append(
            "$.bindings.path: contains bindings outside the supplied profile: "
            + ", ".join(f"{concept}@{workflow}" for concept, workflow in unexpected)
        )

    for concept_id, workflow_id in sorted(required_pairs & set(records)):
        record = records[(concept_id, workflow_id)]
        expected_roles, organization_scope_required = workflows[workflow_id]
        raw_roles = record.get("required_roles")
        declared_roles = {
            role for role in raw_roles if isinstance(role, str)
        } if isinstance(raw_roles, list) else set()
        location = f"$.bindings.path[{concept_id}@{workflow_id}]"
        if declared_roles != expected_roles:
            errors.append(
                f"{location}.required_roles: must equal the profile workflow roles "
                f"{', '.join(sorted(expected_roles))}"
            )

        raw_operations = record.get("operations")
        operations = (
            [item for item in raw_operations if isinstance(item, Mapping)]
            if isinstance(raw_operations, list)
            else []
        )
        operation_roles: set[str] = set()
        bound_keys: set[str] = set()
        for operation in operations:
            role = operation.get("role")
            if isinstance(role, str):
                operation_roles.add(role)
            operation_key = operation.get("operation_key")
            if isinstance(operation_key, str):
                bound_keys.add(operation_key)
        if operation_roles != expected_roles:
            errors.append(
                f"{location}.operations: bound role set must equal the profile workflow roles"
            )
        if organization_scope_required:
            organization_scoped_keys: set[str] = set()
            raw_scopes = record.get("scope_bindings")
            if isinstance(raw_scopes, list):
                for scope in raw_scopes:
                    if (
                        not isinstance(scope, Mapping)
                        or scope.get("scope_kind") != "organization"
                        or scope.get("source_contract_verified") is not True
                    ):
                        continue
                    operation_keys = scope.get("operation_keys")
                    if isinstance(operation_keys, list):
                        organization_scoped_keys.update(
                            key for key in operation_keys if isinstance(key, str)
                        )
            unscoped = sorted(bound_keys - organization_scoped_keys)
            if unscoped:
                errors.append(
                    f"{location}.scope_bindings: organization scope is not proven for "
                    + ", ".join(unscoped)
                )


def _validate_inventory(
    document: Any,
    *,
    profile_sha256: str,
    contract_sha256: str,
    target: Mapping[str, Any],
    captured_at: Any,
    errors: list[str],
) -> None:
    root = _mapping(document, "inventory.$", errors)
    if root is None:
        return
    _exact_keys(root, INVENTORY_KEYS, "inventory.$", errors)
    if root.get("$schema") != INVENTORY_SCHEMA:
        errors.append(f"inventory.$.$schema: must equal {INVENTORY_SCHEMA!r}")
    if root.get("schema_version") != "1.0.0":
        errors.append("inventory.$.schema_version: must equal '1.0.0'")
    if root.get("document_type") != INVENTORY_FORMAT:
        errors.append("inventory.$.document_type: is not a university inventory snapshot")
    if root.get("snapshot_status") != "complete":
        errors.append("inventory.$.snapshot_status: must equal 'complete'")
    if root.get("sensitive_values_present") is not False:
        errors.append("inventory.$.sensitive_values_present: must be false")
    if root.get("profile_sha256") != profile_sha256:
        errors.append("inventory.$.profile_sha256: does not match the bound profile")
    if root.get("contract_sha256") != contract_sha256:
        errors.append("inventory.$.contract_sha256: does not match the bound OpenAPI contract")
    timestamp = root.get("captured_at")
    if not isinstance(timestamp, str) or UTC_TIMESTAMP.fullmatch(timestamp) is None:
        errors.append("inventory.$.captured_at: must be an exact UTC timestamp ending in Z")
    if timestamp != captured_at:
        errors.append("inventory.$.captured_at: does not match the target context")

    inventory_target = _mapping(root.get("target"), "inventory.$.target", errors)
    expected_target = {
        "authorized_origin": target.get("authorized_origin"),
        "relution_version": target.get("relution_version"),
        "organization_id": target.get("organization_id"),
    }
    if inventory_target is not None:
        _exact_keys(
            inventory_target,
            {"authorized_origin", "relution_version", "organization_id"},
            "inventory.$.target",
            errors,
        )
        if dict(inventory_target) != expected_target:
            errors.append("inventory.$.target: does not match the target context")

    scope = _mapping(root.get("scope"), "inventory.$.scope", errors)
    if scope is not None:
        _exact_keys(
            scope,
            {
                "organization_id",
                "platform_families",
                "device_count",
                "group_count",
                "policy_count",
                "assignment_count",
                "membership_frozen",
            },
            "inventory.$.scope",
            errors,
        )
        if scope.get("organization_id") != target.get("organization_id"):
            errors.append("inventory.$.scope.organization_id: does not match the target context")
        platforms = scope.get("platform_families")
        if (
            not isinstance(platforms, list)
            or not platforms
            or not all(isinstance(item, str) and item in PLATFORM_FAMILIES for item in platforms)
            or len(platforms) != len(set(platforms))
        ):
            errors.append(
                "inventory.$.scope.platform_families: must be a non-empty unique supported platform list"
            )
        for field in ("device_count", "group_count", "policy_count", "assignment_count"):
            value = scope.get(field)
            if not isinstance(value, int) or isinstance(value, bool) or value < 0:
                errors.append(f"inventory.$.scope.{field}: must be a non-negative integer")
        if scope.get("membership_frozen") is not True:
            errors.append("inventory.$.scope.membership_frozen: must be true")

    set_digests = _mapping(root.get("set_digests"), "inventory.$.set_digests", errors)
    digest_keys = {
        "device_ids_sha256",
        "group_ids_sha256",
        "policy_ids_sha256",
        "assignment_ids_sha256",
    }
    if set_digests is not None:
        _exact_keys(set_digests, digest_keys, "inventory.$.set_digests", errors)
        for field in digest_keys:
            _sha(set_digests.get(field), f"inventory.$.set_digests.{field}", errors)

    proof = _mapping(root.get("capture_proof"), "inventory.$.capture_proof", errors)
    proof_keys = {
        "read_only",
        "pagination_complete",
        "reported_totals_reconciled",
        "duplicate_ids_rejected",
    }
    if proof is not None:
        _exact_keys(proof, proof_keys, "inventory.$.capture_proof", errors)
        for field in proof_keys:
            if proof.get(field) is not True:
                errors.append(f"inventory.$.capture_proof.{field}: must be true")


def _load_evidence(
    context_root: Path,
    evidence_root: str,
    relative: str,
    location: str,
    expected_sha256: Any,
    errors: list[str],
) -> tuple[Any, str, Path, bytes] | None:
    expected = _sha(expected_sha256, location, errors)
    combined = str(PurePosixPath(evidence_root) / relative)
    try:
        loaded = load_json_beneath(context_root, combined, private=True)
    except ValueError as exc:
        errors.append(str(exc))
        return None
    if expected is not None and loaded[1] != expected:
        errors.append(f"{location}: does not match {loaded[2]}")
    return loaded


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
    _exact_keys(root, ROOT_KEYS, "$", errors)
    if root.get("$schema") != TARGET_SCHEMA:
        errors.append(f"$.$schema: must equal {TARGET_SCHEMA!r}")
    if root.get("schema_version") != "1.0.0":
        errors.append("$.schema_version: must equal '1.0.0'")
    if root.get("document_type") != TARGET_FORMAT:
        errors.append("$.document_type: is not a university runtime target context")
    status = root.get("context_status")
    if status not in {"template", "evidence_bound", "stale"}:
        errors.append("$.context_status: must be template, evidence_bound, or stale")
    if status == "stale":
        errors.append("$.context_status: stale target contexts are non-operational")
    if root.get("sensitive_values_present") is not False:
        errors.append("$.sensitive_values_present: must be false")
    if root.get("execution_authorized") is not False:
        errors.append("$.execution_authorized: target context can never authorize execution")
    _scan_for_secrets(root, "$", errors)

    profile_ref = _mapping(root.get("profile"), "$.profile", errors)
    target = _mapping(root.get("target"), "$.target", errors)
    contract = _mapping(root.get("contract"), "$.contract", errors)
    bindings = _mapping(root.get("bindings"), "$.bindings", errors)
    inventory = _mapping(root.get("inventory"), "$.inventory", errors)
    profile_relative: str | None = None
    if profile_ref is not None:
        _exact_keys(profile_ref, {"path", "package_id", "sha256"}, "$.profile", errors)
        profile_relative = _relative_path(profile_ref.get("path"), "$.profile.path", errors)
        if profile_ref.get("package_id") != profile.get("package", {}).get("package_id"):
            errors.append("$.profile.package_id: does not match the supplied profile")
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
            bindings,
            {"path", "sha256", "status", "semantic_role_status"},
            "$.bindings",
            errors,
        )
    if inventory is not None:
        _exact_keys(
            inventory,
            {"path", "sha256", "captured_at", "complete_for_scope"},
            "$.inventory",
            errors,
        )
    stop_reasons = root.get("stop_reasons")
    if (
        not isinstance(stop_reasons, list)
        or not stop_reasons
        or not all(isinstance(item, str) and item for item in stop_reasons)
        or len(stop_reasons) != len(set(stop_reasons))
    ):
        errors.append("$.stop_reasons: must be a non-empty unique array of strings")

    evidence_root = _relative_path(root.get("evidence_root"), "$.evidence_root", errors)
    if status == "template":
        for section_name, section, fields in (
            ("profile", profile_ref, ("sha256",)),
            (
                "target",
                target,
                (
                    "authorized_origin",
                    "effective_api_server",
                    "relution_version",
                    "organization_id",
                    "organization_name",
                ),
            ),
            (
                "contract",
                contract,
                ("openapi_path", "openapi_sha256", "catalog_path", "catalog_sha256", "operation_count"),
            ),
            ("bindings", bindings, ("path", "sha256")),
            ("inventory", inventory, ("path", "sha256", "captured_at")),
        ):
            if section is not None:
                for field in fields:
                    if section.get(field) is not None:
                        errors.append(f"$.{section_name}.{field}: template target field must remain null")
        if contract is not None and contract.get("checked_current") is not False:
            errors.append("$.contract.checked_current: template must be false")
        if bindings is not None and bindings.get("status") != "template":
            errors.append("$.bindings.status: template context requires template bindings")
        if bindings is not None and bindings.get("semantic_role_status") != "unresolved":
            errors.append(
                "$.bindings.semantic_role_status: template context requires unresolved semantics"
            )
        if inventory is not None and inventory.get("complete_for_scope") is not False:
            errors.append("$.inventory.complete_for_scope: template must be false")
        return sorted(set(errors))

    if status != "evidence_bound":
        return sorted(set(errors))
    if evidence_root is None:
        return sorted(set(errors))

    try:
        context_root = context_path.parent.resolve(strict=True)
    except OSError as exc:
        errors.append(str(exc))
        return sorted(set(errors))
    try:
        reloaded_context, _, _, _ = load_json_beneath(
            context_root,
            context_path.name,
            private=True,
        )
        if reloaded_context != document:
            errors.append("$: context changed between the supplied and private descriptor reads")
    except ValueError as exc:
        errors.append(str(exc))

    authorized: str | None = None
    if target is not None:
        authorized = _origin(target.get("authorized_origin"), "$.target.authorized_origin", errors)
        effective = _origin(target.get("effective_api_server"), "$.target.effective_api_server", errors)
        if authorized is not None and target.get("authorized_origin") != authorized:
            errors.append("$.target.authorized_origin: must use its canonical origin form")
        if effective is not None and target.get("effective_api_server") != effective:
            errors.append("$.target.effective_api_server: must use its canonical origin form")
        if authorized is not None and effective is not None and authorized != effective:
            errors.append("$.target.effective_api_server: must equal the explicitly authorized origin")
        for field in ("relution_version", "organization_id", "organization_name"):
            value = target.get(field)
            if not isinstance(value, str) or not value or value.strip() != value:
                errors.append(f"$.target.{field}: must be an evidence-bound, trimmed string")

    profile_loaded: tuple[Any, str, Path, bytes] | None = None
    if profile_ref is not None and profile_relative is not None:
        profile_loaded = _load_evidence(
            context_root,
            evidence_root,
            profile_relative,
            "$.profile.sha256",
            profile_ref.get("sha256"),
            errors,
        )
        if profile_loaded is not None:
            loaded_profile, actual_profile_sha256, artifact_path, _ = profile_loaded
            try:
                if artifact_path != profile_path.resolve(strict=True):
                    errors.append("$.profile.path: does not resolve to the supplied profile")
            except OSError as exc:
                errors.append(f"$.profile.path: cannot resolve the supplied profile: {exc}")
            if not isinstance(loaded_profile, Mapping):
                errors.append("$.profile.path: profile JSON root must be an object")
            elif loaded_profile != profile:
                errors.append("$.profile.path: private profile snapshot differs from the supplied profile")
            if profile_sha256 is not None and profile_sha256 != actual_profile_sha256:
                errors.append("$.profile.sha256: differs from the supplied profile snapshot")

    artifact_fields: list[tuple[str, str, Mapping[str, Any] | None, str, str]] = [
        ("openapi", "contract", contract, "openapi_path", "openapi_sha256"),
        ("catalog", "contract", contract, "catalog_path", "catalog_sha256"),
        ("bindings", "bindings", bindings, "path", "sha256"),
        ("inventory", "inventory", inventory, "path", "sha256"),
    ]
    loaded: dict[str, tuple[Any, str, Path, bytes]] = {}
    for name, section_name, section, path_field, digest_field in artifact_fields:
        if section is None:
            continue
        relative = _relative_path(
            section.get(path_field),
            f"$.{section_name}.{path_field}",
            errors,
        )
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

    if contract is not None:
        if contract.get("checked_current") is not True:
            errors.append("$.contract.checked_current: must be true")
        operation_count = contract.get("operation_count")
        if not isinstance(operation_count, int) or isinstance(operation_count, bool) or operation_count < 1:
            errors.append("$.contract.operation_count: must be a positive integer")

    openapi_artifact = loaded.get("openapi")
    catalog_artifact = loaded.get("catalog")
    catalog: Mapping[str, Any] | None = None
    operations: dict[str, Mapping[str, Any]] = {}
    if openapi_artifact is not None and catalog_artifact is not None:
        openapi_document, _, openapi_path, openapi_raw = openapi_artifact
        catalog_document, _, catalog_path, _ = catalog_artifact
        if not isinstance(openapi_document, Mapping):
            errors.append("$.contract.openapi_path: OpenAPI JSON root must be an object")
        elif not isinstance(catalog_document, Mapping):
            errors.append("$.contract.catalog_path: catalog JSON root must be an object")
        else:
            catalog = catalog_document
            try:
                expected_catalog = render_relution_openapi.build_machine_catalog(
                    openapi_document,
                    openapi_raw,
                    openapi_path.name,
                )
            except (TypeError, ValueError, RecursionError) as exc:
                errors.append(f"$.contract.openapi_path: cannot render exact catalog: {exc}")
            else:
                if catalog_document != expected_catalog:
                    errors.append(
                        "$.contract.catalog_path: catalog is not the renderer's exact output for the bound OpenAPI bytes"
                    )
            machine_errors: list[str] = []
            operations = validate_machine_docs.validate_catalog(
                catalog_document,
                catalog_path,
                machine_errors,
            )
            errors.extend(machine_errors)
            if contract is not None and catalog_document.get("operation_count") != contract.get("operation_count"):
                errors.append("$.contract.operation_count: does not match the exact catalog")

    binding_artifact = loaded.get("bindings")
    if bindings is not None:
        if bindings.get("status") != "contract_bound":
            errors.append(
                "$.bindings.status: evidence-bound context requires contract_bound bindings"
            )
        if bindings.get("semantic_role_status") != "operator_asserted_unproven":
            errors.append(
                "$.bindings.semantic_role_status: evidence-bound context requires "
                "operator_asserted_unproven semantics"
            )
    if binding_artifact is not None:
        binding_document, _, binding_path, _ = binding_artifact
        if not isinstance(binding_document, Mapping):
            errors.append("$.bindings.path: bindings JSON root must be an object")
        elif catalog is None:
            errors.append("$.bindings.path: cannot validate bindings without an exact catalog")
        else:
            _scan_for_secrets(binding_document, "bindings.$", errors)
            concept_errors: list[str] = []
            concept_ids = university_profile.concept_ids_from_manifest(
                university_profile.DEFAULT_MANIFEST,
                concept_errors,
            )
            errors.extend(concept_errors)
            machine_errors = []
            validate_machine_docs.validate_bindings(
                binding_document,
                binding_path,
                machine_errors,
                concept_ids,
                catalog,
                operations,
            )
            errors.extend(machine_errors)
            if binding_document.get("binding_status") != "resolved":
                errors.append(
                    "$.bindings.path: binding document must be structurally resolved"
                )
            _validate_profile_binding_coverage(binding_document, profile, errors)
            binding_target = binding_document.get("target")
            if isinstance(binding_target, Mapping) and target is not None:
                expected_binding_target = {
                    "authorized_origin": authorized,
                    "reported_version": target.get("relution_version"),
                    "organization_id": target.get("organization_id"),
                }
                if dict(binding_target) != expected_binding_target:
                    errors.append("$.bindings.path: binding target does not match this context")
            binding_contract = binding_document.get("contract")
            if isinstance(binding_contract, Mapping) and contract is not None:
                if binding_contract.get("source_sha256") != contract.get("openapi_sha256"):
                    errors.append("$.bindings.path: binding contract digest does not match this context")
                if binding_contract.get("operation_count") != contract.get("operation_count"):
                    errors.append("$.bindings.path: binding operation count does not match this context")

    inventory_artifact = loaded.get("inventory")
    if inventory is not None:
        if inventory.get("complete_for_scope") is not True:
            errors.append("$.inventory.complete_for_scope: must be true")
        captured_at = inventory.get("captured_at")
        if not isinstance(captured_at, str) or UTC_TIMESTAMP.fullmatch(captured_at) is None:
            errors.append("$.inventory.captured_at: must be an exact UTC timestamp ending in Z")
        if inventory_artifact is not None and target is not None and contract is not None:
            inventory_document = inventory_artifact[0]
            profile_digest = profile_loaded[1] if profile_loaded is not None else ""
            contract_digest = openapi_artifact[1] if openapi_artifact is not None else ""
            _validate_inventory(
                inventory_document,
                profile_sha256=profile_digest,
                contract_sha256=contract_digest,
                target=target,
                captured_at=captured_at,
                errors=errors,
            )
    return sorted(set(errors))
