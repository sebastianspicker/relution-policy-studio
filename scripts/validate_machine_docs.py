#!/usr/bin/env python3
"""Validate the Relution machine-readable documentation offline.

The JSON Schemas are the portable contracts for external consumers. This
dependency-free validator enforces the cross-document and safety invariants
that JSON Schema alone cannot express: globally unique IDs, valid references,
unresolved hand-authored API bindings, digest-bound target bindings, generated
operation-key integrity, and non-executable templates.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence
from urllib.parse import urlparse


SCRIPT_ROOT = Path(__file__).resolve().parent
if str(SCRIPT_ROOT) not in sys.path:
    sys.path.insert(0, str(SCRIPT_ROOT))

from strict_json import load_strict_json  # noqa: E402


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MANIFEST = REPOSITORY_ROOT / "docs/relution/registries/manifest.json"
DEFAULT_CATALOG = REPOSITORY_ROOT / "docs/relution/generated/API_CATALOG.json"
DEFAULT_BINDINGS = REPOSITORY_ROOT / "docs/relution/templates/target-bindings.json"
DEFAULT_CHANGE_PLAN = REPOSITORY_ROOT / "docs/relution/templates/settings-change-plan.json"

SCHEMA_VERSION = "1.0.0"
CONCEPT_ID = re.compile(r"^(feature|setting|policy|group)\.[a-z0-9][a-z0-9._-]*$")
OPERATION_KEY = re.compile(r"^operation\.sha256\.[0-9a-f]{64}$")
SHA256 = re.compile(r"^[0-9a-f]{64}$")
HTTP_METHOD = re.compile(r"^[A-Z][A-Z0-9!#$%&'*+.^_`|~-]*$")
DATE = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$")
MAX_IMMEDIATE_APPROVAL_AGE = timedelta(hours=1)
MAX_APPROVAL_CLOCK_SKEW = timedelta(minutes=5)

REGISTRY_DOCUMENT_TYPES = {
    "feature_registry": "feature.",
    "setting_registry": "setting.",
    "policy_registry": "policy.",
    "group_registry": "group.",
}
EVIDENCE_CLASSES = {
    "official_documentation",
    "target_contract",
    "observed_runtime",
    "recommendation",
}
STATIC_EVIDENCE_CLASSES = {"official_documentation", "recommendation"}
RISK_TIERS = {"informational", "low", "medium", "high", "critical"}
APPROVAL_LEVELS = {
    "read_only_authorization",
    "task_specific_authorization",
    "explicit_immediate_approval",
}
ROLLBACK_STRATEGIES = {
    "not_applicable",
    "restore_captured_state",
    "restore_prior_published_version",
    "compensating_action",
    "manual_recovery",
    "irreversible",
}
RELATED_KINDS = ("features", "settings", "policies", "groups")
API_BINDING_FIELDS = (
    "operation_id",
    "method",
    "path",
    "request_schema_ref",
    "response_schema_ref",
)
OPERATION_SURFACES = {"paths", "webhooks", "callbacks"}
CLIENT_OPERATION_SURFACE = "paths"

CONCEPT_TOP_LEVEL_KEYS = {
    "$schema",
    "schema_version",
    "document_id",
    "document_type",
    "product",
    "as_of",
    "scope",
    "completeness",
    "records",
}
CONCEPT_RECORD_KEYS = {
    "id",
    "record_kind",
    "name",
    "summary",
    "capabilities",
    "prerequisites",
    "sensitive_value_classes",
    "platforms",
    "scope",
    "risk",
    "approval",
    "mutation",
    "verification",
    "rollback",
    "related_ids",
    "api_discovery",
    "evidence",
}
MANIFEST_KEYS = {
    "$schema",
    "schema_version",
    "document_id",
    "document_type",
    "product",
    "as_of",
    "purpose",
    "authority_order",
    "execution_boundary",
    "id_namespaces",
    "cross_reference_rules",
    "evidence_classes",
    "datasets",
}
PUBLIC_API_KEYS = {
    "$schema",
    "schema_version",
    "document_id",
    "document_type",
    "product",
    "as_of",
    "scope",
    "completeness",
    "superseded_for_execution_by",
    "operations",
}
PUBLIC_API_OPERATION_KEYS = {
    "id",
    "method",
    "method_status",
    "path",
    "purpose",
    "execution_status",
    "boundary",
    "related_ids",
    "target_contract_resolution",
    "evidence",
}
TARGET_BINDING_ROOT_KEYS = {
    "$schema",
    "schema_version",
    "document_type",
    "binding_status",
    "sensitive_values_present",
    "target",
    "contract",
    "bindings",
    "unresolved_concept_ids",
}
TARGET_BINDING_TARGET_KEYS = {
    "authorized_origin",
    "reported_version",
    "organization_id",
}
TARGET_BINDING_CONTRACT_KEYS = {
    "catalog_path",
    "source_sha256",
    "operation_count",
    "catalog_checked_current",
    "validated_at",
}
TARGET_BINDING_RECORD_KEYS = {
    "concept_id",
    "binding_completeness",
    "workflow_id",
    "required_roles",
    "operations",
    "scope_bindings",
    "notes",
}
TARGET_OPERATION_BINDING_KEYS = {
    "role",
    "operation_key",
    "surface",
    "method",
    "path",
    "lineage",
    "operation_id",
    "request_schema_refs",
    "response_schema_refs",
    "expected_success_statuses",
    "source_contract_verified",
}
TARGET_SCOPE_BINDING_KEYS = {
    "scope_kind",
    "location",
    "name",
    "operation_keys",
    "source_contract_verified",
}
CHANGE_PLAN_ROOT_KEYS = {
    "$schema",
    "schema_version",
    "document_type",
    "plan_status",
    "execution_authorized",
    "sensitive_values_present",
    "concept_ids",
    "target",
    "contract",
    "authorization",
    "impact",
    "resource",
    "operations",
    "change",
    "request",
    "success_assertions",
    "audit_plan",
    "rollback",
    "verification",
    "result",
    "stop_reasons",
}
CHANGE_PLAN_OPERATION_KEYS = {
    "operation_key",
    "operation_id",
    "surface",
    "method",
    "path",
    "lineage",
    "catalog_sha256",
}
ASSERTION_KEYS = {"source", "json_pointer", "operator", "expected"}
CHANGE_PLAN_TARGET_KEYS = {
    "authorized_origin",
    "effective_api_server",
    "relution_version",
    "organization_id",
    "organization_name",
}
CHANGE_PLAN_CONTRACT_KEYS = {
    "catalog_path",
    "sha256",
    "operation_count",
    "checked_current",
}
AUTHORIZATION_KEYS = {
    "request_owner",
    "operator_identity",
    "token_owner",
    "permission_scope",
    "approved_effect",
    "approved_object_count",
    "approved_at",
    "expires_at",
}
IMPACT_KEYS = {
    "tier",
    "reason",
    "externally_visible",
    "destructive_or_irreversible",
    "affects_authentication_or_access",
    "affects_multiple_organizations",
    "requires_immediate_approval",
    "requires_canary",
    "requires_second_access_path",
    "canary_scope",
    "monitoring_owner",
    "monitoring_window",
}
RESOURCE_KEYS = {"type", "stable_id", "display_name", "scope", "resolved_uniquely"}
PLAN_OPERATION_ROLES = {"read", "write", "readback", "rollback", "audit", "status"}
CHANGE_KEYS = {
    "before_fields",
    "desired_fields",
    "unchanged_invariants",
    "omitted_server_managed_fields",
    "write_only_fields",
    "destructive_sentinels_reviewed",
    "smallest_semantic_diff_confirmed",
}
REQUEST_KEYS = {
    "method",
    "path_template",
    "path_parameters",
    "query_parameters",
    "media_type",
    "request_schema_ref",
    "request_body_file",
    "expected_success_statuses",
    "concurrency_controls",
    "automatic_retry_allowed",
    "maximum_attempts",
}
ROLLBACK_KEYS = {
    "available",
    "execution_mode",
    "strategy",
    "prior_values_captured",
    "recovery_owner",
    "recovery_window",
    "irreversibility_acknowledged",
}
AUDIT_PLAN_KEYS = {
    "mode",
    "instructions",
    "required_match_fields",
    "evidence_source",
}
REQUIRED_AUDIT_MATCH_FIELDS = {
    "actor",
    "time",
    "http_method",
    "endpoint",
    "organization",
    "status",
    "object_context",
}
VERIFICATION_KEYS = {
    "documented_status_observed",
    "response_schema_valid",
    "readback_matches",
    "unchanged_invariants_match",
    "audit_entry_matches",
    "functional_check",
    "job_terminal_state",
    "per_target_results_checked",
}
RESULT_KEYS = {
    "request_transport",
    "server_acceptance",
    "readback",
    "audit",
    "overall",
    "observed_at",
    "residual_uncertainty",
}

READ_LIKE_METHODS = {"GET", "HEAD", "OPTIONS", "QUERY", "POST"}
NON_MUTATING_METHODS = {"GET", "HEAD", "OPTIONS", "TRACE", "QUERY"}
ASSERTION_SOURCES = {"response", "readback", "audit", "job_status", "functional_check"}
ASSERTION_OPERATORS = {
    "equals",
    "not_equals",
    "contains",
    "present",
    "absent",
    "in",
    "matches",
}
BINDING_ROLES = {
    "read",
    "query",
    "create",
    "update",
    "replace",
    "patch",
    "delete",
    "publish",
    "assign",
    "unassign",
    "action",
    "validate",
    "status",
    "readback",
    "rollback",
    "audit",
}
MUTATING_BINDING_ROLES = {
    "create",
    "update",
    "replace",
    "patch",
    "delete",
    "publish",
    "assign",
    "unassign",
    "action",
    "rollback",
}
READ_ONLY_BINDING_ROLES = {
    "read",
    "query",
    "validate",
    "status",
    "readback",
    "audit",
}
BINDING_ROLE_METHODS = {
    "create": {"POST", "PUT"},
    "update": {"POST", "PUT", "PATCH"},
    "replace": {"PUT"},
    "patch": {"PATCH"},
    "delete": {"DELETE"},
    "publish": {"POST", "PUT", "PATCH"},
    "assign": {"POST", "PUT", "PATCH"},
    "unassign": {"POST", "PUT", "PATCH", "DELETE"},
    "action": {"POST", "PUT", "PATCH", "DELETE"},
    "rollback": {"POST", "PUT", "PATCH", "DELETE"},
}
SCOPE_KINDS = {"system", "global_organization", "organization", "group", "user", "device"}
SCOPE_LOCATIONS = {"token", "server", "path", "query", "header", "request_body"}
RESOURCE_SCOPES = SCOPE_KINDS
FUNCTIONAL_CHECK_RESULTS = {"passed", "failed", "not_run", "not_applicable"}
AUDIT_PLAN_MODES = {"api_operation", "manual_ui"}
AUDIT_EVIDENCE_SOURCES = {"target_contract", "official_documentation"}
ROLLBACK_EXECUTION_MODES = {
    "bound_operation",
    "restore_with_write_operation",
    "manual_recovery",
    "irreversible",
}
RESULT_ENUMS = {
    "request_transport": {"not_sent", "sent", "failed", "unknown"},
    "server_acceptance": {
        "not_attempted",
        "documented_success",
        "documented_failure",
        "undocumented",
        "unknown",
    },
    "readback": {"not_attempted", "matches", "differs", "unavailable", "unknown"},
    "audit": {"not_attempted", "matching", "missing", "unavailable", "unknown"},
    "overall": {
        "not_attempted",
        "verified",
        "partially_verified",
        "not_changed",
        "rolled_back",
        "blocked",
        "outcome_unknown",
    },
}
PLAN_ROLE_BINDING_ROLES = {
    "read": {"read", "query", "validate"},
    "write": {
        "create",
        "update",
        "replace",
        "patch",
        "delete",
        "publish",
        "assign",
        "unassign",
        "action",
    },
    "readback": {"readback", "read", "query", "status"},
    "rollback": {
        "rollback",
        "create",
        "update",
        "replace",
        "patch",
        "delete",
        "publish",
        "assign",
        "unassign",
        "action",
    },
    "audit": {"audit", "read", "query"},
    "status": {"status", "read", "query"},
}


class ValidationFailure(Exception):
    """Raised for an input that cannot be loaded as a documentation object."""


def relative(path: Path) -> str:
    """Return a stable display path when the file is in the repository."""

    try:
        return str(path.resolve().relative_to(REPOSITORY_ROOT))
    except ValueError:
        return str(path)


def load_json(path: Path) -> Any:
    """Load one UTF-8 JSON document with precise diagnostics."""

    try:
        value, _ = load_strict_json(path)
        return value
    except ValueError as error:
        raise ValidationFailure(str(error)) from error


def nested_references(value: Any) -> Iterable[str]:
    """Yield every JSON Schema ``$ref`` string from a document."""

    if isinstance(value, Mapping):
        reference = value.get("$ref")
        if isinstance(reference, str):
            yield reference
        for child in value.values():
            yield from nested_references(child)
    elif isinstance(value, list):
        for child in value:
            yield from nested_references(child)


def pointer_exists(document: Any, fragment: str) -> bool:
    """Return whether an RFC 6901 fragment selects a value."""

    if not fragment:
        return True
    if not fragment.startswith("/"):
        return False
    current = document
    for raw_token in fragment[1:].split("/"):
        token = raw_token.replace("~1", "/").replace("~0", "~")
        if isinstance(current, Mapping) and token in current:
            current = current[token]
        elif isinstance(current, list) and token.isdigit() and int(token) < len(current):
            current = current[int(token)]
        else:
            return False
    return True


def validate_schema_references(schema_directory: Path, errors: list[str]) -> None:
    """Validate that every local schema reference has a real document/fragment."""

    documents: dict[Path, Any] = {}
    identifiers: dict[str, Path] = {}
    try:
        schema_paths = sorted(schema_directory.glob("*.json"))
    except OSError as failure:
        errors.append(f"{relative(schema_directory)}: cannot enumerate schemas: {failure}")
        return
    for schema_path in schema_paths:
        try:
            document = load_json(schema_path)
        except ValidationFailure as failure:
            errors.append(str(failure))
            continue
        documents[schema_path.resolve()] = document
        if isinstance(document, Mapping) and isinstance(document.get("$id"), str):
            schema_id = document["$id"]
            if schema_id in identifiers:
                error(errors, schema_path, "$.$id", f"duplicates schema ID {schema_id!r}")
            else:
                identifiers[schema_id] = schema_path.resolve()
    for schema_path, document in documents.items():
        for reference in nested_references(document):
            document_part, separator, fragment = reference.partition("#")
            if not document_part:
                target_path = schema_path
            elif urlparse(document_part).scheme:
                target_path = identifiers.get(document_part)
                if target_path is None:
                    error(
                        errors,
                        schema_path,
                        "$ref",
                        f"unresolved schema document {document_part!r}",
                    )
                    continue
            else:
                target_path = (schema_path.parent / document_part).resolve()
            target = documents.get(target_path)
            if target is None:
                error(
                    errors,
                    schema_path,
                    "$ref",
                    f"unresolved local schema document {document_part!r}",
                )
                continue
            if separator and not pointer_exists(target, fragment):
                error(
                    errors,
                    schema_path,
                    "$ref",
                    f"unresolved schema fragment {reference!r}",
                )


def error(errors: list[str], path: Path, location: str, message: str) -> None:
    errors.append(f"{relative(path)}:{location}: {message}")


def expect_mapping(
    value: Any, errors: list[str], path: Path, location: str
) -> Mapping[str, Any] | None:
    if not isinstance(value, Mapping):
        error(errors, path, location, "must be an object")
        return None
    return value


def expect_list(
    value: Any, errors: list[str], path: Path, location: str
) -> list[Any] | None:
    if not isinstance(value, list):
        error(errors, path, location, "must be an array")
        return None
    return value


def require_exact_keys(
    value: Mapping[str, Any],
    required: set[str],
    errors: list[str],
    path: Path,
    location: str,
) -> None:
    missing = sorted(required - set(value))
    unknown = sorted(set(value) - required)
    if missing:
        error(errors, path, location, f"missing keys: {', '.join(missing)}")
    if unknown:
        error(errors, path, location, f"unknown keys: {', '.join(unknown)}")


def validate_string_array(
    value: Any,
    errors: list[str],
    path: Path,
    location: str,
    *,
    nonempty: bool = False,
) -> list[str]:
    values = expect_list(value, errors, path, location)
    if values is None:
        return []
    if nonempty and not values:
        error(errors, path, location, "must not be empty")
    strings: list[str] = []
    for index, item in enumerate(values):
        if not isinstance(item, str) or not item:
            error(errors, path, f"{location}[{index}]", "must be a non-empty string")
        else:
            strings.append(item)
    duplicates = sorted({item for item in strings if strings.count(item) > 1})
    if duplicates:
        error(errors, path, location, f"duplicate values: {', '.join(duplicates)}")
    return strings


def parse_timestamp(
    value: Any,
    errors: list[str],
    path: Path,
    location: str,
) -> datetime | None:
    """Parse one timezone-aware ISO-8601 timestamp."""

    if not isinstance(value, str) or not value:
        error(errors, path, location, "must be a non-empty ISO-8601 timestamp")
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        error(errors, path, location, "must be a valid ISO-8601 timestamp")
        return None
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        error(errors, path, location, "must include a timezone offset")
        return None
    return parsed.astimezone(timezone.utc)


def validate_https_url(
    value: Any,
    errors: list[str],
    path: Path,
    location: str,
    *,
    origin_only: bool,
) -> tuple[str, str, int] | None:
    """Validate a credential-free HTTPS URL and return its normalized origin."""

    if not isinstance(value, str) or not value:
        error(errors, path, location, "must be a non-empty HTTPS URL")
        return None
    parsed = urlparse(value)
    if parsed.scheme.lower() != "https" or not parsed.hostname:
        error(errors, path, location, "must be an absolute HTTPS URL")
        return None
    if parsed.username is not None or parsed.password is not None:
        error(errors, path, location, "must not contain URL credentials")
    if parsed.query or parsed.fragment or parsed.params:
        error(errors, path, location, "must not contain query, fragment, or parameters")
    if origin_only and parsed.path not in {"", "/"}:
        error(errors, path, location, "must be an origin without a path")
    try:
        port = parsed.port or 443
    except ValueError:
        error(errors, path, location, "contains an invalid port")
        return None
    return ("https", parsed.hostname.lower(), port)


def validate_catalog_freshness(
    catalog: Mapping[str, Any],
    catalog_path: Path,
    spec_path: Path | None,
    errors: list[str],
) -> None:
    """Prove that a generated catalog is the exact output for its raw contract."""

    if catalog.get("status") != "generated":
        return
    if spec_path is None:
        error(
            errors,
            catalog_path,
            "$.status",
            "generated catalog validation requires --spec for freshness proof",
        )
        return
    renderer_path = REPOSITORY_ROOT / "scripts/render_relution_openapi.py"
    module_name = "_relution_openapi_renderer_for_validation"
    module_spec = importlib.util.spec_from_file_location(module_name, renderer_path)
    if module_spec is None or module_spec.loader is None:
        error(errors, catalog_path, "$", "cannot load the OpenAPI catalog renderer")
        return
    renderer = importlib.util.module_from_spec(module_spec)
    sys.modules[module_name] = renderer
    try:
        module_spec.loader.exec_module(renderer)
        source, raw = renderer.load_spec(spec_path)
        expected = renderer.build_machine_catalog(source, raw, spec_path.name)
    except (OSError, ValueError) as failure:
        error(errors, spec_path, "$", f"cannot prove catalog freshness: {failure}")
        return
    finally:
        sys.modules.pop(module_name, None)
    expected_digest = expected.get("source", {}).get("sha256")
    actual_digest = catalog_digest(catalog)
    if actual_digest != expected_digest:
        error(
            errors,
            catalog_path,
            "$.source.sha256",
            "does not match the raw --spec bytes",
        )
    if catalog != expected:
        error(
            errors,
            catalog_path,
            "$",
            "generated catalog is stale or is not the renderer's exact output for --spec",
        )


def validate_concept_registry(
    document: Any,
    path: Path,
    errors: list[str],
) -> tuple[dict[str, tuple[Path, Mapping[str, Any]]], dict[str, list[str]]]:
    """Validate one stable concept registry and return IDs plus references."""

    root = expect_mapping(document, errors, path, "$")
    if root is None:
        return {}, {}
    require_exact_keys(root, CONCEPT_TOP_LEVEL_KEYS, errors, path, "$")
    if root.get("schema_version") != SCHEMA_VERSION:
        error(errors, path, "$.schema_version", f"must equal {SCHEMA_VERSION!r}")
    if root.get("product") != "Relution MDM":
        error(errors, path, "$.product", "must equal 'Relution MDM'")
    if not isinstance(root.get("as_of"), str) or not DATE.fullmatch(root["as_of"]):
        error(errors, path, "$.as_of", "must use YYYY-MM-DD")

    document_type = root.get("document_type")
    prefix = (
        REGISTRY_DOCUMENT_TYPES.get(document_type)
        if isinstance(document_type, str)
        else None
    )
    if prefix is None:
        error(errors, path, "$.document_type", "is not a supported concept registry type")
        prefix = ""
    document_id = root.get("document_id")
    expected_document_id = (
        "relution." + document_type.removesuffix("_registry").replace("setting", "settings")
        if isinstance(document_type, str)
        else None
    )
    expected_ids = {
        "feature_registry": "relution.features",
        "setting_registry": "relution.settings",
        "policy_registry": "relution.policies",
        "group_registry": "relution.groups",
    }
    if document_type in expected_ids and document_id != expected_ids[document_type]:
        error(
            errors,
            path,
            "$.document_id",
            f"must equal {expected_ids[document_type]!r}",
        )
    del expected_document_id

    scope = expect_mapping(root.get("scope"), errors, path, "$.scope")
    if scope is not None:
        if not isinstance(scope.get("intended_use"), str) or not scope["intended_use"]:
            error(errors, path, "$.scope.intended_use", "must be a non-empty string")
        validate_string_array(
            scope.get("not_authoritative_for"),
            errors,
            path,
            "$.scope.not_authoritative_for",
            nonempty=True,
        )
    completeness = expect_mapping(
        root.get("completeness"), errors, path, "$.completeness"
    )
    if completeness is not None:
        if completeness.get("level") != "stable_capability_map":
            error(
                errors,
                path,
                "$.completeness.level",
                "must equal 'stable_capability_map'",
            )
        for field in ("coverage_basis", "contract_boundary"):
            if not isinstance(completeness.get(field), str) or not completeness[field]:
                error(errors, path, f"$.completeness.{field}", "must be non-empty")
        validate_string_array(
            completeness.get("known_exclusions"),
            errors,
            path,
            "$.completeness.known_exclusions",
        )

    records = expect_list(root.get("records"), errors, path, "$.records")
    if records is None:
        return {}, {}
    if not records:
        error(errors, path, "$.records", "must contain at least one record")

    ids: dict[str, tuple[Path, Mapping[str, Any]]] = {}
    references: dict[str, list[str]] = {}
    for index, raw_record in enumerate(records):
        location = f"$.records[{index}]"
        record = expect_mapping(raw_record, errors, path, location)
        if record is None:
            continue
        require_exact_keys(record, CONCEPT_RECORD_KEYS, errors, path, location)
        concept_id = record.get("id")
        if not isinstance(concept_id, str) or not CONCEPT_ID.fullmatch(concept_id):
            error(errors, path, f"{location}.id", "must be a valid concept ID")
            concept_id = f"<invalid:{index}>"
        elif prefix and not concept_id.startswith(prefix):
            error(errors, path, f"{location}.id", f"must start with {prefix!r}")
        elif concept_id in ids:
            error(errors, path, f"{location}.id", f"duplicate ID {concept_id!r}")
        else:
            ids[concept_id] = (path, record)

        for field in ("record_kind", "name", "summary"):
            if not isinstance(record.get(field), str) or not record[field]:
                error(errors, path, f"{location}.{field}", "must be non-empty")
        validate_string_array(
            record.get("capabilities"), errors, path, f"{location}.capabilities", nonempty=True
        )
        for field in ("prerequisites", "sensitive_value_classes"):
            validate_string_array(record.get(field), errors, path, f"{location}.{field}")
        validate_string_array(
            record.get("platforms"), errors, path, f"{location}.platforms", nonempty=True
        )

        risk = expect_mapping(record.get("risk"), errors, path, f"{location}.risk")
        if risk is not None:
            if risk.get("tier") not in RISK_TIERS:
                error(errors, path, f"{location}.risk.tier", "has an invalid risk tier")
            validate_string_array(
                risk.get("reasons"), errors, path, f"{location}.risk.reasons"
            )
            if not isinstance(risk.get("blast_radius"), str) or not risk["blast_radius"]:
                error(errors, path, f"{location}.risk.blast_radius", "must be non-empty")
        approval = expect_mapping(
            record.get("approval"), errors, path, f"{location}.approval"
        )
        if approval is not None:
            if approval.get("level") not in APPROVAL_LEVELS:
                error(errors, path, f"{location}.approval.level", "has an invalid level")
            validate_string_array(
                approval.get("required_for"),
                errors,
                path,
                f"{location}.approval.required_for",
            )
        rollback = expect_mapping(
            record.get("rollback"), errors, path, f"{location}.rollback"
        )
        if rollback is not None and rollback.get("strategy") not in ROLLBACK_STRATEGIES:
            error(errors, path, f"{location}.rollback.strategy", "has an invalid strategy")

        related = expect_mapping(
            record.get("related_ids"), errors, path, f"{location}.related_ids"
        )
        record_refs: list[str] = []
        if related is not None:
            require_exact_keys(related, set(RELATED_KINDS), errors, path, f"{location}.related_ids")
            for kind in RELATED_KINDS:
                refs = validate_string_array(
                    related.get(kind),
                    errors,
                    path,
                    f"{location}.related_ids.{kind}",
                )
                record_refs.extend(refs)
        references[concept_id] = record_refs

        discovery = expect_mapping(
            record.get("api_discovery"), errors, path, f"{location}.api_discovery"
        )
        if discovery is not None:
            if discovery.get("binding_status") != "target_contract_required":
                error(
                    errors,
                    path,
                    f"{location}.api_discovery.binding_status",
                    "must remain 'target_contract_required' in a concept registry",
                )
            for field in API_BINDING_FIELDS:
                if discovery.get(field) is not None:
                    error(
                        errors,
                        path,
                        f"{location}.api_discovery.{field}",
                        "must be null; concrete bindings belong in a digest-bound target file",
                    )
            validate_string_array(
                discovery.get("tags"), errors, path, f"{location}.api_discovery.tags"
            )
            validate_string_array(
                discovery.get("search_terms"),
                errors,
                path,
                f"{location}.api_discovery.search_terms",
            )
            validate_string_array(
                discovery.get("contract_checks"),
                errors,
                path,
                f"{location}.api_discovery.contract_checks",
                nonempty=True,
            )

        evidence_items = expect_list(
            record.get("evidence"), errors, path, f"{location}.evidence"
        )
        if evidence_items is not None:
            if not evidence_items:
                error(errors, path, f"{location}.evidence", "must not be empty")
            for evidence_index, raw_evidence in enumerate(evidence_items):
                evidence_location = f"{location}.evidence[{evidence_index}]"
                evidence = expect_mapping(
                    raw_evidence, errors, path, evidence_location
                )
                if evidence is None:
                    continue
                evidence_class = evidence.get("class")
                if evidence_class not in EVIDENCE_CLASSES:
                    error(errors, path, f"{evidence_location}.class", "is invalid")
                elif evidence_class not in STATIC_EVIDENCE_CLASSES:
                    error(
                        errors,
                        path,
                        f"{evidence_location}.class",
                        "target/runtime evidence is forbidden in static concept registries",
                    )
                url = evidence.get("url")
                if not isinstance(url, str) or urlparse(url).scheme != "https":
                    error(errors, path, f"{evidence_location}.url", "must be an HTTPS URL")
                elif evidence_class == "official_documentation" and urlparse(url).hostname != "hub.relution.io":
                    error(
                        errors,
                        path,
                        f"{evidence_location}.url",
                        "official Relution evidence must use hub.relution.io",
                    )
                if not isinstance(evidence.get("claim"), str) or not evidence["claim"]:
                    error(errors, path, f"{evidence_location}.claim", "must be non-empty")
                accessed = evidence.get("accessed_at")
                if not isinstance(accessed, str) or not DATE.fullmatch(accessed):
                    error(
                        errors,
                        path,
                        f"{evidence_location}.accessed_at",
                        "must use YYYY-MM-DD",
                    )
    return ids, references


def operation_key(operation: Mapping[str, Any]) -> str | None:
    """Recompute the renderer's stable operation key."""

    fields = (
        operation.get("surface"),
        operation.get("source_location"),
        operation.get("lineage") or "",
        operation.get("method"),
        operation.get("path"),
    )
    if not all(isinstance(item, str) for item in fields):
        return None
    raw = json.dumps(
        list(fields), ensure_ascii=False, separators=(",", ":")
    ).encode("utf-8")
    return "operation.sha256." + hashlib.sha256(raw).hexdigest()


def validate_catalog(
    document: Any, path: Path, errors: list[str]
) -> dict[str, Mapping[str, Any]]:
    """Validate a generated or fail-closed placeholder operation catalog."""

    root = expect_mapping(document, errors, path, "$")
    if root is None:
        return {}
    if root.get("document_type") != "relution_openapi_operation_catalog":
        error(errors, path, "$.document_type", "is not a Relution operation catalog")
    if root.get("schema_version") != SCHEMA_VERSION:
        error(errors, path, "$.schema_version", f"must equal {SCHEMA_VERSION!r}")
    status = root.get("status")
    if status not in {"generated", "not_generated"}:
        error(errors, path, "$.status", "must be 'generated' or 'not_generated'")

    operations = expect_list(root.get("operations"), errors, path, "$.operations") or []
    operation_count = root.get("operation_count")
    if not isinstance(operation_count, int) or isinstance(operation_count, bool):
        error(errors, path, "$.operation_count", "must be an integer")
    elif operation_count != len(operations):
        error(
            errors,
            path,
            "$.operation_count",
            f"declares {operation_count}, but operations has {len(operations)} entries",
        )

    source = expect_mapping(root.get("source"), errors, path, "$.source")
    digest: Any = source.get("sha256") if source is not None else None
    if status == "not_generated":
        if operations:
            error(errors, path, "$.operations", "must be empty while status is not_generated")
        if operation_count != 0:
            error(errors, path, "$.operation_count", "must be zero while not_generated")
        if digest is not None:
            error(errors, path, "$.source.sha256", "must be null while not_generated")
    elif not isinstance(digest, str) or not SHA256.fullmatch(digest):
        error(errors, path, "$.source.sha256", "must be a lowercase SHA-256 digest")

    indexed: dict[str, Mapping[str, Any]] = {}
    for index, raw_operation in enumerate(operations):
        location = f"$.operations[{index}]"
        operation = expect_mapping(raw_operation, errors, path, location)
        if operation is None:
            continue
        key = operation.get("key")
        if not isinstance(key, str) or not OPERATION_KEY.fullmatch(key):
            error(errors, path, f"{location}.key", "must be a generated operation key")
            continue
        if key in indexed:
            error(errors, path, f"{location}.key", f"duplicate operation key {key}")
        expected_key = operation_key(operation)
        if expected_key is None:
            error(
                errors,
                path,
                location,
                "surface, source_location, lineage, method, and path must be typed strings/null",
            )
        elif key != expected_key:
            error(errors, path, f"{location}.key", "does not match operation identity fields")
        surface = operation.get("surface")
        if surface not in OPERATION_SURFACES:
            error(errors, path, f"{location}.surface", "is not a supported surface")
        method = operation.get("method")
        if not isinstance(method, str) or not HTTP_METHOD.fullmatch(method):
            error(errors, path, f"{location}.method", "must be an uppercase HTTP token")
        if not isinstance(operation.get("path"), str) or not operation["path"]:
            error(errors, path, f"{location}.path", "must be non-empty")
        indexed[key] = operation

    contract = expect_mapping(root.get("contract"), errors, path, "$.contract")
    if contract is not None:
        counts = expect_mapping(contract.get("counts"), errors, path, "$.contract.counts")
        if counts is not None and counts.get("operations") != len(operations):
            error(
                errors,
                path,
                "$.contract.counts.operations",
                "must equal the operations array length",
            )
    return indexed


def validate_public_api_registry(
    document: Any,
    path: Path,
    errors: list[str],
    concept_ids: set[str],
) -> None:
    """Validate the non-exhaustive, non-executable public API example set."""

    root = expect_mapping(document, errors, path, "$")
    if root is None:
        return
    require_exact_keys(root, PUBLIC_API_KEYS, errors, path, "$")
    if root.get("schema_version") != SCHEMA_VERSION:
        error(errors, path, "$.schema_version", f"must equal {SCHEMA_VERSION!r}")
    if root.get("product") != "Relution MDM":
        error(errors, path, "$.product", "must equal 'Relution MDM'")
    if root.get("superseded_for_execution_by") != "../generated/API_CATALOG.json":
        error(
            errors,
            path,
            "$.superseded_for_execution_by",
            "must point to ../generated/API_CATALOG.json",
        )
    operations = expect_list(root.get("operations"), errors, path, "$.operations")
    if operations is None:
        return
    if not operations:
        error(errors, path, "$.operations", "must not be empty")
    seen_ids: set[str] = set()
    seen_wire_identities: set[tuple[str | None, str]] = set()
    for index, raw_operation in enumerate(operations):
        location = f"$.operations[{index}]"
        operation = expect_mapping(raw_operation, errors, path, location)
        if operation is None:
            continue
        require_exact_keys(
            operation, PUBLIC_API_OPERATION_KEYS, errors, path, location
        )
        operation_id = operation.get("id")
        if not isinstance(operation_id, str) or not operation_id:
            error(errors, path, f"{location}.id", "must be non-empty")
        elif operation_id in seen_ids:
            error(errors, path, f"{location}.id", "must be unique")
        else:
            seen_ids.add(operation_id)
        method = operation.get("method")
        if method is not None and (
            not isinstance(method, str) or not HTTP_METHOD.fullmatch(method)
        ):
            error(errors, path, f"{location}.method", "must be null or an uppercase HTTP token")
        method_status = operation.get("method_status")
        if method is None and method_status != "target_contract_required":
            error(
                errors,
                path,
                f"{location}.method_status",
                "must be target_contract_required when method is null",
            )
        if method is not None and method_status not in {
            "official_documentation",
            "officially_documented",
        }:
            error(
                errors,
                path,
                f"{location}.method_status",
                "must classify the method as officially documented",
            )
        operation_path = operation.get("path")
        if not isinstance(operation_path, str) or not operation_path.startswith("/api/"):
            error(errors, path, f"{location}.path", "must be an absolute /api/ path")
            operation_path = "<invalid>"
        identity = (method if isinstance(method, str) else None, operation_path)
        if identity in seen_wire_identities:
            error(errors, path, location, "duplicates a method/path example")
        seen_wire_identities.add(identity)
        if operation.get("execution_status") not in {
            "target_contract_required",
            "example_only_target_contract_required",
        }:
            error(
                errors,
                path,
                f"{location}.execution_status",
                "must remain non-executable until target-contract resolution",
            )
        for field in ("purpose", "boundary"):
            if not isinstance(operation.get(field), str) or not operation[field]:
                error(errors, path, f"{location}.{field}", "must be non-empty")
        for related_id in validate_string_array(
            operation.get("related_ids"),
            errors,
            path,
            f"{location}.related_ids",
        ):
            if related_id not in concept_ids:
                error(
                    errors,
                    path,
                    f"{location}.related_ids",
                    f"unknown concept ID {related_id!r}",
                )
        validate_string_array(
            operation.get("target_contract_resolution"),
            errors,
            path,
            f"{location}.target_contract_resolution",
            nonempty=True,
        )
        evidence = expect_list(
            operation.get("evidence"), errors, path, f"{location}.evidence"
        ) or []
        if not evidence:
            error(errors, path, f"{location}.evidence", "must not be empty")
        for evidence_index, raw_evidence in enumerate(evidence):
            evidence_location = f"{location}.evidence[{evidence_index}]"
            item = expect_mapping(raw_evidence, errors, path, evidence_location)
            if item is None:
                continue
            if item.get("class") != "official_documentation":
                error(
                    errors,
                    path,
                    f"{evidence_location}.class",
                    "must be official_documentation",
                )
            url = item.get("url")
            parsed_url = urlparse(url) if isinstance(url, str) else None
            if (
                parsed_url is None
                or parsed_url.scheme != "https"
                or parsed_url.hostname != "hub.relution.io"
            ):
                error(
                    errors,
                    path,
                    f"{evidence_location}.url",
                    "must use HTTPS official hub.relution.io evidence",
                )


def schema_refs(value: Any) -> set[str]:
    """Collect reference strings from a generated operation summary."""

    found: set[str] = set()
    if isinstance(value, Mapping):
        for key, child in value.items():
            if key in {"ref", "$ref"} and isinstance(child, str):
                found.add(child)
            found.update(schema_refs(child))
    elif isinstance(value, list):
        for child in value:
            found.update(schema_refs(child))
    return found


def request_body_media_types(value: Any) -> set[str]:
    """Collect effective media types from a generated request-body summary."""

    if not isinstance(value, Mapping):
        return set()
    media_types: set[str] = set()
    content = value.get("content")
    if isinstance(content, list):
        for item in content:
            if isinstance(item, Mapping) and isinstance(item.get("media_type"), str):
                media_types.add(item["media_type"])
    consumes = value.get("consumes")
    if isinstance(consumes, list):
        media_types.update(item for item in consumes if isinstance(item, str))
    return media_types


def validate_operation_reference(
    reference: Any,
    *,
    path: Path,
    location: str,
    errors: list[str],
    catalog_digest: str | None,
    operations: Mapping[str, Mapping[str, Any]],
    digest_field: str | None,
    required_identity: bool = True,
    allowed_surfaces: set[str] | None = None,
) -> Mapping[str, Any] | None:
    ref = expect_mapping(reference, errors, path, location)
    if ref is None:
        return None
    identity_fields = (
        "operation_key",
        "surface",
        "method",
        "path",
        "lineage",
        "operation_id",
    )
    if required_identity:
        for field in identity_fields:
            if field not in ref:
                error(errors, path, f"{location}.{field}", "is required")
    if digest_field is not None and digest_field not in ref:
        error(errors, path, f"{location}.{digest_field}", "is required")
    surface = ref.get("surface")
    if allowed_surfaces is not None and surface not in allowed_surfaces:
        error(
            errors,
            path,
            f"{location}.surface",
            "may reference only top-level path operations",
        )
    key = ref.get("operation_key")
    if not isinstance(key, str) or key not in operations:
        error(errors, path, f"{location}.operation_key", "does not exist in the catalog")
        return None
    operation = operations[key]
    if digest_field is not None:
        supplied_digest = ref.get(digest_field)
        if supplied_digest != catalog_digest:
            error(
                errors,
                path,
                f"{location}.{digest_field}",
                "does not match catalog digest",
            )
    for field, operation_field in (
        ("surface", "surface"),
        ("method", "method"),
        ("path", "path"),
        ("lineage", "lineage"),
        ("operation_id", "operation_id"),
    ):
        if ref.get(field) != operation.get(operation_field):
            error(errors, path, f"{location}.{field}", "does not match catalog operation")
    return operation


def catalog_digest(catalog: Mapping[str, Any]) -> str | None:
    source = catalog.get("source")
    if not isinstance(source, Mapping):
        return None
    value = source.get("sha256")
    return value if isinstance(value, str) else None


def validate_bindings(
    document: Any,
    path: Path,
    errors: list[str],
    concept_ids: set[str],
    catalog: Mapping[str, Any],
    operations: Mapping[str, Mapping[str, Any]],
) -> None:
    root = expect_mapping(document, errors, path, "$")
    if root is None:
        return
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
    target = expect_mapping(root.get("target"), errors, path, "$.target")
    if target is not None:
        require_exact_keys(target, TARGET_BINDING_TARGET_KEYS, errors, path, "$.target")
    contract = expect_mapping(root.get("contract"), errors, path, "$.contract")
    if contract is not None:
        require_exact_keys(
            contract, TARGET_BINDING_CONTRACT_KEYS, errors, path, "$.contract"
        )
    bindings = expect_list(root.get("bindings"), errors, path, "$.bindings") or []
    unresolved = validate_string_array(
        root.get("unresolved_concept_ids"),
        errors,
        path,
        "$.unresolved_concept_ids",
    )
    for concept_id in unresolved:
        if concept_id not in concept_ids:
            error(errors, path, "$.unresolved_concept_ids", f"unknown ID {concept_id!r}")
    if status == "template":
        if bindings:
            error(errors, path, "$.bindings", "template bindings must be empty")
        return
    if status == "stale":
        error(
            errors,
            path,
            "$.binding_status",
            "stale bindings are non-operational; regenerate and re-resolve them",
        )
    if status in {"partial", "resolved"} and not bindings:
        error(errors, path, "$.bindings", "must not be empty for operational bindings")
    if target is not None:
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
    if catalog.get("status") != "generated":
        error(errors, path, "$.binding_status", "requires a generated target catalog")
    digest = catalog_digest(catalog)
    if contract is not None:
        if contract.get("source_sha256") != digest:
            error(errors, path, "$.contract.source_sha256", "does not match catalog digest")
        if contract.get("operation_count") != catalog.get("operation_count"):
            error(errors, path, "$.contract.operation_count", "does not match catalog")
        if status in {"partial", "resolved"} and contract.get("catalog_checked_current") is not True:
            error(errors, path, "$.contract.catalog_checked_current", "must be true")
        if not isinstance(contract.get("catalog_path"), str) or not contract["catalog_path"]:
            error(errors, path, "$.contract.catalog_path", "must be non-empty")
        if status in {"partial", "resolved"}:
            parse_timestamp(contract.get("validated_at"), errors, path, "$.contract.validated_at")

    seen_binding_keys: set[tuple[str, str | None]] = set()
    for index, raw_binding in enumerate(bindings):
        location = f"$.bindings[{index}]"
        binding = expect_mapping(raw_binding, errors, path, location)
        if binding is None:
            continue
        require_exact_keys(
            binding, TARGET_BINDING_RECORD_KEYS, errors, path, location
        )
        concept_id = binding.get("concept_id")
        workflow_id = binding.get("workflow_id")
        binding_key = (
            concept_id if isinstance(concept_id, str) else "",
            workflow_id if isinstance(workflow_id, str) else None,
        )
        if concept_id not in concept_ids:
            error(errors, path, f"{location}.concept_id", f"unknown ID {concept_id!r}")
        elif binding_key in seen_binding_keys:
            error(
                errors,
                path,
                location,
                "duplicate concept/workflow binding",
            )
        else:
            seen_binding_keys.add(binding_key)
        if concept_id in unresolved:
            error(
                errors,
                path,
                f"{location}.concept_id",
                "cannot be both bound and unresolved",
            )
        completeness = binding.get("binding_completeness")
        if completeness not in {"partial", "complete_for_requested_workflow"}:
            error(errors, path, f"{location}.binding_completeness", "is invalid")
        if workflow_id is not None and (
            not isinstance(workflow_id, str) or not workflow_id
        ):
            error(errors, path, f"{location}.workflow_id", "must be a non-empty string or null")
        required_roles = validate_string_array(
            binding.get("required_roles"),
            errors,
            path,
            f"{location}.required_roles",
        )
        for required_role in required_roles:
            if required_role not in BINDING_ROLES:
                error(
                    errors,
                    path,
                    f"{location}.required_roles",
                    f"invalid role {required_role!r}",
                )
        if completeness == "complete_for_requested_workflow":
            if not isinstance(workflow_id, str) or not workflow_id:
                error(
                    errors,
                    path,
                    f"{location}.workflow_id",
                    "is required for a complete workflow binding",
                )
            if not required_roles:
                error(
                    errors,
                    path,
                    f"{location}.required_roles",
                    "must declare the complete workflow role set",
                )
        if status == "resolved" and completeness != "complete_for_requested_workflow":
            error(
                errors,
                path,
                f"{location}.binding_completeness",
                "must be complete_for_requested_workflow when resolved",
            )
        validate_string_array(
            binding.get("notes"), errors, path, f"{location}.notes"
        )
        operation_bindings = expect_list(
            binding.get("operations"), errors, path, f"{location}.operations"
        ) or []
        if not operation_bindings:
            error(errors, path, f"{location}.operations", "must not be empty")
        bound_keys: set[str] = set()
        bound_roles: set[str] = set()
        seen_operation_roles: set[tuple[str, str]] = set()
        roles_by_operation_key: dict[str, set[str]] = {}
        for operation_index, raw_ref in enumerate(operation_bindings):
            ref_location = f"{location}.operations[{operation_index}]"
            ref = expect_mapping(raw_ref, errors, path, ref_location)
            if ref is None:
                continue
            require_exact_keys(
                ref, TARGET_OPERATION_BINDING_KEYS, errors, path, ref_location
            )
            if ref.get("role") not in BINDING_ROLES:
                error(errors, path, f"{ref_location}.role", "is invalid")
            elif isinstance(ref.get("role"), str):
                bound_roles.add(ref["role"])
            operation = validate_operation_reference(
                ref,
                path=path,
                location=ref_location,
                errors=errors,
                catalog_digest=digest,
                operations=operations,
                digest_field=None,
                allowed_surfaces={CLIENT_OPERATION_SURFACE},
            )
            if ref.get("source_contract_verified") is not True:
                error(
                    errors,
                    path,
                    f"{ref_location}.source_contract_verified",
                    "must be true",
                )
            key = ref.get("operation_key")
            role = ref.get("role")
            if isinstance(key, str) and isinstance(role, str):
                bound_keys.add(key)
                operation_role = (key, role)
                if operation_role in seen_operation_roles:
                    error(
                        errors,
                        path,
                        ref_location,
                        "duplicates an operation key and role in this binding",
                    )
                seen_operation_roles.add(operation_role)
                roles_for_key = roles_by_operation_key.setdefault(key, set())
                compatible_read_reuse = (
                    role in READ_ONLY_BINDING_ROLES
                    and roles_for_key <= READ_ONLY_BINDING_ROLES
                )
                if roles_for_key and role not in roles_for_key and not compatible_read_reuse:
                    error(
                        errors,
                        path,
                        f"{ref_location}.role",
                        "one operation key cannot mix mutation roles or mutation and read-only roles",
                    )
                roles_for_key.add(role)
            if operation is not None:
                method = operation.get("method")
                allowed_methods = (
                    BINDING_ROLE_METHODS.get(role)
                    if isinstance(role, str)
                    else None
                )
                if allowed_methods is not None and method not in allowed_methods:
                    error(
                        errors,
                        path,
                        f"{ref_location}.role",
                        f"role {role!r} requires one of {', '.join(sorted(allowed_methods))}, not {method!r}",
                    )
                if role in MUTATING_BINDING_ROLES and method in NON_MUTATING_METHODS:
                    error(
                        errors,
                        path,
                        f"{ref_location}.role",
                        f"mutation role {role!r} cannot use non-mutating method {method!r}",
                    )
                if role in READ_ONLY_BINDING_ROLES and method not in READ_LIKE_METHODS:
                    error(
                        errors,
                        path,
                        f"{ref_location}.role",
                        f"read-only role {role!r} cannot use method {method!r}",
                    )
                available_refs_by_field = {
                    "request_schema_refs": schema_refs(operation.get("request_body")),
                    "response_schema_refs": schema_refs(operation.get("responses")),
                }
                for field, available_refs in available_refs_by_field.items():
                    for item in validate_string_array(
                        ref.get(field), errors, path, f"{ref_location}.{field}"
                    ):
                        if item not in available_refs:
                            error(
                                errors,
                                path,
                                f"{ref_location}.{field}",
                                f"reference {item!r} is absent from the operation summary",
                            )
                response_statuses = {
                    response.get("status")
                    for response in operation.get("responses", [])
                    if isinstance(response, Mapping)
                }
                for status_code in validate_string_array(
                    ref.get("expected_success_statuses"),
                    errors,
                    path,
                    f"{ref_location}.expected_success_statuses",
                    nonempty=True,
                ):
                    if not re.fullmatch(r"2(?:[0-9]{2}|XX)", status_code):
                        error(
                            errors,
                            path,
                            f"{ref_location}.expected_success_statuses",
                            f"status {status_code!r} is not an explicit 2xx success response",
                        )
                    if status_code not in response_statuses:
                        error(
                            errors,
                            path,
                            f"{ref_location}.expected_success_statuses",
                            f"status {status_code!r} is absent from the operation",
                        )
        missing_roles = sorted(set(required_roles) - bound_roles)
        if missing_roles:
            error(
                errors,
                path,
                f"{location}.required_roles",
                f"declared workflow roles are not bound: {', '.join(missing_roles)}",
            )
        scope_bindings = expect_list(
            binding.get("scope_bindings"),
            errors,
            path,
            f"{location}.scope_bindings",
        ) or []
        for scope_index, raw_scope in enumerate(scope_bindings):
            scope_location = f"{location}.scope_bindings[{scope_index}]"
            scope = expect_mapping(raw_scope, errors, path, scope_location)
            if scope is None:
                continue
            require_exact_keys(scope, TARGET_SCOPE_BINDING_KEYS, errors, path, scope_location)
            if scope.get("scope_kind") not in SCOPE_KINDS:
                error(errors, path, f"{scope_location}.scope_kind", "is invalid")
            scope_location_kind = scope.get("location")
            if scope_location_kind not in SCOPE_LOCATIONS:
                error(errors, path, f"{scope_location}.location", "is invalid")
            if scope.get("source_contract_verified") is not True:
                error(errors, path, f"{scope_location}.source_contract_verified", "must be true")
            scope_name = scope.get("name")
            if scope_location_kind in {"token", "server"} and scope_name is not None:
                error(errors, path, f"{scope_location}.name", "must be null for token/server scope")
            if scope_location_kind in {"path", "query", "header", "request_body"} and (
                not isinstance(scope_name, str) or not scope_name
            ):
                error(errors, path, f"{scope_location}.name", "must be a non-empty contract field name")
            scope_operation_keys = validate_string_array(
                scope.get("operation_keys"),
                errors,
                path,
                f"{scope_location}.operation_keys",
                nonempty=True,
            )
            for key in scope_operation_keys:
                if key not in bound_keys:
                    error(
                        errors,
                        path,
                        f"{scope_location}.operation_keys",
                        f"{key!r} is not bound under this concept",
                    )
                    continue
                operation = operations.get(key)
                if operation is None:
                    continue
                if scope_location_kind in {"path", "query", "header"}:
                    parameters = operation.get("parameters")
                    parameter_items = parameters if isinstance(parameters, list) else []
                    matches = []
                    for parameter in parameter_items:
                        if not isinstance(parameter, Mapping):
                            continue
                        candidate_name = parameter.get("name")
                        names_match = (
                            isinstance(candidate_name, str)
                            and isinstance(scope_name, str)
                            and (
                                candidate_name.lower() == scope_name.lower()
                                if scope_location_kind == "header"
                                else candidate_name == scope_name
                            )
                        )
                        if parameter.get("in") == scope_location_kind and names_match:
                            matches.append(parameter)
                    if not matches:
                        error(
                            errors,
                            path,
                            f"{scope_location}.name",
                            f"{scope_name!r} is not a {scope_location_kind} parameter on {key}",
                        )
                elif scope_location_kind == "request_body":
                    request_body = operation.get("request_body")
                    if not isinstance(request_body, Mapping) or request_body.get("kind") == "none":
                        error(
                            errors,
                            path,
                            f"{scope_location}.location",
                            f"{key} has no request body for the declared scope binding",
                        )
    if status == "resolved" and unresolved:
        error(errors, path, "$.unresolved_concept_ids", "must be empty when resolved")


def binding_role_index(
    document: Any,
) -> dict[str, dict[str, set[str]]]:
    """Index validated-shape concept operation roles for cross-document checks."""

    index: dict[str, dict[str, set[str]]] = {}
    if not isinstance(document, Mapping):
        return index
    bindings = document.get("bindings")
    if not isinstance(bindings, list):
        return index
    for binding in bindings:
        if not isinstance(binding, Mapping):
            continue
        concept_id = binding.get("concept_id")
        operation_bindings = binding.get("operations")
        if not isinstance(concept_id, str) or not isinstance(operation_bindings, list):
            continue
        concept_index = index.setdefault(concept_id, {})
        for operation in operation_bindings:
            if not isinstance(operation, Mapping):
                continue
            key = operation.get("operation_key")
            role = operation.get("role")
            if isinstance(key, str) and isinstance(role, str):
                concept_index.setdefault(key, set()).add(role)
    return index


def _resolve_change_plan_operations(
    plan_operations: Any,
    path: Path,
    errors: list[str],
    digest: str | None,
    operations: Mapping[str, Mapping[str, Any]],
) -> dict[str, Mapping[str, Any] | None] | None:
    """Resolve the plan's catalog-bound operation references."""

    if not isinstance(plan_operations, Mapping):
        error(errors, path, "$.operations", "must be an object")
        return None
    require_exact_keys(
        plan_operations, PLAN_OPERATION_ROLES, errors, path, "$.operations"
    )
    resolved: dict[str, Mapping[str, Any] | None] = {}
    for role in ("read", "write", "readback", "rollback", "audit", "status"):
        ref = plan_operations.get(role)
        if ref is None:
            resolved[role] = None
            continue
        ref_mapping = expect_mapping(ref, errors, path, f"$.operations.{role}")
        if ref_mapping is None:
            resolved[role] = None
            continue
        require_exact_keys(
            ref_mapping,
            CHANGE_PLAN_OPERATION_KEYS,
            errors,
            path,
            f"$.operations.{role}",
        )
        resolved[role] = validate_operation_reference(
            ref_mapping,
            path=path,
            location=f"$.operations.{role}",
            errors=errors,
            catalog_digest=digest,
            operations=operations,
            digest_field="catalog_sha256",
            allowed_surfaces={CLIENT_OPERATION_SURFACE},
        )
    for required_role in ("read", "write", "readback"):
        if resolved.get(required_role) is None:
            error(errors, path, f"$.operations.{required_role}", "is required")
    return resolved


def _validate_change_plan_target_bindings(
    root: Mapping[str, Any],
    path: Path,
    errors: list[str],
    plan_concept_ids: Sequence[str],
    plan_operations: Mapping[str, Any],
    bindings_document: Mapping[str, Any],
) -> None:
    """Cross-check a resolved plan against its target-binding document."""

    binding_status = bindings_document.get("binding_status")
    if binding_status not in {"partial", "resolved"}:
        error(
            errors,
            path,
            "$.operations",
            "a resolved plan requires current partial/resolved target bindings",
        )
    binding_target = bindings_document.get("target")
    plan_target = root.get("target")
    if isinstance(binding_target, Mapping) and isinstance(plan_target, Mapping):
        for binding_field, plan_field in (
            ("authorized_origin", "authorized_origin"),
            ("reported_version", "relution_version"),
            ("organization_id", "organization_id"),
        ):
            if binding_target.get(binding_field) != plan_target.get(plan_field):
                error(
                    errors,
                    path,
                    f"$.target.{plan_field}",
                    "does not match the target binding document",
                )
    binding_contract = bindings_document.get("contract")
    plan_contract = root.get("contract")
    if isinstance(binding_contract, Mapping) and isinstance(plan_contract, Mapping):
        if binding_contract.get("source_sha256") != plan_contract.get("sha256"):
            error(
                errors,
                path,
                "$.contract.sha256",
                "does not match the target binding document",
            )
        if binding_contract.get("operation_count") != plan_contract.get(
            "operation_count"
        ):
            error(
                errors,
                path,
                "$.contract.operation_count",
                "does not match the target binding document",
            )
    indexed_binding_roles = binding_role_index(bindings_document)
    for concept_id in plan_concept_ids:
        if concept_id not in indexed_binding_roles:
            error(
                errors,
                path,
                "$.concept_ids",
                f"{concept_id!r} has no target binding",
            )
    for role, compatible_roles in PLAN_ROLE_BINDING_ROLES.items():
        reference = plan_operations.get(role)
        if not isinstance(reference, Mapping):
            continue
        key = reference.get("operation_key")
        if not isinstance(key, str):
            continue
        matching_roles = {
            binding_role
            for concept_id in plan_concept_ids
            for binding_role in indexed_binding_roles
            .get(concept_id, {})
            .get(key, set())
        }
        if not matching_roles.intersection(compatible_roles):
            error(
                errors,
                path,
                f"$.operations.{role}.operation_key",
                "is not bound to a compatible role for any plan concept",
            )


def _validate_change_plan_operation_roles(
    resolved: Mapping[str, Mapping[str, Any] | None],
    plan_operations: Mapping[str, Any],
    raw_request: Any,
    path: Path,
    errors: list[str],
) -> None:
    """Validate method semantics and request identity for resolved plan roles."""

    for read_role in ("read", "readback", "audit", "status"):
        operation = resolved.get(read_role)
        if operation is not None and operation.get("method") not in READ_LIKE_METHODS:
            error(
                errors,
                path,
                f"$.operations.{read_role}.method",
                "must use a read-like method for this role",
            )
    write = resolved.get("write")
    if write is not None:
        if write.get("method") in NON_MUTATING_METHODS:
            error(
                errors,
                path,
                "$.operations.write.method",
                "must use a mutating method for the write role",
            )
        if isinstance(raw_request, Mapping):
            if raw_request.get("method") != write.get("method"):
                error(errors, path, "$.request.method", "does not match write operation")
            if raw_request.get("path_template") != write.get("path"):
                error(
                    errors,
                    path,
                    "$.request.path_template",
                    "does not match write operation",
                )
            response_statuses = {
                response.get("status")
                for response in write.get("responses", [])
                if isinstance(response, Mapping)
            }
            for status_code in validate_string_array(
                raw_request.get("expected_success_statuses"),
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
                if status_code not in response_statuses:
                    error(
                        errors,
                        path,
                        "$.request.expected_success_statuses",
                        f"status {status_code!r} is absent from the write operation",
                    )
    rollback_operation = resolved.get("rollback")
    if (
        rollback_operation is not None
        and rollback_operation.get("method") in NON_MUTATING_METHODS
    ):
        error(
            errors,
            path,
            "$.operations.rollback.method",
            "must use a mutating method for the rollback role",
        )
    write_reference = plan_operations.get("write")
    write_key = (
        write_reference.get("operation_key")
        if isinstance(write_reference, Mapping)
        else None
    )
    for read_role in ("read", "readback"):
        read_reference = plan_operations.get(read_role)
        if (
            isinstance(read_reference, Mapping)
            and read_reference.get("operation_key") == write_key
        ):
            error(
                errors,
                path,
                f"$.operations.{read_role}.operation_key",
                "must differ from the write operation",
            )


def validate_change_plan(
    document: Any,
    path: Path,
    errors: list[str],
    concept_ids: set[str],
    catalog: Mapping[str, Any],
    operations: Mapping[str, Mapping[str, Any]],
    bindings_document: Mapping[str, Any] | None = None,
) -> None:
    root = expect_mapping(document, errors, path, "$")
    if root is None:
        return
    require_exact_keys(root, CHANGE_PLAN_ROOT_KEYS, errors, path, "$")
    if root.get("document_type") != "relution-settings-change-plan":
        error(errors, path, "$.document_type", "is not a settings change plan")
    if root.get("schema_version") != SCHEMA_VERSION:
        error(errors, path, "$.schema_version", f"must equal {SCHEMA_VERSION!r}")
    if root.get("sensitive_values_present") is not False:
        error(errors, path, "$.sensitive_values_present", "must be false")
    request_record = root.get("request")
    if not isinstance(request_record, Mapping):
        error(errors, path, "$.request", "must be an object")
        request_record = {}
    else:
        require_exact_keys(request_record, REQUEST_KEYS, errors, path, "$.request")
    if request_record.get("automatic_retry_allowed") is not False:
        error(errors, path, "$.request.automatic_retry_allowed", "must be false")
    if request_record.get("maximum_attempts") != 1:
        error(errors, path, "$.request.maximum_attempts", "must equal 1")
    plan_concept_ids = validate_string_array(
        root.get("concept_ids"), errors, path, "$.concept_ids"
    )
    for concept_id in plan_concept_ids:
        if concept_id not in concept_ids:
            error(errors, path, "$.concept_ids", f"unknown ID {concept_id!r}")
    validate_string_array(root.get("stop_reasons"), errors, path, "$.stop_reasons")
    status = root.get("plan_status")
    if status == "template":
        if root.get("execution_authorized") is not False:
            error(errors, path, "$.execution_authorized", "template must be false")
        return

    non_executable = {
        "discovery",
        "planned",
        "verified",
        "rolled_back",
        "blocked",
        "outcome_unknown",
    }
    executable = {"approved", "executing"}
    if status in non_executable and root.get("execution_authorized") is not False:
        error(errors, path, "$.execution_authorized", "must be false for this status")
    if status in executable and root.get("execution_authorized") is not True:
        error(errors, path, "$.execution_authorized", "must be true for this status")
    if status not in non_executable | executable:
        error(errors, path, "$.plan_status", "is invalid")
        return
    if status in executable and root.get("stop_reasons"):
        error(errors, path, "$.stop_reasons", "must be empty before execution")
    resolved_statuses = {
        "planned",
        "approved",
        "executing",
        "verified",
        "rolled_back",
        "outcome_unknown",
    }
    if status in resolved_statuses:
        if not plan_concept_ids:
            error(errors, path, "$.concept_ids", "must not be empty for a resolved plan")
        if catalog.get("status") != "generated":
            error(errors, path, "$.contract", "planned mutation requires generated catalog")
        digest = catalog_digest(catalog)
        contract = root.get("contract")
        if isinstance(contract, Mapping):
            require_exact_keys(
                contract, CHANGE_PLAN_CONTRACT_KEYS, errors, path, "$.contract"
            )
        if not isinstance(contract, Mapping) or contract.get("sha256") != digest:
            error(errors, path, "$.contract.sha256", "does not match catalog digest")
        if not isinstance(contract, Mapping) or contract.get("checked_current") is not True:
            error(errors, path, "$.contract.checked_current", "must be true")
        if (
            not isinstance(contract, Mapping)
            or contract.get("operation_count") != catalog.get("operation_count")
        ):
            error(errors, path, "$.contract.operation_count", "does not match catalog")
        if isinstance(contract, Mapping) and (
            not isinstance(contract.get("catalog_path"), str)
            or not contract["catalog_path"]
        ):
            error(errors, path, "$.contract.catalog_path", "must be non-empty")

        plan_operations = root.get("operations")
        resolved = _resolve_change_plan_operations(
            plan_operations,
            path,
            errors,
            digest,
            operations,
        )
        if resolved is None:
            return
        if not isinstance(plan_operations, Mapping):
            return
        if bindings_document is not None:
            _validate_change_plan_target_bindings(
                root,
                path,
                errors,
                plan_concept_ids,
                plan_operations,
                bindings_document,
            )
        _validate_change_plan_operation_roles(
            resolved,
            plan_operations,
            root.get("request"),
            path,
            errors,
        )
        write = resolved.get("write")
        if isinstance(request_record, Mapping):
            for field in ("path_parameters", "query_parameters"):
                if not isinstance(request_record.get(field), Mapping):
                    error(errors, path, f"$.request.{field}", "must be an object")
            for field in (
                "method",
                "path_template",
                "media_type",
                "request_schema_ref",
                "request_body_file",
            ):
                value = request_record.get(field)
                if value is not None and not isinstance(value, str):
                    error(errors, path, f"$.request.{field}", "must be a string or null")
            concurrency_controls = validate_string_array(
                request_record.get("concurrency_controls"),
                errors,
                path,
                "$.request.concurrency_controls",
            )
            if write is not None:
                request_body = write.get("request_body")
                request_body_refs = schema_refs(request_body)
                request_schema_ref = request_record.get("request_schema_ref")
                if (
                    isinstance(request_schema_ref, str)
                    and request_schema_ref
                    and request_schema_ref not in request_body_refs
                ):
                    error(
                        errors,
                        path,
                        "$.request.request_schema_ref",
                        "is absent from the write operation request body",
                    )
                request_body_kind = (
                    request_body.get("kind")
                    if isinstance(request_body, Mapping)
                    else None
                )
                if request_body_kind not in {None, "none"}:
                    if (
                        not isinstance(request_record.get("request_body_file"), str)
                        or not request_record["request_body_file"]
                    ):
                        error(
                            errors,
                            path,
                            "$.request.request_body_file",
                            "is required when the write operation declares a request body",
                        )
                    elif status in executable:
                        request_body_path = Path(request_record["request_body_file"])
                        if not request_body_path.is_absolute():
                            request_body_path = path.parent / request_body_path
                        if not request_body_path.is_file():
                            error(
                                errors,
                                path,
                                "$.request.request_body_file",
                                "must reference an existing regular file before execution",
                            )
                    media_type = request_record.get("media_type")
                    if not isinstance(media_type, str) or not media_type:
                        error(
                            errors,
                            path,
                            "$.request.media_type",
                            "is required when the write operation declares a request body",
                        )
                    declared_media_types = request_body_media_types(request_body)
                    if (
                        isinstance(media_type, str)
                        and declared_media_types
                        and media_type not in declared_media_types
                    ):
                        error(
                            errors,
                            path,
                            "$.request.media_type",
                            "is absent from the write operation request body",
                        )
                    if request_body_refs and (
                        not isinstance(request_schema_ref, str)
                        or not request_schema_ref
                    ):
                        error(
                            errors,
                            path,
                            "$.request.request_schema_ref",
                            "is required when the request body contains a schema/reference",
                        )
                else:
                    for field in ("media_type", "request_schema_ref", "request_body_file"):
                        if request_record.get(field) is not None:
                            error(
                                errors,
                                path,
                                f"$.request.{field}",
                                "must be null when the write operation has no request body",
                            )
                parameters = write.get("parameters")
                parameter_items = parameters if isinstance(parameters, list) else []
                declared_by_location: dict[str, set[str]] = {
                    "path": set(),
                    "query": set(),
                    "header": set(),
                }
                for parameter in parameter_items:
                    if not isinstance(parameter, Mapping):
                        continue
                    parameter_location = parameter.get("in")
                    parameter_name = parameter.get("name")
                    if (
                        parameter_location in declared_by_location
                        and isinstance(parameter_name, str)
                    ):
                        declared_by_location[parameter_location].add(parameter_name)
                path_parameters = request_record.get("path_parameters")
                if isinstance(path_parameters, Mapping):
                    supplied_path_names = set(path_parameters)
                    if supplied_path_names != declared_by_location["path"]:
                        error(
                            errors,
                            path,
                            "$.request.path_parameters",
                            "must exactly match the write operation path parameters",
                        )
                query_parameters = request_record.get("query_parameters")
                if isinstance(query_parameters, Mapping):
                    unknown_query = sorted(
                        set(query_parameters) - declared_by_location["query"]
                    )
                    if unknown_query:
                        error(
                            errors,
                            path,
                            "$.request.query_parameters",
                            f"undeclared query parameters: {', '.join(unknown_query)}",
                        )
                declared_headers_lower = {
                    name.lower() for name in declared_by_location["header"]
                }
                for header_name in concurrency_controls:
                    if header_name.lower() not in declared_headers_lower:
                        error(
                            errors,
                            path,
                            "$.request.concurrency_controls",
                            f"header {header_name!r} is absent from the write operation",
                        )
        impact = root.get("impact")
        if isinstance(impact, Mapping):
            require_exact_keys(impact, IMPACT_KEYS, errors, path, "$.impact")
        if (
            not isinstance(impact, Mapping)
            or not isinstance(impact.get("tier"), int)
            or isinstance(impact.get("tier"), bool)
        ):
            error(errors, path, "$.impact.tier", "must be classified")
        elif impact["tier"] < 1:
            error(errors, path, "$.impact.tier", "a settings mutation cannot be Tier 0")
        elif impact["tier"] > 4:
            error(errors, path, "$.impact.tier", "must not exceed Tier 4")
        if isinstance(impact, Mapping):
            if not isinstance(impact.get("reason"), str) or not impact["reason"]:
                error(errors, path, "$.impact.reason", "must be recorded")
            for field in (
                "externally_visible",
                "destructive_or_irreversible",
                "affects_authentication_or_access",
                "affects_multiple_organizations",
                "requires_immediate_approval",
                "requires_canary",
                "requires_second_access_path",
            ):
                if not isinstance(impact.get(field), bool):
                    error(errors, path, f"$.impact.{field}", "must be classified")
            for field in ("canary_scope", "monitoring_owner", "monitoring_window"):
                value = impact.get(field)
                if value is not None and (not isinstance(value, str) or not value):
                    error(errors, path, f"$.impact.{field}", "must be a non-empty string or null")
            tier = impact.get("tier")
            if (
                (isinstance(tier, int) and not isinstance(tier, bool) and tier >= 2)
                or impact.get("externally_visible") is True
            ) and impact.get("requires_immediate_approval") is not True:
                error(
                    errors,
                    path,
                    "$.impact.requires_immediate_approval",
                    "must be true for Tier 2-4 or externally visible changes",
                )
            if impact.get("destructive_or_irreversible") is True:
                if tier != 4:
                    error(
                        errors,
                        path,
                        "$.impact.tier",
                        "destructive or irreversible changes must be Tier 4",
                    )
                if impact.get("requires_immediate_approval") is not True:
                    error(
                        errors,
                        path,
                        "$.impact.requires_immediate_approval",
                        "must be true for destructive or irreversible changes",
                    )
            if impact.get("affects_multiple_organizations") is True and tier != 4:
                error(
                    errors,
                    path,
                    "$.impact.tier",
                    "multi-organization changes must be Tier 4",
                )
            if impact.get("affects_authentication_or_access") is True and (
                not isinstance(tier, int) or tier < 3
            ):
                error(
                    errors,
                    path,
                    "$.impact.tier",
                    "authentication or access changes must be Tier 3 or 4",
                )
            if (
                impact.get("affects_authentication_or_access") is True
                and impact.get("requires_second_access_path") is not True
            ):
                error(
                    errors,
                    path,
                    "$.impact.requires_second_access_path",
                    "must be true for authentication or access changes",
                )
            if tier == 4:
                if impact.get("requires_canary") is not True:
                    error(
                        errors,
                        path,
                        "$.impact.requires_canary",
                        "must be true for Tier 4 changes",
                    )
                for field in ("canary_scope", "monitoring_owner", "monitoring_window"):
                    if not isinstance(impact.get(field), str) or not impact[field]:
                        error(
                            errors,
                            path,
                            f"$.impact.{field}",
                            "must be recorded for a Tier 4 canary and monitoring plan",
                        )
        target = root.get("target")
        if not isinstance(target, Mapping):
            error(errors, path, "$.target", "must be an object")
        else:
            require_exact_keys(
                target, CHANGE_PLAN_TARGET_KEYS, errors, path, "$.target"
            )
            for field in (
                "authorized_origin",
                "effective_api_server",
                "relution_version",
                "organization_id",
                "organization_name",
            ):
                if not isinstance(target.get(field), str) or not target[field]:
                    error(errors, path, f"$.target.{field}", "must be resolved")
            authorized_origin = validate_https_url(
                target.get("authorized_origin"),
                errors,
                path,
                "$.target.authorized_origin",
                origin_only=True,
            )
            effective_origin = validate_https_url(
                target.get("effective_api_server"),
                errors,
                path,
                "$.target.effective_api_server",
                origin_only=False,
            )
            if (
                authorized_origin is not None
                and effective_origin is not None
                and effective_origin != authorized_origin
            ):
                error(
                    errors,
                    path,
                    "$.target.effective_api_server",
                    "must resolve to the explicitly authorized origin",
                )
        resource = root.get("resource")
        if isinstance(resource, Mapping):
            require_exact_keys(resource, RESOURCE_KEYS, errors, path, "$.resource")
        if not isinstance(resource, Mapping) or resource.get("resolved_uniquely") is not True:
            error(errors, path, "$.resource.resolved_uniquely", "must be true")
        elif any(
            not isinstance(resource.get(field), str) or not resource[field]
            for field in ("type", "stable_id", "display_name", "scope")
        ):
            error(errors, path, "$.resource", "identity and scope must be fully resolved")
        elif resource.get("scope") not in RESOURCE_SCOPES:
            error(errors, path, "$.resource.scope", "is invalid")
        change = root.get("change")
        if not isinstance(change, Mapping):
            error(errors, path, "$.change", "must be an object")
        else:
            require_exact_keys(change, CHANGE_KEYS, errors, path, "$.change")
            before_fields = change.get("before_fields")
            desired_fields = change.get("desired_fields")
            if not isinstance(before_fields, Mapping) or not isinstance(desired_fields, Mapping):
                error(errors, path, "$.change", "before_fields and desired_fields must be objects")
            elif before_fields == desired_fields:
                error(errors, path, "$.change.desired_fields", "must differ from before_fields")
            if change.get("destructive_sentinels_reviewed") is not True:
                error(errors, path, "$.change.destructive_sentinels_reviewed", "must be true")
            if change.get("smallest_semantic_diff_confirmed") is not True:
                error(errors, path, "$.change.smallest_semantic_diff_confirmed", "must be true")
            for field in (
                "unchanged_invariants",
                "omitted_server_managed_fields",
                "write_only_fields",
            ):
                validate_string_array(
                    change.get(field), errors, path, f"$.change.{field}"
                )
        assertions = root.get("success_assertions")
        if not isinstance(assertions, list) or not assertions:
            error(errors, path, "$.success_assertions", "must not be empty")
        elif isinstance(assertions, list):
            for index, raw_assertion in enumerate(assertions):
                location = f"$.success_assertions[{index}]"
                assertion = expect_mapping(raw_assertion, errors, path, location)
                if assertion is None:
                    continue
                require_exact_keys(assertion, ASSERTION_KEYS, errors, path, location)
                if assertion.get("source") not in ASSERTION_SOURCES:
                    error(errors, path, f"{location}.source", "is invalid")
                pointer = assertion.get("json_pointer")
                if not isinstance(pointer, str) or (pointer and not pointer.startswith("/")):
                    error(errors, path, f"{location}.json_pointer", "must be a JSON Pointer")
                if assertion.get("operator") not in ASSERTION_OPERATORS:
                    error(errors, path, f"{location}.operator", "is invalid")
        audit_plan = root.get("audit_plan")
        if not isinstance(audit_plan, Mapping):
            error(errors, path, "$.audit_plan", "must be an object")
        else:
            require_exact_keys(
                audit_plan, AUDIT_PLAN_KEYS, errors, path, "$.audit_plan"
            )
            audit_mode = audit_plan.get("mode")
            if audit_mode not in AUDIT_PLAN_MODES:
                error(errors, path, "$.audit_plan.mode", "must be resolved")
            instructions = validate_string_array(
                audit_plan.get("instructions"),
                errors,
                path,
                "$.audit_plan.instructions",
            )
            match_fields = validate_string_array(
                audit_plan.get("required_match_fields"),
                errors,
                path,
                "$.audit_plan.required_match_fields",
            )
            missing_match_fields = sorted(
                REQUIRED_AUDIT_MATCH_FIELDS - set(match_fields)
            )
            if missing_match_fields:
                error(
                    errors,
                    path,
                    "$.audit_plan.required_match_fields",
                    f"missing required audit match fields: {', '.join(missing_match_fields)}",
                )
            evidence_source = audit_plan.get("evidence_source")
            if evidence_source not in AUDIT_EVIDENCE_SOURCES:
                error(errors, path, "$.audit_plan.evidence_source", "must be resolved")
            if audit_mode == "api_operation":
                if resolved.get("audit") is None:
                    error(
                        errors,
                        path,
                        "$.operations.audit",
                        "is required for an api_operation audit plan",
                    )
                if evidence_source != "target_contract":
                    error(
                        errors,
                        path,
                        "$.audit_plan.evidence_source",
                        "must be target_contract for an API audit operation",
                    )
            elif audit_mode == "manual_ui":
                if not instructions:
                    error(
                        errors,
                        path,
                        "$.audit_plan.instructions",
                        "must describe the manual audit-log procedure",
                    )
                if evidence_source != "official_documentation":
                    error(
                        errors,
                        path,
                        "$.audit_plan.evidence_source",
                        "must be official_documentation for a manual UI audit plan",
                    )
        rollback = root.get("rollback")
        if isinstance(rollback, Mapping):
            require_exact_keys(rollback, ROLLBACK_KEYS, errors, path, "$.rollback")
            if not isinstance(rollback.get("available"), bool):
                error(errors, path, "$.rollback.available", "must be classified")
            rollback_mode = rollback.get("execution_mode")
            if rollback_mode not in ROLLBACK_EXECUTION_MODES:
                error(errors, path, "$.rollback.execution_mode", "must be resolved")
            if not isinstance(rollback.get("strategy"), str) or not rollback["strategy"]:
                error(errors, path, "$.rollback.strategy", "must be recorded")
            for field in ("prior_values_captured", "irreversibility_acknowledged"):
                if not isinstance(rollback.get(field), bool):
                    error(errors, path, f"$.rollback.{field}", "must be a boolean")
            if rollback.get("available") is True:
                for field in ("recovery_owner", "recovery_window"):
                    if not isinstance(rollback.get(field), str) or not rollback[field]:
                        error(errors, path, f"$.rollback.{field}", "must be recorded")
            if rollback_mode == "bound_operation":
                if rollback.get("available") is not True:
                    error(errors, path, "$.rollback.available", "must be true for a bound rollback")
                if resolved.get("rollback") is None:
                    error(
                        errors,
                        path,
                        "$.operations.rollback",
                        "is required for bound_operation rollback",
                    )
            elif rollback_mode == "restore_with_write_operation":
                if rollback.get("available") is not True:
                    error(errors, path, "$.rollback.available", "must be true for write-based restore")
                if rollback.get("prior_values_captured") is not True:
                    error(
                        errors,
                        path,
                        "$.rollback.prior_values_captured",
                        "must be true for restore_with_write_operation",
                    )
            elif rollback_mode == "manual_recovery":
                if rollback.get("available") is not True:
                    error(errors, path, "$.rollback.available", "must be true for manual recovery")
            elif rollback_mode == "irreversible":
                if rollback.get("available") is not False:
                    error(errors, path, "$.rollback.available", "must be false for irreversible effects")
                if rollback.get("irreversibility_acknowledged") is not True:
                    error(
                        errors,
                        path,
                        "$.rollback.irreversibility_acknowledged",
                        "must be true for irreversible effects",
                    )
                if resolved.get("rollback") is not None:
                    error(
                        errors,
                        path,
                        "$.operations.rollback",
                        "must be null when rollback is declared irreversible",
                    )
                if not isinstance(impact, Mapping) or impact.get("destructive_or_irreversible") is not True:
                    error(
                        errors,
                        path,
                        "$.impact.destructive_or_irreversible",
                        "must be true when rollback is declared irreversible",
                    )
            if rollback_mode != "bound_operation" and resolved.get("rollback") is not None:
                error(
                    errors,
                    path,
                    "$.operations.rollback",
                    "must be null unless rollback.execution_mode is bound_operation",
                )
        if isinstance(impact, Mapping) and isinstance(rollback, Mapping):
            if impact.get("destructive_or_irreversible") is True and rollback.get("irreversibility_acknowledged") is not True:
                error(
                    errors,
                    path,
                    "$.rollback.irreversibility_acknowledged",
                    "must be true for destructive or irreversible effects",
                )
        authorization_required = {
            "approved",
            "executing",
            "verified",
            "rolled_back",
            "outcome_unknown",
        }
        if status in authorization_required:
            authorization = root.get("authorization")
            if not isinstance(authorization, Mapping):
                error(errors, path, "$.authorization", "must be an object")
            else:
                require_exact_keys(
                    authorization, AUTHORIZATION_KEYS, errors, path, "$.authorization"
                )
                for field in (
                    "request_owner",
                    "operator_identity",
                    "token_owner",
                    "approved_effect",
                    "approved_at",
                ):
                    if not isinstance(authorization.get(field), str) or not authorization[field]:
                        error(errors, path, f"$.authorization.{field}", "must be recorded")
                permission_scope = validate_string_array(
                    authorization.get("permission_scope"),
                    errors,
                    path,
                    "$.authorization.permission_scope",
                    nonempty=True,
                )
                if not permission_scope:
                    error(
                        errors,
                        path,
                        "$.authorization.permission_scope",
                        "must name the intended permission scope",
                    )
                if authorization.get("approved_object_count") != 1:
                    error(
                        errors,
                        path,
                        "$.authorization.approved_object_count",
                        "must equal one for a bounded change plan",
                    )
                approved_at = parse_timestamp(
                    authorization.get("approved_at"),
                    errors,
                    path,
                    "$.authorization.approved_at",
                )
                expires_at = parse_timestamp(
                    authorization.get("expires_at"),
                    errors,
                    path,
                    "$.authorization.expires_at",
                )
                if approved_at is not None and expires_at is not None and approved_at >= expires_at:
                    error(
                        errors,
                        path,
                        "$.authorization.expires_at",
                        "must be later than approved_at",
                    )
                if status in executable and expires_at is not None and expires_at <= datetime.now(timezone.utc):
                    error(
                        errors,
                        path,
                        "$.authorization.expires_at",
                        "approval has expired; execution is not authorized",
                    )
                if (
                    status in executable
                    and isinstance(impact, Mapping)
                    and impact.get("requires_immediate_approval") is True
                    and approved_at is not None
                    and expires_at is not None
                ):
                    now = datetime.now(timezone.utc)
                    if approved_at > now + MAX_APPROVAL_CLOCK_SKEW:
                        error(
                            errors,
                            path,
                            "$.authorization.approved_at",
                            "immediate approval time is unacceptably far in the future",
                        )
                    if now - approved_at > MAX_IMMEDIATE_APPROVAL_AGE:
                        error(
                            errors,
                            path,
                            "$.authorization.approved_at",
                            "immediate approval is older than the one-hour execution window",
                        )
                    if expires_at - approved_at > MAX_IMMEDIATE_APPROVAL_AGE:
                        error(
                            errors,
                            path,
                            "$.authorization.expires_at",
                            "immediate approval window must not exceed one hour",
                        )

        verification = root.get("verification")
        if not isinstance(verification, Mapping):
            error(errors, path, "$.verification", "must be an object")
            verification = {}
        else:
            require_exact_keys(
                verification, VERIFICATION_KEYS, errors, path, "$.verification"
            )
            for field in (
                "documented_status_observed",
                "response_schema_valid",
                "readback_matches",
                "unchanged_invariants_match",
                "audit_entry_matches",
                "per_target_results_checked",
            ):
                if verification.get(field) is not None and not isinstance(
                    verification.get(field), bool
                ):
                    error(errors, path, f"$.verification.{field}", "must be a boolean or null")
            if verification.get("functional_check") not in FUNCTIONAL_CHECK_RESULTS:
                error(errors, path, "$.verification.functional_check", "is invalid")
            job_terminal_state = verification.get("job_terminal_state")
            if job_terminal_state is not None and not isinstance(job_terminal_state, str):
                error(errors, path, "$.verification.job_terminal_state", "must be a string or null")
        result = root.get("result")
        if not isinstance(result, Mapping):
            error(errors, path, "$.result", "must be an object")
            result = {}
        else:
            require_exact_keys(result, RESULT_KEYS, errors, path, "$.result")
            for field, allowed in RESULT_ENUMS.items():
                if result.get(field) not in allowed:
                    error(errors, path, f"$.result.{field}", "is invalid")
            observed_at = result.get("observed_at")
            if observed_at is not None and not isinstance(observed_at, str):
                error(errors, path, "$.result.observed_at", "must be a string or null")
            validate_string_array(
                result.get("residual_uncertainty"),
                errors,
                path,
                "$.result.residual_uncertainty",
            )
        if status == "verified":
            required_verification = {
                "documented_status_observed": True,
                "response_schema_valid": True,
                "readback_matches": True,
                "unchanged_invariants_match": True,
                "audit_entry_matches": True,
            }
            if any(verification.get(field) is not expected for field, expected in required_verification.items()):
                error(
                    errors,
                    path,
                    "$.verification",
                    "verified status requires documented response, read-back, invariants, and audit evidence",
                )
            if verification.get("functional_check") not in {"passed", "not_applicable"}:
                error(
                    errors,
                    path,
                    "$.verification.functional_check",
                    "must be passed or not_applicable for verified status",
                )
            required_result = {
                "request_transport": "sent",
                "server_acceptance": "documented_success",
                "readback": "matches",
                "audit": "matching",
                "overall": "verified",
            }
            if any(result.get(field) != expected for field, expected in required_result.items()):
                error(
                    errors,
                    path,
                    "$.result",
                    "verified status requires a sent request and matching response, read-back, and audit result",
                )
            if result.get("residual_uncertainty") != []:
                error(
                    errors,
                    path,
                    "$.result.residual_uncertainty",
                    "must be empty for verified status",
                )
            parse_timestamp(result.get("observed_at"), errors, path, "$.result.observed_at")
        elif status == "rolled_back":
            required_verification = {
                "documented_status_observed": True,
                "response_schema_valid": True,
                "readback_matches": True,
                "unchanged_invariants_match": True,
                "audit_entry_matches": True,
            }
            if any(verification.get(field) is not expected for field, expected in required_verification.items()):
                error(
                    errors,
                    path,
                    "$.verification",
                    "rolled_back status requires documented rollback response, read-back, invariants, and audit evidence",
                )
            if verification.get("functional_check") not in {"passed", "not_applicable"}:
                error(
                    errors,
                    path,
                    "$.verification.functional_check",
                    "must be passed or not_applicable for rolled_back status",
                )
            if (
                result.get("request_transport") != "sent"
                or result.get("server_acceptance") != "documented_success"
                or result.get("readback") != "matches"
                or result.get("audit") != "matching"
                or result.get("overall") != "rolled_back"
            ):
                error(
                    errors,
                    path,
                    "$.result",
                    "rolled_back status requires a verified compensating result",
                )
            if result.get("residual_uncertainty") != []:
                error(
                    errors,
                    path,
                    "$.result.residual_uncertainty",
                    "must be empty for rolled_back status",
                )
            parse_timestamp(result.get("observed_at"), errors, path, "$.result.observed_at")
        elif status == "outcome_unknown":
            if result.get("request_transport") == "not_sent" or result.get("overall") != "outcome_unknown":
                error(
                    errors,
                    path,
                    "$.result",
                    "outcome_unknown requires evidence that a request may have been sent",
                )
            parse_timestamp(result.get("observed_at"), errors, path, "$.result.observed_at")


def manifest_registry_paths(
    document: Any, path: Path, errors: list[str]
) -> list[tuple[Path, Mapping[str, Any] | None]]:
    """Resolve registry dataset paths from the central manifest."""

    root = expect_mapping(document, errors, path, "$")
    if root is None:
        return []
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
        root.get("cross_reference_rules"),
        errors,
        path,
        "$.cross_reference_rules",
        nonempty=True,
    )
    evidence_classes = expect_list(
        root.get("evidence_classes"), errors, path, "$.evidence_classes"
    ) or []
    declared_evidence: set[str] = set()
    for index, raw_item in enumerate(evidence_classes):
        item = expect_mapping(
            raw_item, errors, path, f"$.evidence_classes[{index}]"
        )
        if item is None:
            continue
        evidence_id = item.get("id")
        if evidence_id not in EVIDENCE_CLASSES:
            error(
                errors,
                path,
                f"$.evidence_classes[{index}].id",
                "is not a supported evidence class",
            )
        elif evidence_id in declared_evidence:
            error(errors, path, f"$.evidence_classes[{index}].id", "is duplicated")
        else:
            declared_evidence.add(evidence_id)
        if not isinstance(item.get("meaning"), str) or not item["meaning"]:
            error(errors, path, f"$.evidence_classes[{index}].meaning", "must be non-empty")
    if declared_evidence != EVIDENCE_CLASSES:
        missing = sorted(EVIDENCE_CLASSES - declared_evidence)
        if missing:
            error(errors, path, "$.evidence_classes", f"missing: {', '.join(missing)}")
    datasets = expect_list(root.get("datasets"), errors, path, "$.datasets")
    if datasets is None:
        return []
    paths: list[tuple[Path, Mapping[str, Any] | None]] = []
    seen: set[Path] = set()
    for index, item in enumerate(datasets):
        location = f"$.datasets[{index}]"
        if isinstance(item, str):
            filename = item
            metadata = None
        elif isinstance(item, Mapping):
            filename = item.get("file") or item.get("path")
            metadata = item
        else:
            error(errors, path, location, "must be a filename or object")
            continue
        if not isinstance(filename, str) or not filename:
            error(errors, path, location, "must declare a non-empty file/path")
            continue
        resolved = (path.parent / filename).resolve()
        if path.parent.resolve() not in resolved.parents:
            error(errors, path, location, "dataset must remain inside the registry directory")
            continue
        if resolved in seen:
            error(errors, path, location, f"duplicate dataset {filename!r}")
            continue
        seen.add(resolved)
        if metadata is not None:
            record_count = metadata.get("record_count")
            if not isinstance(record_count, int) or isinstance(record_count, bool) or record_count < 1:
                error(errors, path, f"{location}.record_count", "must be a positive integer")
            schema_path = metadata.get("schema_path")
            if not isinstance(schema_path, str) or not schema_path:
                error(errors, path, f"{location}.schema_path", "must be non-empty")
            else:
                resolved_schema = (path.parent / schema_path).resolve()
                if not resolved_schema.is_file():
                    error(errors, path, f"{location}.schema_path", "does not exist")
        paths.append((resolved, metadata))
    return paths


def parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate Relution machine-readable registries, catalog, bindings, and change plan."
    )
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    parser.add_argument(
        "--spec",
        type=Path,
        help=(
            "raw target OpenAPI/Swagger JSON used to prove a generated catalog "
            "is current; required when catalog.status is generated"
        ),
    )
    parser.add_argument("--bindings", type=Path, default=DEFAULT_BINDINGS)
    parser.add_argument("--change-plan", type=Path, default=DEFAULT_CHANGE_PLAN)
    return parser.parse_args(argv)


def validate_all(args: argparse.Namespace) -> list[str]:
    errors: list[str] = []
    validate_schema_references(args.manifest.parent.parent / "schemas", errors)
    try:
        manifest = load_json(args.manifest)
    except ValidationFailure as failure:
        return [str(failure)]
    registry_entries = manifest_registry_paths(manifest, args.manifest, errors)
    all_ids: dict[str, tuple[Path, Mapping[str, Any]]] = {}
    all_references: dict[str, list[str]] = {}
    public_registries: list[tuple[Path, Any, Mapping[str, Any] | None]] = []
    for registry_path, metadata in registry_entries:
        try:
            registry = load_json(registry_path)
        except ValidationFailure as failure:
            errors.append(str(failure))
            continue
        document_type = registry.get("document_type") if isinstance(registry, Mapping) else None
        if document_type not in REGISTRY_DOCUMENT_TYPES:
            public_registries.append((registry_path, registry, metadata))
            continue
        ids, references = validate_concept_registry(registry, registry_path, errors)
        if metadata is not None:
            if metadata.get("id") != registry.get("document_id"):
                error(errors, args.manifest, "$.datasets", f"dataset ID does not match {relative(registry_path)}")
            if metadata.get("document_type") != registry.get("document_type"):
                error(errors, args.manifest, "$.datasets", f"document_type does not match {relative(registry_path)}")
            if metadata.get("record_count") != len(registry.get("records", [])):
                error(errors, args.manifest, "$.datasets", f"record_count does not match {relative(registry_path)}")
            if metadata.get("schema_path") != registry.get("$schema"):
                error(errors, args.manifest, "$.datasets", f"schema_path does not match {relative(registry_path)}")
            completeness = registry.get("completeness")
            if isinstance(completeness, Mapping) and metadata.get("completeness") != completeness.get("level"):
                error(errors, args.manifest, "$.datasets", f"completeness does not match {relative(registry_path)}")
        for concept_id, source in ids.items():
            if concept_id in all_ids:
                prior_path, _ = all_ids[concept_id]
                error(
                    errors,
                    registry_path,
                    "$.records",
                    f"ID {concept_id!r} also exists in {relative(prior_path)}",
                )
            else:
                all_ids[concept_id] = source
        all_references.update(references)

    for registry_path, registry, metadata in public_registries:
        validate_public_api_registry(registry, registry_path, errors, set(all_ids))
        if metadata is not None and isinstance(registry, Mapping):
            if metadata.get("id") != registry.get("document_id"):
                error(errors, args.manifest, "$.datasets", f"dataset ID does not match {relative(registry_path)}")
            if metadata.get("record_count") != len(registry.get("operations", [])):
                error(errors, args.manifest, "$.datasets", f"record_count does not match {relative(registry_path)}")
            if metadata.get("document_type") != registry.get("document_type"):
                error(errors, args.manifest, "$.datasets", f"document_type does not match {relative(registry_path)}")
            if metadata.get("schema_path") != registry.get("$schema"):
                error(errors, args.manifest, "$.datasets", f"schema_path does not match {relative(registry_path)}")
            completeness = registry.get("completeness")
            if isinstance(completeness, Mapping) and metadata.get("completeness") != completeness.get("level"):
                error(errors, args.manifest, "$.datasets", f"completeness does not match {relative(registry_path)}")
    for source_id, references in sorted(all_references.items()):
        for target_id in references:
            if target_id not in all_ids:
                source_path = all_ids.get(source_id, (args.manifest, {}))[0]
                error(
                    errors,
                    source_path,
                    f"record {source_id!r}.related_ids",
                    f"dangling reference {target_id!r}",
                )

    try:
        catalog = load_json(args.catalog)
    except ValidationFailure as failure:
        errors.append(str(failure))
        catalog = {}
    operations = validate_catalog(catalog, args.catalog, errors)
    if isinstance(catalog, Mapping):
        validate_catalog_freshness(
            catalog,
            args.catalog,
            getattr(args, "spec", None),
            errors,
        )
    bindings_document: Mapping[str, Any] | None = None
    try:
        bindings = load_json(args.bindings)
    except ValidationFailure as failure:
        errors.append(str(failure))
    else:
        if isinstance(bindings, Mapping):
            bindings_document = bindings
        validate_bindings(
            bindings,
            args.bindings,
            errors,
            set(all_ids),
            catalog if isinstance(catalog, Mapping) else {},
            operations,
        )
    try:
        plan = load_json(args.change_plan)
    except ValidationFailure as failure:
        errors.append(str(failure))
    else:
        validate_change_plan(
            plan,
            args.change_plan,
            errors,
            set(all_ids),
            catalog if isinstance(catalog, Mapping) else {},
            operations,
            bindings_document,
        )
    return sorted(set(errors))


def main(argv: Iterable[str] | None = None) -> int:
    args = parse_args(argv)
    errors = validate_all(args)
    if errors:
        for item in errors:
            print(f"error: {item}", file=sys.stderr)
        print(f"validation failed: {len(errors)} error(s)", file=sys.stderr)
        return 1
    print(
        "valid: Relution machine-readable registries, catalog state, bindings, "
        "and settings change plan"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
