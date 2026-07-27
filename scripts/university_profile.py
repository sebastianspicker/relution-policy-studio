#!/usr/bin/env python3
"""Validate an inert, institution-neutral university Relution profile.

This validator is intentionally offline and dependency-free.  It validates
design intent, provenance, references, rollout structure, and the hard boundary
between a university proposal and executable Relution target artifacts.  It never
resolves an endpoint, reads credentials, builds a request body, or authorizes a
mutation.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence


SCRIPT_ROOT = Path(__file__).resolve().parent
if str(SCRIPT_ROOT) not in sys.path:
    sys.path.insert(0, str(SCRIPT_ROOT))

from strict_json import load_strict_json  # noqa: E402


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PACKAGE = REPOSITORY_ROOT / "docs/relution/packages/university/desired-state.json"
DEFAULT_MANIFEST = REPOSITORY_ROOT / "docs/relution/registries/manifest.json"
MAX_DOCUMENT_BYTES = 2 * 1024 * 1024

ROOT_KEYS = {
    "$schema",
    "schema_version",
    "document_type",
    "package",
    "provenance",
    "organization_units",
    "locations",
    "functional_cohorts",
    "department_persona_rules",
    "policy_layers",
    "policy_units",
    "group_blueprints",
    "assignment_intents",
    "rollout_rings",
    "api_workflows",
    "activation_gates",
    "commit_boundary",
    "unresolved_inputs",
}
PACKAGE_KEYS = {
    "package_id",
    "institution_code",
    "institution_label",
    "status",
    "evidence_state",
    "sensitivity",
    "execution_capability",
    "execution_authorized",
    "target_contract_required",
    "production_ready",
}
PROVENANCE_KEYS = {
    "authority_order",
    "conflict_rule",
    "applicability_rule",
    "cis_content_policy",
    "sources",
    "control_intents",
}
SOURCE_KEYS = {
    "source_id",
    "authority",
    "authority_rank",
    "title",
    "version",
    "publication_date",
    "content_sha256",
    "mapping_status",
    "status",
    "redistribution",
    "evidence_scope",
}
CONTROL_KEYS = {
    "control_id",
    "title",
    "intent",
    "provenance_chain",
    "platforms",
    "models",
    "unresolved_items",
    "exception_required_if_weakened",
}
ORG_KEYS = {
    "unit_id",
    "parent_unit_id",
    "kind",
    "label",
    "assignment_eligible",
    "person_fields_present",
    "default_location_ids",
    "data_risk",
    "usability_requirements",
}
LOCATION_KEYS = {"location_id", "label", "role", "network_overlay_target_local"}
COHORT_KEYS = {
    "cohort_id",
    "label",
    "purpose",
    "membership_authority",
    "privileged",
    "expiry_required",
    "organization_derived",
    "default_baseline_tier",
    "eligible_models",
    "usability_requirements",
    "prohibited_capabilities",
}
DEPARTMENT_RULE_KEYS = {
    "rule_id",
    "unit_id",
    "default_cohort_id",
    "permitted_cohort_ids",
    "prohibited_cohort_ids",
    "activation_mode",
    "creates_membership",
    "usability_safeguards",
    "approval_requirements",
}
LAYER_KEYS = {"layer_id", "order", "label", "purpose", "assignment_semantics"}
POLICY_KEYS = {
    "policy_id",
    "label",
    "layer_id",
    "platform",
    "models",
    "cohort_ids",
    "control_ids",
    "baseline_tier",
    "impact_tier_floor",
    "concept_ids",
    "intent_settings",
    "payload_mode",
    "workflow_ids",
    "desired_publication_state",
    "activation_state",
    "usability_safeguards",
    "prerequisites",
    "exclusions",
}
INTENT_SETTING_KEYS = {
    "setting_key",
    "desired_outcome",
    "capability_ids",
    "writer_scope",
}
GROUP_KEYS = {
    "group_id",
    "label",
    "group_kind",
    "membership_mode",
    "primary_dimension",
    "values",
    "membership_authority",
    "filter_tree",
    "referenced_group_ids",
    "actions",
    "future_membership_affects_scope",
    "target_contract_required",
    "assignment_eligible",
}
ASSIGNMENT_KEYS = {
    "assignment_id",
    "policy_id",
    "scope_blueprint_id",
    "cohort_ids",
    "model",
    "platform",
    "ring_id",
    "state",
    "requires_published_policy",
    "membership_snapshot_required",
    "impact_tier_floor",
    "notes",
}
RING_KEYS = {
    "ring_id",
    "label",
    "order",
    "promotion_ring",
    "predecessor_ring_id",
    "minimum_business_days",
    "scope_rule",
    "approval_required",
    "scope_mode",
    "target_percentage",
    "minimum_devices",
    "requires_frozen_membership",
    "dynamic_membership_allowed",
    "promotion_requires_new_plan",
    "rollback_thresholds",
}
WORKFLOW_KEYS = {
    "workflow_id",
    "purpose",
    "concept_ids",
    "required_roles",
    "binding_status",
    "mutation_capable",
    "organization_scope_required",
    "exact_target_contract_required",
    "output_plan_granularity",
    "automatic_retry_allowed",
}
GATE_KEYS = {"gate_id", "order", "label", "required_evidence", "status", "blocks"}
COMMIT_BOUNDARY_KEYS = {
    "commit_safe_classes",
    "target_local_classes",
    "forbidden_classes",
    "target_local_root",
}
UNRESOLVED_KEYS = {
    "input_id",
    "description",
    "blocks_gate_ids",
    "resolution_evidence",
    "status",
}

PLATFORMS = {
    "ios_ipados",
    "macos",
    "windows",
    "android_enterprise",
    "cross_platform_outcome",
}
MODELS = {"corp", "byod", "cope", "shared", "kiosk", "privileged"}
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
PROMOTION_CHAIN = {
    "ring.lab": (0, None, 3),
    "ring.pilot": (1, "ring.lab", 5),
    "ring.early": (2, "ring.pilot", 5),
    "ring.broad": (3, "ring.early", 0),
}
NON_PROMOTION_RINGS = {"ring.elevated", "ring.quarantine"}
REQUIRED_GROUP_DIMENSIONS = {
    "platform",
    "model",
    "cohort",
    "ring",
    "compliance",
    "exception",
    "assignment",
}
CONCRETE_PLATFORMS = {"ios_ipados", "macos", "windows", "android_enterprise"}
REQUIRED_WORKFLOW_SUFFIXES = {
    "group.static-lifecycle.v1",
    "group.dynamic-lifecycle.v1",
    "group.membership.v1",
    "policy-definition.v1",
    "policy-publication.v1",
    "policy-assignment.v1",
    "policy-observation.v1",
    "permission-readiness.v1",
}
WORKFLOW_MINIMUM_ROLES_BY_SUFFIX = {
    "group.static-lifecycle.v1": {
        "query", "read", "create", "update", "readback", "audit", "rollback"
    },
    "group.dynamic-lifecycle.v1": {
        "query", "read", "create", "update", "validate", "readback", "audit", "rollback"
    },
    "group.membership.v1": {
        "query", "read", "assign", "unassign", "readback", "audit"
    },
    "policy-definition.v1": {
        "query", "read", "create", "update", "readback", "audit", "rollback"
    },
    "policy-publication.v1": {
        "read", "publish", "status", "readback", "audit", "rollback"
    },
    "policy-assignment.v1": {
        "query", "read", "assign", "unassign", "status", "readback", "audit"
    },
    "policy-observation.v1": {"query", "status", "readback", "audit"},
    "permission-readiness.v1": {"query", "read", "readback", "audit"},
}
MUTATION_BINDING_ROLES = {
    "create", "update", "replace", "patch", "delete", "publish", "assign",
    "unassign", "action",
}
BYOD_PROHIBITIONS = {
    "full_device_wipe",
    "lost_mode",
    "personal_app_inventory",
    "personal_location_collection",
    "device_wide_restrictions",
}
BYOD_ALLOWED_CAPABILITIES = {
    "managed_data_boundary",
    "managed_connectivity",
    "managed_applications",
    "work_access_compliance",
    "selective_work_data_removal",
    "user_enrollment",
    "work_profile",
}
INTENT_SETTING_CONTRACTS = {
    ("approved_applications", "ios_ipados"): (
        frozenset({"managed_applications"}),
        "make only validated supported application changes",
    ),
    ("byod_privacy_boundary", "android_enterprise"): (
        frozenset({"work_profile", "managed_data_boundary", "selective_work_data_removal"}),
        "target-supported work-profile protection without personal-device control",
    ),
    ("byod_privacy_boundary", "ios_ipados"): (
        frozenset({"user_enrollment", "managed_data_boundary", "selective_work_data_removal"}),
        "target-supported user-enrollment protection without personal-device control",
    ),
    ("compliance_access", "cross_platform_outcome"): (
        frozenset({"work_access_compliance"}),
        "use target-supported compliance state only after recovery testing",
    ),
    ("exception_scope", "ios_ipados"): (
        frozenset({"exception_scope"}),
        "narrow, expiry-bound deviation with compensating control",
    ),
    ("management_connectivity", "ios_ipados"): (
        frozenset({"managed_connectivity"}),
        "keep a tested management path",
    ),
    ("persona_controls", "ios_ipados"): (
        frozenset({"persona_controls"}),
        "apply only role-approved sensitive controls",
    ),
    ("platform_baseline", "android_enterprise"): (
        frozenset({"platform_baseline"}),
        "one compatible corporate Android Enterprise baseline writer",
    ),
    ("platform_baseline", "ios_ipados"): (
        frozenset({"platform_baseline"}),
        "one compatible baseline writer per platform",
    ),
    ("platform_baseline", "macos"): (
        frozenset({"platform_baseline"}),
        "one compatible corporate macOS baseline writer",
    ),
    ("platform_baseline", "windows"): (
        frozenset({"platform_baseline"}),
        "one compatible corporate Windows baseline writer",
    ),
    ("privileged_access", "macos"): (
        frozenset({"privileged_access"}),
        "dedicated macOS privileged endpoint with tested recovery",
    ),
    ("privileged_access", "windows"): (
        frozenset({"privileged_access"}),
        "dedicated Windows privileged endpoint with tested recovery",
    ),
    ("sensitive_data_protection", "ios_ipados"): (
        frozenset({"managed_data_protection"}),
        "apply compatible ownership and data safeguards",
    ),
    ("trust_enrollment", "ios_ipados"): (
        frozenset({"trust_enrollment", "management_recovery"}),
        "establish only target-supported enrollment and recovery prerequisites",
    ),
}
RING_MACHINE_RULES = {
    "ring.lab": ("fixed_lab", None, 1, "non-production, inventory-confirmed test scope only"),
    "ring.pilot": ("bounded_pilot", 5, 5, "one approved representative device per platform and use case"),
    "ring.early": ("bounded_early", 20, 1, "small approved reversible cohort"),
    "ring.broad": ("frozen_broad", 100, 1, "explicitly approved inventory-frozen production cohort"),
    "ring.elevated": ("fixed_elevated", None, 1, "separate controlled path for privileged or higher sensitivity"),
    "ring.quarantine": ("fixed_quarantine", None, 1, "containment or remediation only, never a promotion stage"),
}
FORBIDDEN_KEYS = {
    "token",
    "access_token",
    "password",
    "secret",
    "private_key",
    "certificate",
    "cookie",
    "authorization",
    "authorized_origin",
    "effective_api_server",
    "organization_id",
    "target_uuid",
    "target_assignment_id",
    "member_ids",
    "member_count",
    "operation_key",
    "operation_id",
    "request_body",
    "request_body_file",
    "endpoint",
    "hostname",
}
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
    "certificate",
    "certificates",
    "cookie",
    "session",
    "sessionid",
    "authorization",
    "authorizationheader",
    "authorizedorigin",
    "effectiveapiserver",
    "organizationid",
    "targetuuid",
    "targetassignmentid",
    "memberids",
    "membercount",
    "operationkey",
    "operationid",
    "requestbody",
    "requestbodyfile",
    "endpoint",
    "hostname",
}
SECRET_TEXT = re.compile(
    r"(?i)(?:bearer\s+[a-z0-9._~+/=-]+|-----BEGIN [A-Z ]+PRIVATE KEY-----|"
    r"(?:access[_ -]?token|password|client[_ -]?secret)\s*[:=]\s*\S+)"
)
EMAIL = re.compile(r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b")
UUID = re.compile(
    r"(?i)\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b"
)
URL = re.compile(r"(?i)\b(?:https?|ftp)://")
ID_PATTERNS = {
    "source_id": re.compile(r"^source\.[a-z0-9][a-z0-9._-]*$"),
    "control_id": re.compile(r"^control\.[a-z0-9][a-z0-9._-]*$"),
    "unit_id": re.compile(r"^ou\.[a-z0-9][a-z0-9._-]*$"),
    "location_id": re.compile(r"^site\.[a-z0-9][a-z0-9._-]*$"),
    "cohort_id": re.compile(r"^persona\.[a-z0-9][a-z0-9._-]*$"),
    "rule_id": re.compile(r"^rule\.[a-z0-9][a-z0-9._-]*$"),
    "layer_id": re.compile(r"^layer\.[0-7]\.[a-z0-9][a-z0-9._-]*$"),
    "policy_id": re.compile(r"^[a-z0-9][a-z0-9-]*-policy\.[a-z0-9][a-z0-9._-]*$"),
    "group_id": re.compile(r"^grp\.[a-z0-9][a-z0-9._-]*$"),
    "assignment_id": re.compile(r"^assignment\.[a-z0-9][a-z0-9._-]*$"),
    "ring_id": re.compile(r"^ring\.[a-z0-9][a-z0-9._-]*$"),
    "workflow_id": re.compile(r"^[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9._-]*\.v1$"),
    "gate_id": re.compile(r"^G(?:[0-9]|10)_[A-Z][A-Z0-9_]*$"),
    "input_id": re.compile(r"^input\.[a-z0-9][a-z0-9._-]*$"),
}


def load_json(path: Path) -> Any:
    return load_strict_json(path, max_bytes=MAX_DOCUMENT_BYTES)[0]


def add(errors: list[str], location: str, message: str) -> None:
    errors.append(f"{location}: {message}")


def mapping(value: Any, errors: list[str], location: str) -> Mapping[str, Any] | None:
    if not isinstance(value, Mapping):
        add(errors, location, "must be an object")
        return None
    return value


def array(value: Any, errors: list[str], location: str) -> list[Any]:
    if not isinstance(value, list):
        add(errors, location, "must be an array")
        return []
    return value


def exact_keys(value: Mapping[str, Any], expected: set[str], errors: list[str], location: str) -> None:
    missing = sorted(expected - set(value))
    unknown = sorted(set(value) - expected)
    if missing:
        add(errors, location, f"missing keys: {', '.join(missing)}")
    if unknown:
        add(errors, location, f"unknown keys: {', '.join(unknown)}")


def string_list(value: Any, errors: list[str], location: str, *, nonempty: bool = False) -> list[str]:
    items = array(value, errors, location)
    if nonempty and not items:
        add(errors, location, "must not be empty")
    strings: list[str] = []
    for index, item in enumerate(items):
        if not isinstance(item, str) or not item:
            add(errors, f"{location}[{index}]", "must be a non-empty string")
        else:
            strings.append(item)
    duplicates = sorted({item for item in strings if strings.count(item) > 1})
    if duplicates:
        add(errors, location, f"duplicate values: {', '.join(duplicates)}")
    return strings


def records(
    root: Mapping[str, Any],
    field: str,
    expected_keys: set[str],
    id_field: str,
    errors: list[str],
) -> tuple[list[Mapping[str, Any]], dict[str, Mapping[str, Any]]]:
    result: list[Mapping[str, Any]] = []
    indexed: dict[str, Mapping[str, Any]] = {}
    for index, raw in enumerate(array(root.get(field), errors, f"$.{field}")):
        location = f"$.{field}[{index}]"
        item = mapping(raw, errors, location)
        if item is None:
            continue
        exact_keys(item, expected_keys, errors, location)
        identifier = item.get(id_field)
        if not isinstance(identifier, str) or not identifier:
            add(errors, f"{location}.{id_field}", "must be a non-empty string")
        elif id_field in ID_PATTERNS and ID_PATTERNS[id_field].fullmatch(identifier) is None:
            add(errors, f"{location}.{id_field}", "does not match its stable ID namespace")
        elif identifier in indexed:
            add(errors, f"{location}.{id_field}", f"duplicate ID {identifier!r}")
        else:
            indexed[identifier] = item
        result.append(item)
    return result, indexed


def require_reference(
    value: Any,
    known: Mapping[str, Any] | set[str],
    errors: list[str],
    location: str,
) -> None:
    if not isinstance(value, str) or value not in known:
        add(errors, location, f"unresolved reference {value!r}")


def require_references(
    value: Any,
    known: Mapping[str, Any] | set[str],
    errors: list[str],
    location: str,
    *,
    nonempty: bool = False,
) -> list[str]:
    values = string_list(value, errors, location, nonempty=nonempty)
    for item in values:
        require_reference(item, known, errors, location)
    return values


def validate_acyclic(
    graph: Mapping[str, Sequence[str]], errors: list[str], location: str
) -> None:
    state: dict[str, int] = {}
    for start in graph:
        if state.get(start, 0) != 0:
            continue
        state[start] = 1
        path = [start]
        positions = {start: 0}
        frames: list[tuple[str, Any]] = [(start, iter(graph.get(start, ())))]
        while frames:
            node, targets = frames[-1]
            try:
                target = next(targets)
            except StopIteration:
                frames.pop()
                state[node] = 2
                positions.pop(node, None)
                path.pop()
                continue
            if target == node:
                add(errors, location, f"self-reference {node!r}")
                continue
            if target not in graph:
                continue
            marker = state.get(target, 0)
            if marker == 1:
                cycle_start = positions.get(target, 0)
                add(
                    errors,
                    location,
                    "dependency cycle: " + " -> ".join(path[cycle_start:] + [target]),
                )
            elif marker == 0:
                state[target] = 1
                positions[target] = len(path)
                path.append(target)
                frames.append((target, iter(graph.get(target, ()))))


def scan_commit_boundary(
    value: Any, errors: list[str], location: str = "$", depth: int = 0
) -> None:
    if depth > 40:
        add(errors, location, "nesting exceeds the 40-level safety bound")
        return
    if isinstance(value, Mapping):
        for key, item in value.items():
            normalized_key = re.sub(r"[^a-z0-9]", "", key.lower())
            if key.lower() in FORBIDDEN_KEYS or normalized_key in FORBIDDEN_NORMALIZED_KEYS:
                add(errors, f"{location}.{key}", "target, executable, or sensitive field is forbidden")
            scan_commit_boundary(item, errors, f"{location}.{key}", depth + 1)
    elif isinstance(value, list):
        for index, item in enumerate(value):
            scan_commit_boundary(item, errors, f"{location}[{index}]", depth + 1)
    elif isinstance(value, str):
        if SECRET_TEXT.search(value):
            add(errors, location, "looks like secret or credential material")
        if EMAIL.search(value):
            add(errors, location, "person or contact email is forbidden")
        if UUID.search(value):
            add(errors, location, "target-like UUID is forbidden")
        if URL.search(value):
            add(errors, location, "network URLs are forbidden in the commit-safe package")
        if value.startswith("/") or re.match(r"^[A-Za-z]:[\\/]", value):
            add(errors, location, "absolute filesystem paths are forbidden")


def concept_ids_from_manifest(manifest_path: Path, errors: list[str]) -> set[str]:
    try:
        manifest = load_json(manifest_path)
    except ValueError as exc:
        errors.append(str(exc))
        return set()
    root = mapping(manifest, errors, "manifest.$")
    if root is None:
        return set()
    try:
        manifest_root = manifest_path.parent.resolve(strict=True)
    except OSError as exc:
        errors.append(f"{manifest_path.parent}: cannot resolve manifest directory: {exc}")
        return set()
    known: set[str] = set()
    for index, entry in enumerate(array(root.get("datasets"), errors, "manifest.$.datasets")):
        if not isinstance(entry, Mapping):
            continue
        if entry.get("document_type") not in {
            "feature_registry",
            "setting_registry",
            "policy_registry",
            "group_registry",
        }:
            continue
        relative_path = entry.get("file")
        if not isinstance(relative_path, str) or not relative_path:
            add(errors, f"manifest.$.datasets[{index}].file", "must be a non-empty string")
            continue
        registry_relative = Path(relative_path)
        if registry_relative.is_absolute() or ".." in registry_relative.parts:
            add(errors, f"manifest.$.datasets[{index}].file", "must be a contained relative path without '..'")
            continue
        registry_candidate = manifest_path.parent
        symlink_component: Path | None = None
        for component in registry_relative.parts:
            registry_candidate = registry_candidate / component
            if registry_candidate.is_symlink():
                symlink_component = registry_candidate
                break
        if symlink_component is not None:
            add(errors, f"manifest.$.datasets[{index}].file", f"symlinked path component is forbidden: {symlink_component}")
            continue
        try:
            registry_path = (manifest_path.parent / registry_relative).resolve(strict=True)
        except OSError as exc:
            add(errors, f"manifest.$.datasets[{index}].file", f"cannot resolve regular registry file: {exc}")
            continue
        if not registry_path.is_relative_to(manifest_root):
            add(errors, f"manifest.$.datasets[{index}].file", "resolves outside the manifest directory")
            continue
        try:
            registry = load_json(registry_path)
        except ValueError as exc:
            errors.append(str(exc))
            continue
        if not isinstance(registry, Mapping):
            continue
        for record in registry.get("records", []):
            if isinstance(record, Mapping) and isinstance(record.get("id"), str):
                known.add(record["id"])
    return known


def validate_package(document: Any, concept_ids: set[str]) -> list[str]:
    errors: list[str] = []
    root = mapping(document, errors, "$")
    if root is None:
        return errors
    exact_keys(root, ROOT_KEYS, errors, "$")
    if root.get("schema_version") != "1.0.0":
        add(errors, "$.schema_version", "must equal '1.0.0'")
    document_type = root.get("document_type")
    if document_type != "relution-university-offline-desired-state":
        add(errors, "$.document_type", "must identify the inert university desired-state format")
    profile_name = "university"
    expected_schema = "urn:campusweave-relution:schema:university-profile:1.0.0"
    schema_ref = root.get("$schema")
    if schema_ref != expected_schema:
        add(errors, "$.$schema", f"must reference {expected_schema}")

    package = mapping(root.get("package"), errors, "$.package")
    institution_code = ""
    if package is not None:
        exact_keys(package, PACKAGE_KEYS, errors, "$.package")
        candidate_code = package.get("institution_code")
        if (
            not isinstance(candidate_code, str)
            or len(candidate_code) > 48
            or not re.fullmatch(r"[a-z0-9][a-z0-9-]*", candidate_code)
        ):
            add(errors, "$.package.institution_code", "must be a lowercase institution namespace of at most 48 characters")
        else:
            institution_code = candidate_code
        expected = {
            "package_id": f"{institution_code}-relution-desired-state-v1",
            "status": "PROPOSED",
            "evidence_state": "NOT_EVIDENCED",
            "sensitivity": "public_design_no_target_data",
            "execution_capability": "none",
            "execution_authorized": False,
            "target_contract_required": True,
            "production_ready": False,
        }
        for field, expected_value in expected.items():
            if package.get(field) != expected_value:
                add(errors, f"$.package.{field}", f"must equal {expected_value!r}")
        institution_label = package.get("institution_label")
        if (
            not isinstance(institution_label, str)
            or not institution_label
            or institution_label.strip() != institution_label
            or len(institution_label) > 200
        ):
            add(
                errors,
                "$.package.institution_label",
                "must be a trimmed, non-empty institutional label of at most 200 characters",
            )

    provenance = mapping(root.get("provenance"), errors, "$.provenance")
    sources: list[Mapping[str, Any]] = []
    source_index: dict[str, Mapping[str, Any]] = {}
    controls: list[Mapping[str, Any]] = []
    control_index: dict[str, Mapping[str, Any]] = {}
    if provenance is not None:
        exact_keys(provenance, PROVENANCE_KEYS, errors, "$.provenance")
        if provenance.get("authority_order") != ["bsi", "cis", "vendor"]:
            add(errors, "$.provenance.authority_order", "must be exactly BSI, CIS, vendor")
        constants = {
            "conflict_rule": "higher_authority_controls",
            "applicability_rule": "unsupported_vendor_capability_becomes_gap_not_override",
            "cis_content_policy": "metadata_and_control_refs_only",
        }
        for field, expected_value in constants.items():
            if provenance.get(field) != expected_value:
                add(errors, f"$.provenance.{field}", f"must equal {expected_value!r}")
        pseudo_root = dict(root)
        pseudo_root["sources"] = provenance.get("sources")
        pseudo_root["control_intents"] = provenance.get("control_intents")
        sources, source_index = records(pseudo_root, "sources", SOURCE_KEYS, "source_id", errors)
        controls, control_index = records(pseudo_root, "control_intents", CONTROL_KEYS, "control_id", errors)

    authority_rank = {"bsi": 1, "cis": 2, "vendor": 3}
    seen_authorities: set[str] = set()
    for index, source in enumerate(sources):
        location = f"$.provenance.sources[{index}]"
        authority = source.get("authority")
        seen_authorities.add(authority) if isinstance(authority, str) else None
        if authority not in authority_rank:
            add(errors, f"{location}.authority", "must be bsi, cis, or vendor")
        elif source.get("authority_rank") != authority_rank[authority]:
            add(errors, f"{location}.authority_rank", "does not match the authority rank")
        if source.get("status") not in {
            "documented",
            "licensed_local_reference",
            "applicability_pending",
        }:
            add(errors, f"{location}.status", "is not an allowed evidence status")
        if source.get("mapping_status") not in {
            "unresolved",
            "metadata_only",
            "verified_local",
        }:
            add(errors, f"{location}.mapping_status", "is not an allowed mapping status")
        publication_date = source.get("publication_date")
        if publication_date is not None and (
            not isinstance(publication_date, str)
            or re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", publication_date) is None
        ):
            add(errors, f"{location}.publication_date", "must be YYYY-MM-DD or null")
        content_sha256 = source.get("content_sha256")
        if content_sha256 is not None and (
            not isinstance(content_sha256, str)
            or re.fullmatch(r"[0-9a-f]{64}", content_sha256) is None
        ):
            add(errors, f"{location}.content_sha256", "must be a lowercase SHA-256 or null")
        if source.get("mapping_status") == "verified_local" and (
            publication_date is None
            or content_sha256 is None
            or not isinstance(source.get("version"), str)
            or not source["version"]
        ):
            add(errors, location, "verified source mapping requires version, publication date, and content SHA-256")
        if source.get("redistribution") not in {
            "public_metadata_only",
            "no_benchmark_body",
        }:
            add(errors, f"{location}.redistribution", "is not an allowed redistribution class")
        if authority == "cis" and source.get("redistribution") != "no_benchmark_body":
            add(errors, f"{location}.redistribution", "CIS content must remain metadata/reference only")
    if seen_authorities != set(authority_rank):
        add(errors, "$.provenance.sources", "must include BSI, CIS, and vendor source metadata")

    for index, control in enumerate(controls):
        location = f"$.provenance.control_intents[{index}]"
        chain = require_references(
            control.get("provenance_chain"), source_index, errors, f"{location}.provenance_chain", nonempty=True
        )
        raw_ranks = [source_index[item].get("authority_rank") for item in chain if item in source_index]
        ranks = [rank for rank in raw_ranks if isinstance(rank, int) and not isinstance(rank, bool)]
        if ranks and ranks[0] != 1:
            add(errors, f"{location}.provenance_chain", "must start with BSI authority")
        if len(ranks) != len(raw_ranks) or ranks != sorted(set(ranks)):
            add(errors, f"{location}.provenance_chain", "must follow strictly increasing BSI, CIS, vendor precedence")
        platforms = string_list(control.get("platforms"), errors, f"{location}.platforms", nonempty=True)
        models = string_list(control.get("models"), errors, f"{location}.models", nonempty=True)
        if set(platforms) - PLATFORMS:
            add(errors, f"{location}.platforms", "contains an unknown platform")
        if set(models) - MODELS:
            add(errors, f"{location}.models", "contains an unknown device model")
        string_list(control.get("unresolved_items"), errors, f"{location}.unresolved_items")
        if control.get("exception_required_if_weakened") is not True:
            add(errors, f"{location}.exception_required_if_weakened", "must be true")

    locations, location_index = records(root, "locations", LOCATION_KEYS, "location_id", errors)
    for index, location_record in enumerate(locations):
        if location_record.get("role") not in {
            "primary",
            "campus",
            "administrative",
            "service",
        }:
            add(errors, f"$.locations[{index}].role", "is not an allowed location role")
        if location_record.get("network_overlay_target_local") is not True:
            add(errors, f"$.locations[{index}].network_overlay_target_local", "must be true")

    org_units, org_index = records(root, "organization_units", ORG_KEYS, "unit_id", errors)
    roots: list[str] = []
    org_graph: dict[str, list[str]] = {}
    for index, unit in enumerate(org_units):
        location = f"$.organization_units[{index}]"
        unit_id = unit.get("unit_id")
        parent = unit.get("parent_unit_id")
        if isinstance(unit_id, str):
            org_graph[unit_id] = [parent] if isinstance(parent, str) else []
        if parent is None and isinstance(unit_id, str):
            roots.append(unit_id)
        elif parent is not None:
            require_reference(parent, org_index, errors, f"{location}.parent_unit_id")
        require_references(unit.get("default_location_ids"), location_index, errors, f"{location}.default_location_ids")
        if unit.get("kind") not in {
            "institution",
            "leadership",
            "staff",
            "department",
            "central_unit",
            "library",
            "statutory_function",
        }:
            add(errors, f"{location}.kind", "is not an allowed institutional unit kind")
        if unit.get("data_risk") not in {
            "general",
            "confidential",
            "sensitive_personal",
            "financial",
            "operational",
            "privileged",
            "mixed",
        }:
            add(errors, f"{location}.data_risk", "is not an allowed data-risk class")
        if not isinstance(unit.get("assignment_eligible"), bool):
            add(errors, f"{location}.assignment_eligible", "must be Boolean")
        if unit.get("person_fields_present") is not False:
            add(errors, f"{location}.person_fields_present", "must be false")
        string_list(unit.get("usability_requirements"), errors, f"{location}.usability_requirements", nonempty=True)
    if institution_code and roots != [f"ou.{institution_code}"]:
        add(errors, "$.organization_units", f"must have exactly one institutional root 'ou.{institution_code}'")
    validate_acyclic(org_graph, errors, "$.organization_units")

    cohorts, cohort_index = records(root, "functional_cohorts", COHORT_KEYS, "cohort_id", errors)
    if "persona.standard_office" not in cohort_index:
        add(errors, "$.functional_cohorts", "must define persona.standard_office")
    for index, cohort in enumerate(cohorts):
        location = f"$.functional_cohorts[{index}]"
        models = string_list(cohort.get("eligible_models"), errors, f"{location}.eligible_models", nonempty=True)
        if set(models) - MODELS:
            add(errors, f"{location}.eligible_models", "contains an unknown device model")
        baseline = cohort.get("default_baseline_tier")
        if not isinstance(baseline, int) or isinstance(baseline, bool) or baseline not in {1, 2, 3}:
            add(errors, f"{location}.default_baseline_tier", "must be an REXP baseline tier 1, 2, or 3")
        if baseline == 1 and not (
            cohort.get("privileged") is True or set(models).issubset({"kiosk", "privileged"})
        ):
            add(errors, f"{location}.default_baseline_tier", "Tier 1 is limited to privileged or dedicated kiosk cohorts")
        if cohort.get("privileged") is True and cohort.get("expiry_required") is not True:
            add(errors, f"{location}.expiry_required", "privileged cohort membership must expire")
        if cohort.get("membership_authority") not in {
            "asset_purpose_register",
            "approved_service_register",
        }:
            add(errors, f"{location}.membership_authority", "must be an approved purpose/service register")
        for field in ("privileged", "expiry_required"):
            if not isinstance(cohort.get(field), bool):
                add(errors, f"{location}.{field}", "must be Boolean")
        if cohort.get("organization_derived") is not False:
            add(errors, f"{location}.organization_derived", "department membership must never create a device persona")
        prohibitions = set(string_list(cohort.get("prohibited_capabilities"), errors, f"{location}.prohibited_capabilities"))
        if "byod" in models and not BYOD_PROHIBITIONS.issubset(prohibitions):
            add(errors, f"{location}.prohibited_capabilities", "BYOD must prohibit device-wide and personal-data capabilities")

    rules, _ = records(root, "department_persona_rules", DEPARTMENT_RULE_KEYS, "rule_id", errors)
    covered_units: set[str] = set()
    for index, rule in enumerate(rules):
        location = f"$.department_persona_rules[{index}]"
        unit_id = rule.get("unit_id")
        require_reference(unit_id, org_index, errors, f"{location}.unit_id")
        if isinstance(unit_id, str):
            if unit_id in covered_units:
                add(errors, f"{location}.unit_id", "must have only one persona rule per unit")
            covered_units.add(unit_id)
        permitted = set(require_references(rule.get("permitted_cohort_ids"), cohort_index, errors, f"{location}.permitted_cohort_ids", nonempty=True))
        prohibited = set(require_references(rule.get("prohibited_cohort_ids"), cohort_index, errors, f"{location}.prohibited_cohort_ids"))
        if rule.get("default_cohort_id") != "persona.standard_office":
            add(errors, f"{location}.default_cohort_id", "must be persona.standard_office")
        if "persona.standard_office" not in permitted:
            add(errors, f"{location}.permitted_cohort_ids", "must include the non-activating standard office review default")
        overlap = sorted(permitted & prohibited)
        if overlap:
            add(errors, location, f"permitted and prohibited cohorts overlap: {', '.join(overlap)}")
        if rule.get("activation_mode") != "review_required" or rule.get("creates_membership") is not False:
            add(errors, location, "organizational placement may recommend review but must not create membership")
        string_list(rule.get("usability_safeguards"), errors, f"{location}.usability_safeguards", nonempty=True)
        string_list(rule.get("approval_requirements"), errors, f"{location}.approval_requirements", nonempty=True)

    layers, layer_index = records(root, "policy_layers", LAYER_KEYS, "layer_id", errors)
    layer_orders = [item.get("order") for item in layers]
    if sorted(item for item in layer_orders if isinstance(item, int) and not isinstance(item, bool)) != list(range(8)):
        add(errors, "$.policy_layers", "must contain each REXP layer order 0 through 7 exactly once")
    for index, layer in enumerate(layers):
        order = layer.get("order")
        if not isinstance(order, int) or isinstance(order, bool) or order not in range(8):
            add(errors, f"$.policy_layers[{index}].order", "must be an integer from 0 through 7")

    workflows, workflow_index = records(root, "api_workflows", WORKFLOW_KEYS, "workflow_id", errors)
    required_workflows = {
        f"{institution_code}.{suffix}" for suffix in REQUIRED_WORKFLOW_SUFFIXES
    }
    missing_workflows = sorted(required_workflows - set(workflow_index))
    if missing_workflows:
        add(errors, "$.api_workflows", f"missing required {profile_name} workflows: {', '.join(missing_workflows)}")
    for index, workflow in enumerate(workflows):
        location = f"$.api_workflows[{index}]"
        require_references(workflow.get("concept_ids"), concept_ids, errors, f"{location}.concept_ids", nonempty=True)
        roles = set(string_list(workflow.get("required_roles"), errors, f"{location}.required_roles", nonempty=True))
        unknown_roles = roles - BINDING_ROLES
        if unknown_roles:
            add(errors, f"{location}.required_roles", f"unknown binding roles: {', '.join(sorted(unknown_roles))}")
        invariants = {
            "binding_status": "target_contract_required",
            "organization_scope_required": True,
            "exact_target_contract_required": True,
            "output_plan_granularity": "one_resource_one_organization",
            "automatic_retry_allowed": False,
        }
        for field, expected_value in invariants.items():
            if workflow.get(field) != expected_value:
                add(errors, f"{location}.{field}", f"must equal {expected_value!r}")
        workflow_id = workflow.get("workflow_id")
        workflow_suffix = (
            workflow_id[len(institution_code) + 1:]
            if isinstance(workflow_id, str) and institution_code and workflow_id.startswith(f"{institution_code}.")
            else ""
        )
        if institution_code and isinstance(workflow_id, str) and not workflow_id.startswith(f"{institution_code}."):
            add(errors, f"{location}.workflow_id", f"must use the {institution_code!r} institution namespace")
        minimum_roles = WORKFLOW_MINIMUM_ROLES_BY_SUFFIX.get(workflow_suffix, set())
        missing_roles = sorted(minimum_roles - roles)
        if missing_roles:
            add(errors, f"{location}.required_roles", f"workflow lacks required roles: {', '.join(missing_roles)}")
        if workflow.get("mutation_capable") is True:
            missing = {"read", "readback", "audit"} - roles
            if missing:
                add(errors, f"{location}.required_roles", f"mutation workflow lacks {', '.join(sorted(missing))}")
            if not roles.intersection(MUTATION_BINDING_ROLES):
                add(errors, f"{location}.required_roles", "mutation-capable workflow must declare a mutation role")
            if not roles.intersection({"rollback", "unassign"}):
                add(errors, f"{location}.required_roles", "mutation workflow needs rollback or an explicit compensating role")
        elif workflow.get("mutation_capable") is not False:
            add(errors, f"{location}.mutation_capable", "must be Boolean")

    policies, policy_index = records(root, "policy_units", POLICY_KEYS, "policy_id", errors)
    effective_setting_writers: dict[tuple[str, str, str, str], str] = {}
    effective_capability_writers: dict[tuple[str, str, str, str], str] = {}
    corporate_baseline_platforms: set[str] = set()
    byod_platforms: set[str] = set()
    privileged_platforms: set[str] = set()
    covered_policy_layers: set[int] = set()
    for index, policy in enumerate(policies):
        location = f"$.policy_units[{index}]"
        policy_id = policy.get("policy_id")
        if institution_code and isinstance(policy_id, str) and not policy_id.startswith(f"{institution_code}-policy."):
            add(errors, f"{location}.policy_id", f"must use the {institution_code!r}-policy namespace")
        layer_id = policy.get("layer_id")
        require_reference(layer_id, layer_index, errors, f"{location}.layer_id")
        platform = policy.get("platform")
        if platform not in PLATFORMS:
            add(errors, f"{location}.platform", "is unknown")
        if platform == "cross_platform_outcome":
            layer = layer_index.get(layer_id) if isinstance(layer_id, str) else None
            if not isinstance(layer, Mapping) or layer.get("order") != 6:
                add(errors, f"{location}.platform", "cross-platform outcomes are allowed only at layer 6")
        models = string_list(policy.get("models"), errors, f"{location}.models", nonempty=True)
        if set(models) - MODELS:
            add(errors, f"{location}.models", "contains an unknown device model")
        if "byod" in models and len(models) != 1:
            add(errors, f"{location}.models", "BYOD policy units must be isolated from corporate/device-owner models")
        layer = layer_index.get(layer_id) if isinstance(layer_id, str) else None
        if isinstance(layer, Mapping) and isinstance(layer.get("order"), int):
            covered_policy_layers.add(layer["order"])
        if (
            platform in CONCRETE_PLATFORMS
            and "corp" in models
            and isinstance(layer, Mapping)
            and layer.get("order") == 1
        ):
            corporate_baseline_platforms.add(str(platform))
        if platform in CONCRETE_PLATFORMS and "byod" in models:
            byod_platforms.add(str(platform))
        if platform in CONCRETE_PLATFORMS and "privileged" in models:
            privileged_platforms.add(str(platform))
        cohorts_for_policy = require_references(
            policy.get("cohort_ids"), cohort_index, errors, f"{location}.cohort_ids", nonempty=True
        )
        for cohort_id in cohorts_for_policy:
            eligible = cohort_index.get(cohort_id, {}).get("eligible_models")
            eligible_models = set(eligible) if isinstance(eligible, list) else set()
            if not set(models).issubset(eligible_models):
                add(errors, f"{location}.cohort_ids", f"{cohort_id!r} is not eligible for every declared policy model")
        require_references(policy.get("control_ids"), control_index, errors, f"{location}.control_ids", nonempty=True)
        policy_concepts = require_references(
            policy.get("concept_ids"), concept_ids, errors, f"{location}.concept_ids", nonempty=True
        )
        policy_workflows = require_references(
            policy.get("workflow_ids"), workflow_index, errors, f"{location}.workflow_ids", nonempty=True
        )
        if f"{institution_code}.policy-lifecycle.v1" in policy_workflows:
            add(errors, f"{location}.workflow_ids", "generic lifecycle workflow is forbidden; definition, publication, and assignment stay separate")
        if any(concept.startswith("policy.") for concept in policy_concepts) and f"{institution_code}.policy-definition.v1" not in policy_workflows:
            add(errors, f"{location}.workflow_ids", "policy intent must use the dedicated definition workflow")
        if "policy.lifecycle.versioning_publication" in policy_concepts and f"{institution_code}.policy-publication.v1" not in policy_workflows:
            add(errors, f"{location}.workflow_ids", "publication concept requires the dedicated publication workflow")
        if "policy.assignment.device_group" in policy_concepts and f"{institution_code}.policy-assignment.v1" not in policy_workflows:
            add(errors, f"{location}.workflow_ids", "assignment concept requires the dedicated assignment workflow")
        baseline = policy.get("baseline_tier")
        impact = policy.get("impact_tier_floor")
        if not isinstance(baseline, int) or isinstance(baseline, bool) or baseline not in {1, 2, 3}:
            add(errors, f"{location}.baseline_tier", "must be an REXP baseline tier 1, 2, or 3")
        if not isinstance(impact, int) or isinstance(impact, bool) or impact not in {0, 1, 2, 3, 4}:
            add(errors, f"{location}.impact_tier_floor", "must be a Relution mutation impact floor 0 through 4")
        elif impact < 2:
            add(errors, f"{location}.impact_tier_floor", "policy publication/assignment intent cannot be below impact Tier 2")
        if baseline == 1 and not (
            set(models).issubset({"kiosk", "privileged"})
            or any(cohort_index.get(cohort_id, {}).get("privileged") is True for cohort_id in cohorts_for_policy)
        ):
            add(errors, f"{location}.baseline_tier", "Tier 1 policy is not limited to privileged or dedicated scope")
        invariants = {
            "payload_mode": "target_contract_required",
            "desired_publication_state": "unpublished",
            "activation_state": "inactive",
        }
        for field, expected_value in invariants.items():
            if policy.get(field) != expected_value:
                add(errors, f"{location}.{field}", f"must equal {expected_value!r}")
        settings = array(policy.get("intent_settings"), errors, f"{location}.intent_settings")
        if not settings:
            add(errors, f"{location}.intent_settings", "must contain abstract desired outcomes")
        for setting_index, raw_setting in enumerate(settings):
            setting_location = f"{location}.intent_settings[{setting_index}]"
            setting = mapping(raw_setting, errors, setting_location)
            if setting is None:
                continue
            exact_keys(setting, INTENT_SETTING_KEYS, errors, setting_location)
            setting_key = setting.get("setting_key")
            writer_scope = setting.get("writer_scope")
            if not isinstance(setting_key, str) or not setting_key:
                add(errors, f"{setting_location}.setting_key", "must be a stable abstract key")
                continue
            if not isinstance(writer_scope, str) or not writer_scope.startswith("writer."):
                add(errors, f"{setting_location}.writer_scope", "must name one explicit writer scope")
            capability_ids = set(
                string_list(
                    setting.get("capability_ids"),
                    errors,
                    f"{setting_location}.capability_ids",
                    nonempty=True,
                )
            )
            invalid_capability_ids = sorted(
                item
                for item in capability_ids
                if re.fullmatch(r"[a-z][a-z0-9_]*", item) is None
            )
            if invalid_capability_ids:
                add(errors, f"{setting_location}.capability_ids", f"invalid stable capability IDs: {', '.join(invalid_capability_ids)}")
            setting_contract = INTENT_SETTING_CONTRACTS.get(
                (setting_key, platform if isinstance(platform, str) else "")
            )
            if setting_contract is None:
                add(
                    errors,
                    f"{setting_location}.setting_key",
                    f"has no canonical {profile_name} capability contract for this platform",
                )
            else:
                expected_capabilities, expected_outcome = setting_contract
                if capability_ids != expected_capabilities:
                    add(
                        errors,
                        f"{setting_location}.capability_ids",
                        "must equal the canonical capability set for setting_key and platform",
                    )
                if setting.get("desired_outcome") != expected_outcome:
                    add(
                        errors,
                        f"{setting_location}.desired_outcome",
                        "must equal the canonical non-authoritative summary for setting_key and platform",
                    )
            if "byod" in models:
                prohibited = sorted(capability_ids & BYOD_PROHIBITIONS)
                if prohibited:
                    add(errors, f"{setting_location}.capability_ids", f"BYOD intent requests prohibited capabilities: {', '.join(prohibited)}")
                unsupported = sorted(capability_ids - BYOD_ALLOWED_CAPABILITIES)
                if unsupported:
                    add(errors, f"{setting_location}.capability_ids", f"BYOD intent uses capabilities outside the privacy allowlist: {', '.join(unsupported)}")
            for model in models:
                for cohort_id in cohorts_for_policy:
                    effective_key = (str(platform), model, cohort_id, setting_key)
                    previous = effective_setting_writers.get(effective_key)
                    if previous is not None:
                        add(errors, setting_location, f"effective setting already has writer {previous!r}")
                    else:
                        effective_setting_writers[effective_key] = str(writer_scope)
                    for capability_id in capability_ids:
                        capability_key = (str(platform), model, cohort_id, capability_id)
                        previous = effective_capability_writers.get(capability_key)
                        if previous is not None:
                            add(errors, setting_location, f"effective capability already has writer {previous!r}")
                        else:
                            effective_capability_writers[capability_key] = str(writer_scope)
        string_list(policy.get("usability_safeguards"), errors, f"{location}.usability_safeguards", nonempty=True)
        exclusions = string_list(policy.get("exclusions"), errors, f"{location}.exclusions")
        if "byod" in models and not any("device-wide" in item.lower() or "personal" in item.lower() for item in exclusions):
            add(errors, f"{location}.exclusions", "BYOD policy must explicitly exclude device-wide or personal scope")

    if corporate_baseline_platforms != CONCRETE_PLATFORMS:
        missing = sorted(CONCRETE_PLATFORMS - corporate_baseline_platforms)
        add(errors, "$.policy_units", f"missing Tier-2 corporate platform baselines: {', '.join(missing)}")
    required_byod = {"ios_ipados", "android_enterprise"}
    if not required_byod.issubset(byod_platforms):
        add(errors, "$.policy_units", f"missing privacy-bound BYOD policy units: {', '.join(sorted(required_byod - byod_platforms))}")
    required_privileged = {"macos", "windows"}
    if not required_privileged.issubset(privileged_platforms):
        add(errors, "$.policy_units", f"missing dedicated privileged policy units: {', '.join(sorted(required_privileged - privileged_platforms))}")
    if covered_policy_layers != set(range(8)):
        add(errors, "$.policy_units", f"missing policy intent for layers: {', '.join(str(item) for item in sorted(set(range(8)) - covered_policy_layers))}")

    groups, group_index = records(root, "group_blueprints", GROUP_KEYS, "group_id", errors)
    dimensions: set[str] = set()
    group_graph: dict[str, list[str]] = {}
    assignable_groups: set[str] = set()
    for index, group in enumerate(groups):
        location = f"$.group_blueprints[{index}]"
        dimension = group.get("primary_dimension")
        if isinstance(dimension, str):
            dimensions.add(dimension)
        references = require_references(group.get("referenced_group_ids"), group_index, errors, f"{location}.referenced_group_ids")
        group_id = group.get("group_id")
        if isinstance(group_id, str):
            group_graph[group_id] = references
        actions = array(group.get("actions"), errors, f"{location}.actions")
        if actions:
            add(errors, f"{location}.actions", f"initial {profile_name} group blueprints may not contain actions")
        if group.get("target_contract_required") is not True:
            add(errors, f"{location}.target_contract_required", "must be true")
        if group.get("assignment_eligible") is True:
            if dimension != "assignment" or group.get("group_kind") != "assignment_scope":
                add(errors, f"{location}.assignment_eligible", "only assignment-scope intersections may receive policies")
            elif isinstance(group_id, str):
                assignable_groups.add(group_id)
        if group.get("membership_mode") == "dynamic" and group.get("future_membership_affects_scope") is not True:
            add(errors, f"{location}.future_membership_affects_scope", "dynamic scope must acknowledge future membership")
        if group.get("group_kind") not in {
            "primitive",
            "assignment_scope",
            "compliance_state",
            "exception",
        }:
            add(errors, f"{location}.group_kind", "is not an allowed group blueprint kind")
        if group.get("membership_mode") not in {
            "static",
            "dynamic",
            "target_contract_required",
        }:
            add(errors, f"{location}.membership_mode", "is not an allowed membership mode")
        if dimension not in REQUIRED_GROUP_DIMENSIONS:
            add(errors, f"{location}.primary_dimension", "is not an allowed group dimension")
        if group.get("membership_authority") not in {
            "device_inventory",
            "asset_purpose_register",
            "explicit_ring_register",
            "compliance_observation",
            "approved_exception_register",
            "boolean_intersection",
            "target_contract_required",
        }:
            add(errors, f"{location}.membership_authority", "is not an allowed source of group membership")
        if group.get("filter_tree") is not None and not isinstance(group.get("filter_tree"), Mapping):
            add(errors, f"{location}.filter_tree", "must be an object or null")
        for field in ("future_membership_affects_scope", "assignment_eligible"):
            if not isinstance(group.get(field), bool):
                add(errors, f"{location}.{field}", "must be Boolean")
        values = set(string_list(group.get("values"), errors, f"{location}.values", nonempty=True))
        if dimension == "platform" and values != CONCRETE_PLATFORMS:
            add(errors, f"{location}.values", "must enumerate all four concrete platform families")
        if dimension == "model" and values != MODELS:
            add(errors, f"{location}.values", "must enumerate all supported design models")
        if dimension == "cohort" and values != set(cohort_index):
            add(errors, f"{location}.values", "must enumerate every functional cohort ID")
        if dimension == "ring" and values != set(PROMOTION_CHAIN) | NON_PROMOTION_RINGS:
            add(errors, f"{location}.values", "must enumerate every rollout ring ID")
        if dimension == "assignment" and not {"grp.platform", "grp.model", "grp.persona", "grp.ring"}.issubset(set(references)):
            add(errors, f"{location}.referenced_group_ids", "assignment scope must compose platform, model, persona, and ring dimensions")
    missing_dimensions = sorted(REQUIRED_GROUP_DIMENSIONS - dimensions)
    if missing_dimensions:
        add(errors, "$.group_blueprints", f"missing group dimensions: {', '.join(missing_dimensions)}")
    validate_acyclic(group_graph, errors, "$.group_blueprints")

    rings, ring_index = records(root, "rollout_rings", RING_KEYS, "ring_id", errors)
    if set(ring_index) != set(PROMOTION_CHAIN) | NON_PROMOTION_RINGS:
        add(errors, "$.rollout_rings", "must define exactly LAB, PILOT, EARLY, BROAD, ELEVATED, and QUARANTINE")
    for ring_id, (order, predecessor, minimum_days) in PROMOTION_CHAIN.items():
        ring = ring_index.get(ring_id)
        if ring is None:
            continue
        if ring.get("promotion_ring") is not True:
            add(errors, f"$.rollout_rings[{ring_id}].promotion_ring", "must be true")
        if ring.get("order") != order or ring.get("predecessor_ring_id") != predecessor:
            add(errors, f"$.rollout_rings[{ring_id}]", "does not match LAB -> PILOT -> EARLY -> BROAD")
        days = ring.get("minimum_business_days")
        if not isinstance(days, int) or isinstance(days, bool) or days < minimum_days:
            add(errors, f"$.rollout_rings[{ring_id}].minimum_business_days", f"must be at least {minimum_days}")
        if ring_id != "ring.lab" and ring.get("approval_required") is not True:
            add(errors, f"$.rollout_rings[{ring_id}].approval_required", "promotion requires explicit approval")
    for ring_id in NON_PROMOTION_RINGS:
        ring = ring_index.get(ring_id)
        if ring is not None and (
            ring.get("promotion_ring") is not False
            or ring.get("order") is not None
            or ring.get("predecessor_ring_id") is not None
        ):
            add(errors, f"$.rollout_rings[{ring_id}]", "must remain outside the promotion chain")
    for index, ring in enumerate(rings):
        for field in ("promotion_ring", "approval_required"):
            if not isinstance(ring.get(field), bool):
                add(errors, f"$.rollout_rings[{index}].{field}", "must be Boolean")
        ring_id = ring.get("ring_id")
        machine_rule = RING_MACHINE_RULES.get(ring_id) if isinstance(ring_id, str) else None
        if machine_rule is not None:
            scope_mode, percentage, minimum_devices, canonical_scope_rule = machine_rule
            expected_machine_fields = {
                "scope_mode": scope_mode,
                "target_percentage": percentage,
                "minimum_devices": minimum_devices,
                "requires_frozen_membership": True,
                "dynamic_membership_allowed": False,
                "promotion_requires_new_plan": True,
            }
            for field, expected_value in expected_machine_fields.items():
                if ring.get(field) != expected_value:
                    add(errors, f"$.rollout_rings[{index}].{field}", f"must equal {expected_value!r} for {ring_id}")
            if ring.get("scope_rule") != canonical_scope_rule:
                add(
                    errors,
                    f"$.rollout_rings[{index}].scope_rule",
                    "must equal the canonical non-authoritative summary for scope_mode",
                )
        scope_rule = ring.get("scope_rule")
        if not isinstance(scope_rule, str) or not scope_rule:
            add(errors, f"$.rollout_rings[{index}].scope_rule", "must be non-empty")
        string_list(
            ring.get("rollback_thresholds"),
            errors,
            f"$.rollout_rings[{index}].rollback_thresholds",
            nonempty=True,
        )

    assignments, _ = records(root, "assignment_intents", ASSIGNMENT_KEYS, "assignment_id", errors)
    baseline_assignment_platforms: set[str] = set()
    for index, assignment in enumerate(assignments):
        location = f"$.assignment_intents[{index}]"
        policy_id = assignment.get("policy_id")
        scope_id = assignment.get("scope_blueprint_id")
        require_reference(policy_id, policy_index, errors, f"{location}.policy_id")
        require_reference(scope_id, group_index, errors, f"{location}.scope_blueprint_id")
        if scope_id not in assignable_groups:
            add(errors, f"{location}.scope_blueprint_id", "must reference an assignable intersection blueprint")
        cohorts_for_assignment = require_references(assignment.get("cohort_ids"), cohort_index, errors, f"{location}.cohort_ids", nonempty=True)
        require_reference(assignment.get("ring_id"), ring_index, errors, f"{location}.ring_id")
        if assignment.get("ring_id") != "ring.lab":
            add(errors, f"{location}.ring_id", "commit-safe assignment intent must begin in LAB")
        invariants = {
            "state": "unbound",
            "requires_published_policy": True,
            "membership_snapshot_required": True,
        }
        for field, expected_value in invariants.items():
            if assignment.get(field) != expected_value:
                add(errors, f"{location}.{field}", f"must equal {expected_value!r}")
        impact = assignment.get("impact_tier_floor")
        if not isinstance(impact, int) or isinstance(impact, bool) or impact < 2 or impact > 4:
            add(errors, f"{location}.impact_tier_floor", "assignment intent must be impact Tier 2 through 4")
        if assignment.get("model") not in MODELS:
            add(errors, f"{location}.model", "is not an allowed device model")
        for cohort_id in cohorts_for_assignment:
            eligible = cohort_index.get(cohort_id, {}).get("eligible_models")
            if isinstance(eligible, list) and assignment.get("model") not in eligible:
                add(errors, f"{location}.cohort_ids", f"{cohort_id!r} is not eligible for the assignment model")
        if assignment.get("platform") not in PLATFORMS:
            add(errors, f"{location}.platform", "is not an allowed platform")
        string_list(assignment.get("notes"), errors, f"{location}.notes")
        policy = policy_index.get(policy_id) if isinstance(policy_id, str) else None
        if isinstance(policy, Mapping):
            policy_impact = policy.get("impact_tier_floor")
            if (
                isinstance(impact, int)
                and not isinstance(impact, bool)
                and isinstance(policy_impact, int)
                and not isinstance(policy_impact, bool)
                and impact < policy_impact
            ):
                add(errors, f"{location}.impact_tier_floor", "must not be lower than the referenced policy impact floor")
            if assignment.get("platform") != policy.get("platform"):
                add(errors, f"{location}.platform", "must match the policy platform")
            raw_policy_models = policy.get("models")
            policy_models: list[Any] = raw_policy_models if isinstance(raw_policy_models, list) else []
            assignment_model = assignment.get("model")
            if assignment_model not in policy_models:
                add(errors, f"{location}.model", "is not eligible for the policy")
            policy_cohorts = policy.get("cohort_ids") if isinstance(policy.get("cohort_ids"), list) else []
            if policy_cohorts and not set(cohorts_for_assignment).issubset(set(policy_cohorts)):
                add(errors, f"{location}.cohort_ids", "contains a cohort not eligible for the policy")
            policy_layer_id = policy.get("layer_id")
            layer = layer_index.get(policy_layer_id) if isinstance(policy_layer_id, str) else None
            if (
                assignment.get("model") == "corp"
                and isinstance(layer, Mapping)
                and layer.get("order") == 1
                and assignment.get("platform") in CONCRETE_PLATFORMS
            ):
                baseline_assignment_platforms.add(str(assignment.get("platform")))
        if assignment.get("model") in {"shared", "kiosk"}:
            add(errors, f"{location}.model", "shared and kiosk candidates require resolved inventory before any assignment intent")

    if baseline_assignment_platforms != CONCRETE_PLATFORMS:
        add(errors, "$.assignment_intents", f"missing LAB intents for corporate baselines: {', '.join(sorted(CONCRETE_PLATFORMS - baseline_assignment_platforms))}")

    gates, gate_index = records(root, "activation_gates", GATE_KEYS, "gate_id", errors)
    if set(gate_index) != {f"G{i}_{name}" for i, name in enumerate((
        "OFFLINE_VALID",
        "CONTRACT_CURRENT",
        "INVENTORY_RESOLVED",
        "PERMISSION_READY",
        "LAB_BUILD_VALID",
        "LAB_MUTATION_VERIFIED",
        "LAB_ACTIVATED",
        "PRECEDENCE_PROVEN",
        "PILOT_APPROVED",
        "EARLY_APPROVED",
        "BROAD_APPROVED",
    ))}:
        add(errors, "$.activation_gates", "must define the complete G0 through G10 activation sequence")
    orders = [gate.get("order") for gate in gates]
    if sorted(item for item in orders if isinstance(item, int) and not isinstance(item, bool)) != list(range(11)):
        add(errors, "$.activation_gates", "gate orders must cover 0 through 10 exactly once")
    for index, gate in enumerate(gates):
        if gate.get("status") == "passed":
            add(errors, f"$.activation_gates[{index}].status", "gate results are target-local evidence and cannot be pre-passed")
        elif gate.get("status") not in {"defined", "blocked"}:
            add(errors, f"$.activation_gates[{index}].status", "must be defined or blocked")
        string_list(gate.get("required_evidence"), errors, f"$.activation_gates[{index}].required_evidence", nonempty=True)
        string_list(gate.get("blocks"), errors, f"$.activation_gates[{index}].blocks")

    boundary = mapping(root.get("commit_boundary"), errors, "$.commit_boundary")
    if boundary is not None:
        exact_keys(boundary, COMMIT_BOUNDARY_KEYS, errors, "$.commit_boundary")
        expected_target_root = f"private/{institution_code}" if institution_code else "private/<institution_code>"
        if boundary.get("target_local_root") != expected_target_root:
            add(errors, "$.commit_boundary.target_local_root", f"must be the ignored target-local root {expected_target_root}")
        for field in ("commit_safe_classes", "target_local_classes", "forbidden_classes"):
            string_list(boundary.get(field), errors, f"$.commit_boundary.{field}", nonempty=True)

    unresolved, _ = records(root, "unresolved_inputs", UNRESOLVED_KEYS, "input_id", errors)
    if not unresolved:
        add(errors, "$.unresolved_inputs", "must state the target and inventory evidence still missing")
    for index, item in enumerate(unresolved):
        location = f"$.unresolved_inputs[{index}]"
        require_references(item.get("blocks_gate_ids"), gate_index, errors, f"{location}.blocks_gate_ids", nonempty=True)
        if item.get("status") != "unresolved":
            add(errors, f"{location}.status", "commit-safe target inputs must remain unresolved")
        if not isinstance(item.get("description"), str) or not item["description"]:
            add(errors, f"{location}.description", "must be non-empty")
        if not isinstance(item.get("resolution_evidence"), str) or not item["resolution_evidence"]:
            add(errors, f"{location}.resolution_evidence", "must be non-empty")

    scan_commit_boundary(root, errors)
    return sorted(set(errors))


def parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate the non-executable Reference University Relution desired-state package."
    )
    parser.add_argument("--package", type=Path, default=DEFAULT_PACKAGE)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    return parser.parse_args(argv)


def main(argv: Iterable[str] | None = None) -> int:
    args = parse_args(argv)
    bootstrap_errors: list[str] = []
    concept_ids = concept_ids_from_manifest(args.manifest, bootstrap_errors)
    try:
        document = load_json(args.package)
    except ValueError as exc:
        bootstrap_errors.append(str(exc))
        document = None
    errors = bootstrap_errors + (validate_package(document, concept_ids) if document is not None else [])
    if errors:
        for item in sorted(set(errors)):
            print(f"error: {args.package}:{item}", file=sys.stderr)
        print(f"validation failed: {len(set(errors))} error(s)", file=sys.stderr)
        return 1
    print(
        "valid: Reference University offline desired state is non-executable, reference-closed, "
        "target-contract blocked, and free of forbidden target/contact/credential patterns"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
