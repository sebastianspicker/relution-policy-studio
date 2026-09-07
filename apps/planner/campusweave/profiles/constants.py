"""Static contracts for the offline university profile validator."""

from __future__ import annotations

import re

from ..resources import CONCEPT_MANIFEST, SOURCE_ROOT

REPOSITORY_ROOT = SOURCE_ROOT
DEFAULT_MANIFEST = CONCEPT_MANIFEST
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
        "query",
        "read",
        "create",
        "update",
        "readback",
        "audit",
        "rollback",
    },
    "group.dynamic-lifecycle.v1": {
        "query",
        "read",
        "create",
        "update",
        "validate",
        "readback",
        "audit",
        "rollback",
    },
    "group.membership.v1": {"query", "read", "assign", "unassign", "readback", "audit"},
    "policy-definition.v1": {"query", "read", "create", "update", "readback", "audit", "rollback"},
    "policy-publication.v1": {"read", "publish", "status", "readback", "audit", "rollback"},
    "policy-assignment.v1": {"query", "read", "assign", "unassign", "status", "readback", "audit"},
    "policy-observation.v1": {"query", "status", "readback", "audit"},
    "permission-readiness.v1": {"query", "read", "readback", "audit"},
}
MUTATION_BINDING_ROLES = {
    "create",
    "update",
    "replace",
    "patch",
    "delete",
    "publish",
    "assign",
    "unassign",
    "action",
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
    "ring.pilot": (
        "bounded_pilot",
        5,
        5,
        "one approved representative device per platform and use case",
    ),
    "ring.early": ("bounded_early", 20, 1, "small approved reversible cohort"),
    "ring.broad": (
        "frozen_broad",
        100,
        1,
        "explicitly approved inventory-frozen production cohort",
    ),
    "ring.elevated": (
        "fixed_elevated",
        None,
        1,
        "separate controlled path for privileged or higher sensitivity",
    ),
    "ring.quarantine": (
        "fixed_quarantine",
        None,
        1,
        "containment or remediation only, never a promotion stage",
    ),
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
