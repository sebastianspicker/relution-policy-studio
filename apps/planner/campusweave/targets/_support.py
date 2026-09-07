"""Shared target-context validation primitives."""

from __future__ import annotations

import ipaddress
import re
from pathlib import Path, PurePosixPath
from typing import Any, Mapping
from urllib.parse import urlsplit

from ..private_artifacts import load_json_beneath

TARGET_FORMAT = "relution-university-runtime-target"
TARGET_SCHEMA = "urn:campusweave-relution:schema:university-runtime-target:1.0.0"
INVENTORY_FORMAT = "relution-university-inventory-snapshot"
INVENTORY_SCHEMA = "urn:campusweave-relution:schema:university-inventory-snapshot:1.0.0"
UTC_TIMESTAMP = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?Z$")
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
    if not _valid_path_text(value):
        errors.append(f"{location}: must be a non-empty relative path of at most 512 characters")
        return None
    pure = PurePosixPath(value)
    if _invalid_path_parts(value, pure):
        errors.append(f"{location}: must be a normalized traversal-free relative path")
        return None
    return value


def _valid_path_text(value: Any) -> bool:
    return isinstance(value, str) and bool(value) and len(value) <= 512


def _invalid_path_parts(value: str, pure: PurePosixPath) -> bool:
    return (
        pure.is_absolute()
        or value != pure.as_posix()
        or RELATIVE_PATH.fullmatch(value) is None
        or any(part in {"", ".", ".."} for part in pure.parts)
    )


def _origin(value: Any, location: str, errors: list[str]) -> str | None:
    if not _valid_origin_text(value):
        errors.append(
            f"{location}: must be an HTTPS origin without whitespace or control characters"
        )
        return None
    try:
        parsed = urlsplit(value)
        hostname = parsed.hostname
        port = parsed.port
    except ValueError:
        errors.append(f"{location}: contains an invalid host or port")
        return None
    if _invalid_origin_parts(parsed, hostname):
        errors.append(
            f"{location}: must be an HTTPS origin without credentials, path, query, or fragment"
        )
        return None
    normalized_host = hostname.lower()
    try:
        address = ipaddress.ip_address(normalized_host)
    except ValueError:
        if _invalid_hostname(normalized_host):
            errors.append(f"{location}: contains an invalid DNS hostname")
            return None
    else:
        normalized_host = address.compressed
        if address.version == 6:
            normalized_host = f"[{normalized_host}]"
    normalized_port = "" if port in {None, 443} else f":{port}"
    return f"https://{normalized_host}{normalized_port}"


def _valid_origin_text(value: Any) -> bool:
    return (
        isinstance(value, str)
        and bool(value)
        and not any(
            character.isspace() or ord(character) < 0x20 or ord(character) == 0x7F
            for character in value
        )
    )


def _invalid_origin_parts(parsed: Any, hostname: str | None) -> bool:
    return any(
        (
            parsed.scheme.lower() != "https",
            not hostname,
            parsed.username is not None,
            parsed.password is not None,
            parsed.path not in {"", "/"},
            bool(parsed.query),
            bool(parsed.fragment),
            parsed.netloc.endswith(":"),
            parsed.port == 0,
        )
    )


def _invalid_hostname(hostname: str) -> bool:
    return len(hostname) > 253 or not all(
        re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label)
        for label in hostname.split(".")
    )


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
    workflows, pairs = _workflow_requirements(profile.get("api_workflows"), set())
    return workflows, _policy_requirement_pairs(profile.get("policy_units"), workflows, pairs)


def _workflow_requirements(
    raw_workflows: Any, required_pairs: set[tuple[str, str]]
) -> tuple[dict[str, tuple[set[str], bool]], set[tuple[str, str]]]:
    workflows: dict[str, tuple[set[str], bool]] = {}
    if not isinstance(raw_workflows, list):
        return workflows, required_pairs
    for item in raw_workflows:
        _add_workflow_requirement(item, workflows, required_pairs)
    return workflows, required_pairs


def _add_workflow_requirement(
    item: Any, workflows: dict[str, tuple[set[str], bool]], pairs: set[tuple[str, str]]
) -> None:
    if not isinstance(item, Mapping) or not isinstance(item.get("workflow_id"), str):
        return
    workflow_id = item["workflow_id"]
    roles = item.get("required_roles")
    role_set = (
        {role for role in roles if isinstance(role, str)} if isinstance(roles, list) else set()
    )
    workflows[workflow_id] = (role_set, item.get("organization_scope_required") is True)
    pairs.update(_workflow_concepts(item.get("concept_ids"), workflow_id))


def _workflow_concepts(concepts: Any, workflow_id: str) -> set[tuple[str, str]]:
    return {(concept, workflow_id) for concept in concepts or [] if isinstance(concept, str)}


def _policy_requirement_pairs(
    raw_policies: Any,
    workflows: Mapping[str, tuple[set[str], bool]],
    required_pairs: set[tuple[str, str]],
) -> set[tuple[str, str]]:
    if not isinstance(raw_policies, list):
        return required_pairs
    for item in raw_policies:
        if not isinstance(item, Mapping):
            continue
        concepts, workflow_ids = item.get("concept_ids"), item.get("workflow_ids")
        if not isinstance(concepts, list) or not isinstance(workflow_ids, list):
            continue
        required_pairs.update(_policy_pairs(concepts, workflow_ids, workflows))
    return required_pairs


def _policy_pairs(
    concepts: list[Any], workflow_ids: list[Any], workflows: Mapping[str, Any]
) -> set[tuple[str, str]]:
    return {
        (concept, workflow_id)
        for concept in concepts
        for workflow_id in workflow_ids
        if isinstance(concept, str) and isinstance(workflow_id, str) and workflow_id in workflows
    }


def _validate_profile_binding_coverage(
    document: Mapping[str, Any],
    profile: Mapping[str, Any],
    errors: list[str],
) -> None:
    workflows, required_pairs = _profile_binding_requirements(profile)
    records = _binding_records(document)

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
        _validate_binding_record(
            records[(concept_id, workflow_id)], concept_id, workflow_id, workflows, errors
        )


def _binding_records(document: Mapping[str, Any]) -> dict[tuple[str, str], Mapping[str, Any]]:
    raw_records = document.get("bindings")
    if not isinstance(raw_records, list):
        return {}
    return {
        (item["concept_id"], item["workflow_id"]): item
        for item in raw_records
        if isinstance(item, Mapping)
        and isinstance(item.get("concept_id"), str)
        and isinstance(item.get("workflow_id"), str)
    }


def _validate_binding_record(
    record: Mapping[str, Any],
    concept_id: str,
    workflow_id: str,
    workflows: Mapping[str, tuple[set[str], bool]],
    errors: list[str],
) -> None:
    expected_roles, organization_scope_required = workflows[workflow_id]
    location = f"$.bindings.path[{concept_id}@{workflow_id}]"
    _validate_binding_roles(record, expected_roles, location, errors)
    bound_keys = _binding_operation_keys(record, expected_roles, location, errors)
    if organization_scope_required:
        _validate_organization_scope(record, bound_keys, location, errors)


def _validate_binding_roles(
    record: Mapping[str, Any], expected: set[str], location: str, errors: list[str]
) -> None:
    raw_roles = record.get("required_roles")
    declared = (
        {role for role in raw_roles if isinstance(role, str)}
        if isinstance(raw_roles, list)
        else set()
    )
    if declared != expected:
        errors.append(
            f"{location}.required_roles: must equal the profile workflow roles {', '.join(sorted(expected))}"
        )


def _binding_operation_keys(
    record: Mapping[str, Any], expected: set[str], location: str, errors: list[str]
) -> set[str]:
    raw_operations = record.get("operations")
    operations = (
        [item for item in raw_operations if isinstance(item, Mapping)]
        if isinstance(raw_operations, list)
        else []
    )
    roles = _operation_roles(operations)
    if roles != expected:
        errors.append(
            f"{location}.operations: bound role set must equal the profile workflow roles"
        )
    return _operation_keys(operations)


def _operation_roles(operations: list[Mapping[str, Any]]) -> set[str]:
    return {item["role"] for item in operations if isinstance(item.get("role"), str)}


def _operation_keys(operations: list[Mapping[str, Any]]) -> set[str]:
    return {
        item["operation_key"] for item in operations if isinstance(item.get("operation_key"), str)
    }


def _validate_organization_scope(
    record: Mapping[str, Any], bound_keys: set[str], location: str, errors: list[str]
) -> None:
    raw_scopes = record.get("scope_bindings")
    scopes = (
        [item for item in raw_scopes if isinstance(item, Mapping)]
        if isinstance(raw_scopes, list)
        else []
    )
    proven = _proven_scope_keys(scopes)
    unscoped = sorted(bound_keys - proven)
    if unscoped:
        errors.append(
            f"{location}.scope_bindings: organization scope is not proven for "
            + ", ".join(unscoped)
        )


def _proven_scope_keys(scopes: list[Mapping[str, Any]]) -> set[str]:
    return {
        key
        for scope in scopes
        if _is_proven_scope(scope)
        for key in scope.get("operation_keys", [])
        if isinstance(key, str)
    }


def _is_proven_scope(scope: Mapping[str, Any]) -> bool:
    return (
        scope.get("scope_kind") == "organization" and scope.get("source_contract_verified") is True
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
    _validate_inventory_identity(root, profile_sha256, contract_sha256, captured_at, errors)

    _validate_inventory_target(root, target, errors)
    _validate_inventory_scope(root, target, errors)
    _validate_inventory_digests(root, errors)
    _validate_inventory_proof(root, errors)


def _validate_inventory_identity(
    root: Mapping[str, Any],
    profile_sha256: str,
    contract_sha256: str,
    captured_at: Any,
    errors: list[str],
) -> None:
    expected = (
        ("$schema", INVENTORY_SCHEMA, f"must equal {INVENTORY_SCHEMA!r}"),
        ("schema_version", "1.0.0", "must equal '1.0.0'"),
        ("document_type", INVENTORY_FORMAT, "is not a university inventory snapshot"),
        ("snapshot_status", "complete", "must equal 'complete'"),
        ("sensitive_values_present", False, "must be false"),
        ("profile_sha256", profile_sha256, "does not match the bound profile"),
        ("contract_sha256", contract_sha256, "does not match the bound OpenAPI contract"),
    )
    for field, value, message in expected:
        if root.get(field) != value:
            errors.append(f"inventory.$.{field}: {message}")
    timestamp = root.get("captured_at")
    if not isinstance(timestamp, str) or UTC_TIMESTAMP.fullmatch(timestamp) is None:
        errors.append("inventory.$.captured_at: must be an exact UTC timestamp ending in Z")
    elif timestamp != captured_at:
        errors.append("inventory.$.captured_at: does not match the target context")


def _validate_inventory_target(
    root: Mapping[str, Any], target: Mapping[str, Any], errors: list[str]
) -> None:
    inventory_target = _mapping(root.get("target"), "inventory.$.target", errors)
    if inventory_target is None:
        return
    _exact_keys(
        inventory_target,
        {"authorized_origin", "relution_version", "organization_id"},
        "inventory.$.target",
        errors,
    )
    expected = {
        key: target.get(key) for key in ("authorized_origin", "relution_version", "organization_id")
    }
    if dict(inventory_target) != expected:
        errors.append("inventory.$.target: does not match the target context")


def _validate_inventory_scope(
    root: Mapping[str, Any], target: Mapping[str, Any], errors: list[str]
) -> None:
    scope = _mapping(root.get("scope"), "inventory.$.scope", errors)
    if scope is None:
        return
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
    _validate_scope_identity(scope, target, errors)
    _validate_scope_platforms(scope, errors)
    _validate_scope_counts(scope, errors)
    if scope.get("membership_frozen") is not True:
        errors.append("inventory.$.scope.membership_frozen: must be true")


def _validate_scope_identity(
    scope: Mapping[str, Any], target: Mapping[str, Any], errors: list[str]
) -> None:
    if scope.get("organization_id") != target.get("organization_id"):
        errors.append("inventory.$.scope.organization_id: does not match the target context")


def _validate_scope_platforms(scope: Mapping[str, Any], errors: list[str]) -> None:
    platforms = scope.get("platform_families")
    valid = (
        isinstance(platforms, list)
        and bool(platforms)
        and all(isinstance(item, str) and item in PLATFORM_FAMILIES for item in platforms)
        and len(platforms) == len(set(platforms))
    )
    if not valid:
        errors.append(
            "inventory.$.scope.platform_families: must be a non-empty unique supported platform list"
        )


def _validate_scope_counts(scope: Mapping[str, Any], errors: list[str]) -> None:
    for field in ("device_count", "group_count", "policy_count", "assignment_count"):
        value = scope.get(field)
        if not isinstance(value, int) or isinstance(value, bool) or value < 0:
            errors.append(f"inventory.$.scope.{field}: must be a non-negative integer")


def _validate_inventory_digests(root: Mapping[str, Any], errors: list[str]) -> None:
    keys = {"device_ids_sha256", "group_ids_sha256", "policy_ids_sha256", "assignment_ids_sha256"}
    value = _mapping(root.get("set_digests"), "inventory.$.set_digests", errors)
    if value is None:
        return
    _exact_keys(value, keys, "inventory.$.set_digests", errors)
    for field in keys:
        _sha(value.get(field), f"inventory.$.set_digests.{field}", errors)


def _validate_inventory_proof(root: Mapping[str, Any], errors: list[str]) -> None:
    keys = {
        "read_only",
        "pagination_complete",
        "reported_totals_reconciled",
        "duplicate_ids_rejected",
    }
    value = _mapping(root.get("capture_proof"), "inventory.$.capture_proof", errors)
    if value is None:
        return
    _exact_keys(value, keys, "inventory.$.capture_proof", errors)
    for field in keys:
        if value.get(field) is not True:
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
