"""Validation helpers for change-plan controls and target state."""

from pathlib import Path
from typing import Any, Mapping

from .catalog import request_body_media_types, schema_refs
from .common import (
    ASSERTION_KEYS,
    ASSERTION_OPERATORS,
    ASSERTION_SOURCES,
    CHANGE_KEYS,
    CHANGE_PLAN_TARGET_KEYS,
    IMPACT_KEYS,
    RESOURCE_KEYS,
    RESOURCE_SCOPES,
    error,
    expect_mapping,
    require_exact_keys,
    validate_https_url,
    validate_string_array,
)


def _request_scalar_fields(record: Mapping[str, Any], path: Path, errors: list[str]) -> list[str]:
    for field in ("path_parameters", "query_parameters"):
        if not isinstance(record.get(field), Mapping):
            error(errors, path, f"$.request.{field}", "must be an object")
    for field in (
        "method",
        "path_template",
        "media_type",
        "request_schema_ref",
        "request_body_file",
    ):
        value = record.get(field)
        if value is not None and not isinstance(value, str):
            error(errors, path, f"$.request.{field}", "must be a string or null")
    return validate_string_array(
        record.get("concurrency_controls"), errors, path, "$.request.concurrency_controls"
    )


def _request_body_file(
    record: Mapping[str, Any], plan_path: Path, errors: list[str], must_exist: bool
) -> None:
    value = record.get("request_body_file")
    if not isinstance(value, str) or not value:
        error(
            errors,
            plan_path,
            "$.request.request_body_file",
            "is required when the write operation declares a request body",
        )
    elif must_exist:
        request_path = Path(value)
        if not request_path.is_absolute():
            request_path = plan_path.parent / request_path
        if not request_path.is_file():
            error(
                errors,
                plan_path,
                "$.request.request_body_file",
                "must reference an existing regular file before execution",
            )


def _request_body_details(
    record: Mapping[str, Any],
    write: Mapping[str, Any],
    path: Path,
    errors: list[str],
    status: str,
    executable: set[str],
) -> None:
    body = write.get("request_body")
    refs = schema_refs(body)
    schema_ref = record.get("request_schema_ref")
    if isinstance(schema_ref, str) and schema_ref and schema_ref not in refs:
        error(
            errors,
            path,
            "$.request.request_schema_ref",
            "is absent from the write operation request body",
        )
    kind = body.get("kind") if isinstance(body, Mapping) else None
    if kind in {None, "none"}:
        _request_without_body(record, path, errors)
        return
    _request_body_file(record, path, errors, status in executable)
    _request_body_media(record, body, refs, path, errors)


def _request_without_body(record: Mapping[str, Any], path: Path, errors: list[str]) -> None:
    for field in ("media_type", "request_schema_ref", "request_body_file"):
        if record.get(field) is not None:
            error(
                errors,
                path,
                f"$.request.{field}",
                "must be null when the write operation has no request body",
            )


def _request_body_media(
    record: Mapping[str, Any], body: Any, refs: set[str], path: Path, errors: list[str]
) -> None:
    _request_media_type(record, body, path, errors)
    _request_schema_requirement(record, refs, path, errors)


def _request_media_type(
    record: Mapping[str, Any], body: Any, path: Path, errors: list[str]
) -> None:
    media_type = record.get("media_type")
    if not isinstance(media_type, str) or not media_type:
        error(
            errors,
            path,
            "$.request.media_type",
            "is required when the write operation declares a request body",
        )
    declared = request_body_media_types(body)
    if isinstance(media_type, str) and declared and media_type not in declared:
        error(
            errors, path, "$.request.media_type", "is absent from the write operation request body"
        )


def _request_schema_requirement(
    record: Mapping[str, Any], refs: set[str], path: Path, errors: list[str]
) -> None:
    if refs and (
        not isinstance(record.get("request_schema_ref"), str) or not record["request_schema_ref"]
    ):
        error(
            errors,
            path,
            "$.request.request_schema_ref",
            "is required when the request body contains a schema/reference",
        )


def _declared_parameters(write: Mapping[str, Any]) -> dict[str, set[str]]:
    declared = {"path": set(), "query": set(), "header": set()}
    parameters = write.get("parameters")
    for parameter in parameters if isinstance(parameters, list) else []:
        if (
            isinstance(parameter, Mapping)
            and parameter.get("in") in declared
            and isinstance(parameter.get("name"), str)
        ):
            declared[parameter["in"]].add(parameter["name"])
    return declared


def _request_parameters(
    record: Mapping[str, Any],
    write: Mapping[str, Any],
    controls: list[str],
    path: Path,
    errors: list[str],
) -> None:
    declared = _declared_parameters(write)
    path_params = record.get("path_parameters")
    if isinstance(path_params, Mapping) and set(path_params) != declared["path"]:
        error(
            errors,
            path,
            "$.request.path_parameters",
            "must exactly match the write operation path parameters",
        )
    query_params = record.get("query_parameters")
    if isinstance(query_params, Mapping):
        unknown = sorted(set(query_params) - declared["query"])
        if unknown:
            error(
                errors,
                path,
                "$.request.query_parameters",
                f"undeclared query parameters: {', '.join(unknown)}",
            )
    headers = {name.lower() for name in declared["header"]}
    for name in controls:
        if name.lower() not in headers:
            error(
                errors,
                path,
                "$.request.concurrency_controls",
                f"header {name!r} is absent from the write operation",
            )


def _validate_change_plan_request(
    root: Mapping[str, Any],
    path: Path,
    errors: list[str],
    write: Mapping[str, Any] | None,
    request_record: Mapping[str, Any],
    status: str,
    executable: set[str],
) -> None:
    """Validate the request record against its bound write operation."""
    controls = _request_scalar_fields(request_record, path, errors)
    if write is None:
        return
    _request_body_details(request_record, write, path, errors, status, executable)
    _request_parameters(request_record, write, controls, path, errors)


def _impact_tier(impact: Any, path: Path, errors: list[str]) -> Any:
    tier = impact.get("tier") if isinstance(impact, Mapping) else None
    if not isinstance(tier, int) or isinstance(tier, bool):
        error(errors, path, "$.impact.tier", "must be classified")
    elif tier < 1:
        error(errors, path, "$.impact.tier", "a settings mutation cannot be Tier 0")
    elif tier > 4:
        error(errors, path, "$.impact.tier", "must not exceed Tier 4")
    return tier


def _impact_values(impact: Mapping[str, Any], path: Path, errors: list[str]) -> None:
    _impact_classifications(impact, path, errors)
    _impact_optional_values(impact, path, errors)


def _impact_classifications(impact: Mapping[str, Any], path: Path, errors: list[str]) -> None:
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


def _impact_optional_values(impact: Mapping[str, Any], path: Path, errors: list[str]) -> None:
    for field in ("canary_scope", "monitoring_owner", "monitoring_window"):
        value = impact.get(field)
        if value is not None and (not isinstance(value, str) or not value):
            error(errors, path, f"$.impact.{field}", "must be a non-empty string or null")


def _impact_rules(impact: Mapping[str, Any], tier: Any, path: Path, errors: list[str]) -> None:
    _immediate_approval_rule(impact, tier, path, errors)
    _destructive_impact_rule(impact, tier, path, errors)
    if impact.get("affects_multiple_organizations") is True and tier != 4:
        error(errors, path, "$.impact.tier", "multi-organization changes must be Tier 4")


def _immediate_approval_rule(
    impact: Mapping[str, Any], tier: Any, path: Path, errors: list[str]
) -> None:
    immediate = impact.get("requires_immediate_approval")
    if (
        (isinstance(tier, int) and not isinstance(tier, bool) and tier >= 2)
        or impact.get("externally_visible") is True
    ) and immediate is not True:
        error(
            errors,
            path,
            "$.impact.requires_immediate_approval",
            "must be true for Tier 2-4 or externally visible changes",
        )


def _destructive_impact_rule(
    impact: Mapping[str, Any], tier: Any, path: Path, errors: list[str]
) -> None:
    immediate = impact.get("requires_immediate_approval")
    if impact.get("destructive_or_irreversible") is True:
        if tier != 4:
            error(
                errors, path, "$.impact.tier", "destructive or irreversible changes must be Tier 4"
            )
        if immediate is not True:
            error(
                errors,
                path,
                "$.impact.requires_immediate_approval",
                "must be true for destructive or irreversible changes",
            )


def _impact_access_rules(
    impact: Mapping[str, Any], tier: Any, path: Path, errors: list[str]
) -> None:
    _access_impact_rule(impact, tier, path, errors)
    _tier_four_rule(impact, tier, path, errors)


def _access_impact_rule(
    impact: Mapping[str, Any], tier: Any, path: Path, errors: list[str]
) -> None:
    if impact.get("affects_authentication_or_access") is True:
        if not isinstance(tier, int) or tier < 3:
            error(
                errors,
                path,
                "$.impact.tier",
                "authentication or access changes must be Tier 3 or 4",
            )
        if impact.get("requires_second_access_path") is not True:
            error(
                errors,
                path,
                "$.impact.requires_second_access_path",
                "must be true for authentication or access changes",
            )


def _tier_four_rule(impact: Mapping[str, Any], tier: Any, path: Path, errors: list[str]) -> None:
    if tier == 4:
        if impact.get("requires_canary") is not True:
            error(errors, path, "$.impact.requires_canary", "must be true for Tier 4 changes")
        for field in ("canary_scope", "monitoring_owner", "monitoring_window"):
            if not isinstance(impact.get(field), str) or not impact[field]:
                error(
                    errors,
                    path,
                    f"$.impact.{field}",
                    "must be recorded for a Tier 4 canary and monitoring plan",
                )


def _validate_change_plan_impact(root: Mapping[str, Any], path: Path, errors: list[str]) -> None:
    impact = root.get("impact")
    if isinstance(impact, Mapping):
        require_exact_keys(impact, IMPACT_KEYS, errors, path, "$.impact")
    tier = _impact_tier(impact, path, errors)
    if isinstance(impact, Mapping):
        _impact_values(impact, path, errors)
        _impact_rules(impact, tier, path, errors)
        _impact_access_rules(impact, tier, path, errors)


def _target(root: Mapping[str, Any], path: Path, errors: list[str]) -> None:
    target = root.get("target")
    if not isinstance(target, Mapping):
        error(errors, path, "$.target", "must be an object")
        return
    require_exact_keys(target, CHANGE_PLAN_TARGET_KEYS, errors, path, "$.target")
    for field in (
        "authorized_origin",
        "effective_api_server",
        "relution_version",
        "organization_id",
        "organization_name",
    ):
        if not isinstance(target.get(field), str) or not target[field]:
            error(errors, path, f"$.target.{field}", "must be resolved")
    authorized = validate_https_url(
        target.get("authorized_origin"),
        errors,
        path,
        "$.target.authorized_origin",
        origin_only=True,
    )
    effective = validate_https_url(
        target.get("effective_api_server"),
        errors,
        path,
        "$.target.effective_api_server",
        origin_only=False,
    )
    if authorized is not None and effective is not None and effective != authorized:
        error(
            errors,
            path,
            "$.target.effective_api_server",
            "must resolve to the explicitly authorized origin",
        )


def _resource(root: Mapping[str, Any], path: Path, errors: list[str]) -> None:
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


def _change(root: Mapping[str, Any], path: Path, errors: list[str]) -> None:
    change = root.get("change")
    if not isinstance(change, Mapping):
        error(errors, path, "$.change", "must be an object")
        return
    require_exact_keys(change, CHANGE_KEYS, errors, path, "$.change")
    before, desired = change.get("before_fields"), change.get("desired_fields")
    if not isinstance(before, Mapping) or not isinstance(desired, Mapping):
        error(errors, path, "$.change", "before_fields and desired_fields must be objects")
    elif before == desired:
        error(errors, path, "$.change.desired_fields", "must differ from before_fields")
    for field, message in (
        ("destructive_sentinels_reviewed", "must be true"),
        ("smallest_semantic_diff_confirmed", "must be true"),
    ):
        if change.get(field) is not True:
            error(errors, path, f"$.change.{field}", message)
    for field in ("unchanged_invariants", "omitted_server_managed_fields", "write_only_fields"):
        validate_string_array(change.get(field), errors, path, f"$.change.{field}")


def _assertions(root: Mapping[str, Any], path: Path, errors: list[str]) -> None:
    assertions = root.get("success_assertions")
    if not isinstance(assertions, list) or not assertions:
        error(errors, path, "$.success_assertions", "must not be empty")
        return
    for index, raw in enumerate(assertions):
        location = f"$.success_assertions[{index}]"
        assertion = expect_mapping(raw, errors, path, location)
        if assertion is None:
            continue
        _assertion(assertion, location, path, errors)


def _assertion(assertion: Mapping[str, Any], location: str, path: Path, errors: list[str]) -> None:
    require_exact_keys(assertion, ASSERTION_KEYS, errors, path, location)
    if assertion.get("source") not in ASSERTION_SOURCES:
        error(errors, path, f"{location}.source", "is invalid")
    pointer = assertion.get("json_pointer")
    if not isinstance(pointer, str) or (pointer and not pointer.startswith("/")):
        error(errors, path, f"{location}.json_pointer", "must be a JSON Pointer")
    if assertion.get("operator") not in ASSERTION_OPERATORS:
        error(errors, path, f"{location}.operator", "is invalid")


def _validate_change_plan_target_resource_change(
    root: Mapping[str, Any], path: Path, errors: list[str]
) -> None:
    _target(root, path, errors)
    _resource(root, path, errors)
    _change(root, path, errors)
    _assertions(root, path, errors)
