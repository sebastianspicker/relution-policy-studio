#!/usr/bin/env python3
"""Validate the Relution machine-readable documentation offline.

The JSON Schemas are the portable contracts for external consumers. This
dependency-free validator enforces the cross-document and safety invariants
that JSON Schema alone cannot express: globally unique IDs, valid references,
unresolved hand-authored API bindings, digest-bound target bindings, generated
operation-key integrity, and non-executable templates.
"""

from __future__ import annotations

import re
from datetime import timedelta
from typing import Sequence

from ..resources import (
    CHANGE_PLAN_TEMPLATE,
    CONCEPT_MANIFEST,
    GENERATED_CATALOG,
    SOURCE_ROOT,
    TARGET_BINDINGS_TEMPLATE,
)
from .common_support import (
    ValidationFailure,
    catalog_digest,
    error,
    expect_list,
    expect_mapping,
    load_json,
    nested_references,
    parse_timestamp,
    pointer_exists,
    relative,
    require_exact_keys,
    validate_catalog_freshness,
    validate_https_url,
    validate_schema_references,
    validate_string_array,
)

__all__ = [
    "Sequence",
    "ValidationFailure",
    "catalog_digest",
    "error",
    "expect_list",
    "expect_mapping",
    "load_json",
    "nested_references",
    "parse_timestamp",
    "pointer_exists",
    "relative",
    "require_exact_keys",
    "validate_catalog_freshness",
    "validate_https_url",
    "validate_schema_references",
    "validate_string_array",
]


REPOSITORY_ROOT = SOURCE_ROOT
DEFAULT_MANIFEST = CONCEPT_MANIFEST
DEFAULT_CATALOG = GENERATED_CATALOG
DEFAULT_BINDINGS = TARGET_BINDINGS_TEMPLATE
DEFAULT_CHANGE_PLAN = CHANGE_PLAN_TEMPLATE

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
