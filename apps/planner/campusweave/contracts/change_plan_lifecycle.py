"""Validation helpers for a change plan's audit, authorization, and outcome."""

from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping

from .common import (
    AUDIT_EVIDENCE_SOURCES,
    AUDIT_PLAN_KEYS,
    AUDIT_PLAN_MODES,
    AUTHORIZATION_KEYS,
    FUNCTIONAL_CHECK_RESULTS,
    MAX_APPROVAL_CLOCK_SKEW,
    MAX_IMMEDIATE_APPROVAL_AGE,
    REQUIRED_AUDIT_MATCH_FIELDS,
    RESULT_ENUMS,
    RESULT_KEYS,
    ROLLBACK_EXECUTION_MODES,
    ROLLBACK_KEYS,
    VERIFICATION_KEYS,
    error,
    parse_timestamp,
    require_exact_keys,
    validate_string_array,
)


def _audit(
    root: Mapping[str, Any], resolved: Mapping[str, Any], path: Path, errors: list[str]
) -> None:
    audit = root.get("audit_plan")
    if not isinstance(audit, Mapping):
        error(errors, path, "$.audit_plan", "must be an object")
        return
    require_exact_keys(audit, AUDIT_PLAN_KEYS, errors, path, "$.audit_plan")
    mode = audit.get("mode")
    if mode not in AUDIT_PLAN_MODES:
        error(errors, path, "$.audit_plan.mode", "must be resolved")
    instructions = validate_string_array(
        audit.get("instructions"), errors, path, "$.audit_plan.instructions"
    )
    fields = validate_string_array(
        audit.get("required_match_fields"), errors, path, "$.audit_plan.required_match_fields"
    )
    missing = sorted(REQUIRED_AUDIT_MATCH_FIELDS - set(fields))
    if missing:
        error(
            errors,
            path,
            "$.audit_plan.required_match_fields",
            f"missing required audit match fields: {', '.join(missing)}",
        )
    source = audit.get("evidence_source")
    if source not in AUDIT_EVIDENCE_SOURCES:
        error(errors, path, "$.audit_plan.evidence_source", "must be resolved")
    _audit_mode(mode, source, instructions, resolved, path, errors)


def _audit_mode(
    mode: Any,
    source: Any,
    instructions: list[str],
    resolved: Mapping[str, Any],
    path: Path,
    errors: list[str],
) -> None:
    if mode == "api_operation":
        if resolved.get("audit") is None:
            error(errors, path, "$.operations.audit", "is required for an api_operation audit plan")
        if source != "target_contract":
            error(
                errors,
                path,
                "$.audit_plan.evidence_source",
                "must be target_contract for an API audit operation",
            )
    elif mode == "manual_ui":
        if not instructions:
            error(
                errors,
                path,
                "$.audit_plan.instructions",
                "must describe the manual audit-log procedure",
            )
        if source != "official_documentation":
            error(
                errors,
                path,
                "$.audit_plan.evidence_source",
                "must be official_documentation for a manual UI audit plan",
            )


def _rollback_basics(rollback: Mapping[str, Any], path: Path, errors: list[str]) -> Any:
    require_exact_keys(rollback, ROLLBACK_KEYS, errors, path, "$.rollback")
    _rollback_classification(rollback, path, errors)
    _rollback_recovery_details(rollback, path, errors)
    return rollback.get("execution_mode")


def _rollback_classification(rollback: Mapping[str, Any], path: Path, errors: list[str]) -> None:
    if not isinstance(rollback.get("available"), bool):
        error(errors, path, "$.rollback.available", "must be classified")
    mode = rollback.get("execution_mode")
    if mode not in ROLLBACK_EXECUTION_MODES:
        error(errors, path, "$.rollback.execution_mode", "must be resolved")
    if not isinstance(rollback.get("strategy"), str) or not rollback["strategy"]:
        error(errors, path, "$.rollback.strategy", "must be recorded")
    for field in ("prior_values_captured", "irreversibility_acknowledged"):
        if not isinstance(rollback.get(field), bool):
            error(errors, path, f"$.rollback.{field}", "must be a boolean")


def _rollback_recovery_details(rollback: Mapping[str, Any], path: Path, errors: list[str]) -> None:
    if rollback.get("available") is True:
        for field in ("recovery_owner", "recovery_window"):
            if not isinstance(rollback.get(field), str) or not rollback[field]:
                error(errors, path, f"$.rollback.{field}", "must be recorded")


def _rollback_mode(
    rollback: Mapping[str, Any],
    mode: Any,
    resolved: Mapping[str, Any],
    impact: Any,
    path: Path,
    errors: list[str],
) -> None:
    _rollback_mode_requirements(rollback, mode, resolved, impact, path, errors)
    if mode != "bound_operation" and resolved.get("rollback") is not None:
        error(
            errors,
            path,
            "$.operations.rollback",
            "must be null unless rollback.execution_mode is bound_operation",
        )


def _rollback_mode_requirements(
    rollback: Mapping[str, Any],
    mode: Any,
    resolved: Mapping[str, Any],
    impact: Any,
    path: Path,
    errors: list[str],
) -> None:
    if mode == "bound_operation":
        _bound_rollback(rollback, resolved, path, errors)
    elif mode == "restore_with_write_operation":
        _write_restore(rollback, path, errors)
    elif mode == "manual_recovery" and rollback.get("available") is not True:
        error(errors, path, "$.rollback.available", "must be true for manual recovery")
    elif mode == "irreversible":
        _irreversible_rollback(rollback, resolved, impact, path, errors)


def _bound_rollback(
    rollback: Mapping[str, Any], resolved: Mapping[str, Any], path: Path, errors: list[str]
) -> None:
    if rollback.get("available") is not True:
        error(errors, path, "$.rollback.available", "must be true for a bound rollback")
    if resolved.get("rollback") is None:
        error(errors, path, "$.operations.rollback", "is required for bound_operation rollback")


def _write_restore(rollback: Mapping[str, Any], path: Path, errors: list[str]) -> None:
    if rollback.get("available") is not True:
        error(errors, path, "$.rollback.available", "must be true for write-based restore")
    if rollback.get("prior_values_captured") is not True:
        error(
            errors,
            path,
            "$.rollback.prior_values_captured",
            "must be true for restore_with_write_operation",
        )


def _irreversible_rollback(
    rollback: Mapping[str, Any],
    resolved: Mapping[str, Any],
    impact: Any,
    path: Path,
    errors: list[str],
) -> None:
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


def _rollback(
    root: Mapping[str, Any], resolved: Mapping[str, Any], impact: Any, path: Path, errors: list[str]
) -> None:
    rollback = root.get("rollback")
    if not isinstance(rollback, Mapping):
        return
    mode = _rollback_basics(rollback, path, errors)
    _rollback_mode(rollback, mode, resolved, impact, path, errors)
    if (
        isinstance(impact, Mapping)
        and impact.get("destructive_or_irreversible") is True
        and rollback.get("irreversibility_acknowledged") is not True
    ):
        error(
            errors,
            path,
            "$.rollback.irreversibility_acknowledged",
            "must be true for destructive or irreversible effects",
        )


def _validate_change_plan_audit_and_rollback(
    root: Mapping[str, Any],
    path: Path,
    errors: list[str],
    resolved: Mapping[str, Mapping[str, Any] | None],
    impact: Any,
) -> None:
    _audit(root, resolved, path, errors)
    _rollback(root, resolved, impact, path, errors)


def _authorization_values(
    authorization: Mapping[str, Any], path: Path, errors: list[str]
) -> tuple[Any, Any]:
    require_exact_keys(authorization, AUTHORIZATION_KEYS, errors, path, "$.authorization")
    _authorization_required_values(authorization, path, errors)
    return _authorization_dates(authorization, path, errors)


def _authorization_required_values(
    authorization: Mapping[str, Any], path: Path, errors: list[str]
) -> None:
    for field in (
        "request_owner",
        "operator_identity",
        "token_owner",
        "approved_effect",
        "approved_at",
    ):
        if not isinstance(authorization.get(field), str) or not authorization[field]:
            error(errors, path, f"$.authorization.{field}", "must be recorded")
    scope = validate_string_array(
        authorization.get("permission_scope"),
        errors,
        path,
        "$.authorization.permission_scope",
        nonempty=True,
    )
    if not scope:
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


def _authorization_dates(
    authorization: Mapping[str, Any], path: Path, errors: list[str]
) -> tuple[Any, Any]:
    approved = parse_timestamp(
        authorization.get("approved_at"), errors, path, "$.authorization.approved_at"
    )
    expires = parse_timestamp(
        authorization.get("expires_at"), errors, path, "$.authorization.expires_at"
    )
    if approved is not None and expires is not None and approved >= expires:
        error(errors, path, "$.authorization.expires_at", "must be later than approved_at")
    return approved, expires


def _authorization_timing(
    approved: Any,
    expires: Any,
    status: str,
    executable: set[str],
    impact: Any,
    path: Path,
    errors: list[str],
) -> None:
    if status in executable and expires is not None and expires <= datetime.now(timezone.utc):
        error(
            errors,
            path,
            "$.authorization.expires_at",
            "approval has expired; execution is not authorized",
        )
    if not _needs_immediate_timing(status, executable, impact, approved, expires):
        return
    _immediate_timing(approved, expires, path, errors)


def _needs_immediate_timing(
    status: str, executable: set[str], impact: Any, approved: Any, expires: Any
) -> bool:
    return (
        status in executable
        and isinstance(impact, Mapping)
        and impact.get("requires_immediate_approval") is True
        and approved is not None
        and expires is not None
    )


def _immediate_timing(approved: Any, expires: Any, path: Path, errors: list[str]) -> None:
    now = datetime.now(timezone.utc)
    if approved > now + MAX_APPROVAL_CLOCK_SKEW:
        error(
            errors,
            path,
            "$.authorization.approved_at",
            "immediate approval time is unacceptably far in the future",
        )
    if now - approved > MAX_IMMEDIATE_APPROVAL_AGE:
        error(
            errors,
            path,
            "$.authorization.approved_at",
            "immediate approval is older than the one-hour execution window",
        )
    if expires - approved > MAX_IMMEDIATE_APPROVAL_AGE:
        error(
            errors,
            path,
            "$.authorization.expires_at",
            "immediate approval window must not exceed one hour",
        )


def _validate_change_plan_authorization(
    root: Mapping[str, Any],
    path: Path,
    errors: list[str],
    status: str,
    executable: set[str],
    impact: Any,
) -> None:
    if status not in {"approved", "executing", "verified", "rolled_back", "outcome_unknown"}:
        return
    authorization = root.get("authorization")
    if not isinstance(authorization, Mapping):
        error(errors, path, "$.authorization", "must be an object")
        return
    approved, expires = _authorization_values(authorization, path, errors)
    _authorization_timing(approved, expires, status, executable, impact, path, errors)


def _outcome_records(
    root: Mapping[str, Any], path: Path, errors: list[str]
) -> tuple[Mapping[str, Any], Mapping[str, Any]]:
    verification = root.get("verification")
    if not isinstance(verification, Mapping):
        error(errors, path, "$.verification", "must be an object")
        verification = {}
    else:
        _verification_record(verification, path, errors)
    return verification, _result_record(root, path, errors)


def _verification_record(verification: Mapping[str, Any], path: Path, errors: list[str]) -> None:
    require_exact_keys(verification, VERIFICATION_KEYS, errors, path, "$.verification")
    for field in (
        "documented_status_observed",
        "response_schema_valid",
        "readback_matches",
        "unchanged_invariants_match",
        "audit_entry_matches",
        "per_target_results_checked",
    ):
        if verification.get(field) is not None and not isinstance(verification.get(field), bool):
            error(errors, path, f"$.verification.{field}", "must be a boolean or null")
    if verification.get("functional_check") not in FUNCTIONAL_CHECK_RESULTS:
        error(errors, path, "$.verification.functional_check", "is invalid")
    if verification.get("job_terminal_state") is not None and not isinstance(
        verification.get("job_terminal_state"), str
    ):
        error(errors, path, "$.verification.job_terminal_state", "must be a string or null")


def _result_record(root: Mapping[str, Any], path: Path, errors: list[str]) -> Mapping[str, Any]:
    result = root.get("result")
    if not isinstance(result, Mapping):
        error(errors, path, "$.result", "must be an object")
        return {}
    require_exact_keys(result, RESULT_KEYS, errors, path, "$.result")
    for field, allowed in RESULT_ENUMS.items():
        if result.get(field) not in allowed:
            error(errors, path, f"$.result.{field}", "is invalid")
    if result.get("observed_at") is not None and not isinstance(result.get("observed_at"), str):
        error(errors, path, "$.result.observed_at", "must be a string or null")
    validate_string_array(
        result.get("residual_uncertainty"), errors, path, "$.result.residual_uncertainty"
    )
    return result


def _terminal_outcome(
    verification: Mapping[str, Any],
    result: Mapping[str, Any],
    status: str,
    path: Path,
    errors: list[str],
) -> None:
    _terminal_verification(verification, status, path, errors)
    _terminal_result(result, status, path, errors)


def _terminal_verification(
    verification: Mapping[str, Any], status: str, path: Path, errors: list[str]
) -> None:
    required = {
        "documented_status_observed": True,
        "response_schema_valid": True,
        "readback_matches": True,
        "unchanged_invariants_match": True,
        "audit_entry_matches": True,
    }
    if any(verification.get(field) is not expected for field, expected in required.items()):
        noun = "rollback" if status == "rolled_back" else ""
        error(
            errors,
            path,
            "$.verification",
            f"{status} status requires documented {noun}response, read-back, invariants, and audit evidence",
        )
    if verification.get("functional_check") not in {"passed", "not_applicable"}:
        error(
            errors,
            path,
            "$.verification.functional_check",
            f"must be passed or not_applicable for {status} status",
        )


def _terminal_result(result: Mapping[str, Any], status: str, path: Path, errors: list[str]) -> None:
    expected = {
        "request_transport": "sent",
        "server_acceptance": "documented_success",
        "readback": "matches",
        "audit": "matching",
        "overall": status,
    }
    if any(result.get(field) != value for field, value in expected.items()):
        message = (
            "rolled_back status requires a verified compensating result"
            if status == "rolled_back"
            else "verified status requires a sent request and matching response, read-back, and audit result"
        )
        error(errors, path, "$.result", message)
    if result.get("residual_uncertainty") != []:
        error(errors, path, "$.result.residual_uncertainty", f"must be empty for {status} status")
    parse_timestamp(result.get("observed_at"), errors, path, "$.result.observed_at")


def _validate_change_plan_outcome(
    root: Mapping[str, Any], path: Path, errors: list[str], status: str
) -> None:
    verification, result = _outcome_records(root, path, errors)
    if status in {"verified", "rolled_back"}:
        _terminal_outcome(verification, result, status, path, errors)
    elif status == "outcome_unknown":
        if (
            result.get("request_transport") == "not_sent"
            or result.get("overall") != "outcome_unknown"
        ):
            error(
                errors,
                path,
                "$.result",
                "outcome_unknown requires evidence that a request may have been sent",
            )
        parse_timestamp(result.get("observed_at"), errors, path, "$.result.observed_at")
