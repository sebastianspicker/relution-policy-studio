"""Structural and semantic validation for editable profile-v2 documents."""

from __future__ import annotations

import math
from collections.abc import Mapping
from typing import Any

from ..private_artifacts import canonical_sha256
from .model import (
    ARRAY_FIELDS,
    COLLECTIONS,
    NULLABLE_STRING_FIELDS,
    RECORD_FIELDS,
    ROOT_FIELDS,
    record_id,
    records,
    string_list,
)

Diagnostic = dict[str, Any]
RESERVED_PROFILE_KEYS = {
    "api_key",
    "authority",
    "authority_id",
    "credential",
    "credentials",
    "host",
    "hostname",
    "password",
    "secret",
    "target",
    "target_id",
    "target_url",
    "tenant",
    "token",
    "url",
}


def _diagnostic(code: str, path: str, message: str, *, severity: str = "error") -> Diagnostic:
    return {"severity": severity, "code": code, "path": path, "message": message}


def _structural_diagnostics(profile: Any) -> list[Diagnostic]:
    if not isinstance(profile, Mapping):
        return [_diagnostic("profile.type", "$", "profile must be an object")]
    diagnostics: list[Diagnostic] = []
    unknown = sorted(set(profile) - ROOT_FIELDS)
    for key in unknown:
        diagnostics.append(
            _diagnostic("profile.unknown_field", f"$.{key}", "field is not part of profile v2")
        )
    if profile.get("schema_version") != 2:
        diagnostics.append(
            _diagnostic("profile.schema_version", "$.schema_version", "must equal 2")
        )
    for field in ("id", "name"):
        _require_string(profile.get(field), f"$.{field}", diagnostics)
    for collection in COLLECTIONS:
        raw = profile.get(collection)
        path = f"$.{collection}"
        if not isinstance(raw, list):
            diagnostics.append(_diagnostic("profile.collection", path, "must be an array"))
            continue
        for index, item in enumerate(raw):
            _validate_record(collection, item, f"{path}[{index}]", diagnostics)
    _reject_nonfinite(profile, "$", diagnostics)
    _reject_reserved_keys(profile, "$", diagnostics)
    return diagnostics


def _validate_record(collection: str, item: Any, path: str, diagnostics: list[Diagnostic]) -> None:
    if not isinstance(item, Mapping):
        diagnostics.append(_diagnostic("record.type", path, "record must be an object"))
        return
    unknown = sorted(set(item) - RECORD_FIELDS[collection])
    for key in unknown:
        diagnostics.append(
            _diagnostic("record.unknown_field", f"{path}.{key}", "field is not allowed")
        )
    for field in ("id", "name"):
        _require_string(item.get(field), f"{path}.{field}", diagnostics)
    for field in sorted(RECORD_FIELDS[collection] - {"id", "name"}):
        field_path = f"{path}.{field}"
        if field in ARRAY_FIELDS[collection]:
            _require_string_array(item.get(field), field_path, diagnostics)
        elif collection == "intents" and field == "layer":
            layer = item.get(field)
            if layer is not None and (
                not isinstance(layer, int) or isinstance(layer, bool) or not 0 <= layer <= 7
            ):
                diagnostics.append(
                    _diagnostic(
                        "intent.layer", field_path, "must be null or an integer from 0 through 7"
                    )
                )
        elif collection == "rollout_stages" and field == "order":
            order = item.get(field)
            if (
                not isinstance(order, int)
                or isinstance(order, bool)
                or not 0 <= order <= 9007199254740991
            ):
                diagnostics.append(
                    _diagnostic(
                        "rollout.order",
                        field_path,
                        "must be a non-negative JavaScript-safe integer",
                    )
                )
        elif field in NULLABLE_STRING_FIELDS.get(collection, set()):
            value = item.get(field)
            if value is not None and not isinstance(value, str):
                diagnostics.append(
                    _diagnostic("record.field_type", field_path, "must be a string or null")
                )
        else:
            _require_string(item.get(field), field_path, diagnostics)


def _require_string(value: Any, path: str, diagnostics: list[Diagnostic]) -> None:
    if not isinstance(value, str) or not value.strip():
        diagnostics.append(
            _diagnostic("record.required_string", path, "must be a non-empty string")
        )
    elif path.endswith(".id") and value != value.strip():
        diagnostics.append(
            _diagnostic("record.id_whitespace", path, "id must not start or end with whitespace")
        )


def _require_string_array(value: Any, path: str, diagnostics: list[Diagnostic]) -> None:
    if not isinstance(value, list):
        diagnostics.append(_diagnostic("record.string_array", path, "must be an array of strings"))
        return
    for index, item in enumerate(value):
        if not isinstance(item, str) or not item.strip():
            diagnostics.append(
                _diagnostic("record.string_array", f"{path}[{index}]", "must be a non-empty string")
            )
        elif item != item.strip():
            diagnostics.append(
                _diagnostic(
                    "record.value_whitespace",
                    f"{path}[{index}]",
                    "value must not start or end with whitespace",
                )
            )
    if len(value) != len(set(item for item in value if isinstance(item, str))):
        diagnostics.append(
            _diagnostic("record.duplicate_value", path, "must not contain duplicate strings")
        )


def _reject_nonfinite(value: Any, path: str, diagnostics: list[Diagnostic]) -> None:
    if isinstance(value, float) and not math.isfinite(value):
        diagnostics.append(_diagnostic("profile.nonfinite", path, "number must be finite"))
    elif isinstance(value, Mapping):
        for key, child in value.items():
            _reject_nonfinite(child, f"{path}.{key}", diagnostics)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            _reject_nonfinite(child, f"{path}[{index}]", diagnostics)


def _reject_reserved_keys(value: Any, path: str, diagnostics: list[Diagnostic]) -> None:
    if isinstance(value, Mapping):
        for key, child in value.items():
            key_path = f"{path}.{key}"
            if isinstance(key, str) and key.casefold() in RESERVED_PROFILE_KEYS:
                diagnostics.append(
                    _diagnostic(
                        "profile.reserved_data",
                        key_path,
                        "target, authority, and credential data is not allowed in a profile",
                    )
                )
            _reject_reserved_keys(child, key_path, diagnostics)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            _reject_reserved_keys(child, f"{path}[{index}]", diagnostics)


def _indexes(
    profile: Mapping[str, Any],
) -> tuple[dict[str, dict[str, Mapping[str, Any]]], list[Diagnostic]]:
    indexes: dict[str, dict[str, Mapping[str, Any]]] = {}
    diagnostics: list[Diagnostic] = []
    all_ids: dict[str, str] = {}
    for collection in COLLECTIONS:
        index: dict[str, Mapping[str, Any]] = {}
        for position, item in enumerate(records(profile, collection)):
            identifier = record_id(item)
            if identifier is None:
                continue
            path = f"$.{collection}[{position}].id"
            if identifier in index:
                diagnostics.append(
                    _diagnostic("reference.duplicate_id", path, f"duplicate id {identifier!r}")
                )
            elif identifier in all_ids:
                diagnostics.append(
                    _diagnostic(
                        "reference.ambiguous_id",
                        path,
                        f"id {identifier!r} is already used at {all_ids[identifier]}",
                    )
                )
            else:
                all_ids[identifier] = path
            index.setdefault(identifier, item)
        indexes[collection] = index
    return indexes, diagnostics


def _check_reference(
    value: Any,
    target: str,
    path: str,
    indexes: Mapping[str, Mapping[str, Mapping[str, Any]]],
    diagnostics: list[Diagnostic],
) -> None:
    if isinstance(value, str) and value and value not in indexes[target]:
        diagnostics.append(
            _diagnostic("reference.broken", path, f"does not reference an existing {target} id")
        )


def _reference_diagnostics(
    profile: Mapping[str, Any], indexes: Mapping[str, Mapping[str, Mapping[str, Any]]]
) -> list[Diagnostic]:
    diagnostics: list[Diagnostic] = []
    _references_in_records(profile, indexes, diagnostics)
    all_ids = {identifier for index in indexes.values() for identifier in index}
    for position, item in enumerate(records(profile, "unresolved")):
        for offset, identifier in enumerate(string_list(item.get("related_ids"))):
            if identifier not in all_ids:
                diagnostics.append(
                    _diagnostic(
                        "reference.broken",
                        f"$.unresolved[{position}].related_ids[{offset}]",
                        "does not reference an existing profile id",
                    )
                )
    return diagnostics


def _references_in_records(
    profile: Mapping[str, Any],
    indexes: Mapping[str, Mapping[str, Mapping[str, Any]]],
    diagnostics: list[Diagnostic],
) -> None:
    specs = {
        "organizations": {"parent_id": "organizations"},
        "locations": {"organization_id": "organizations"},
        "cohorts": {"organization_id": "organizations", "location_ids": "locations"},
        "intents": {
            "cohort_ids": "cohorts",
            "scope_ids": "scope_blueprints",
            "depends_on": "intents",
        },
        "scope_blueprints": {
            "cohort_ids": "cohorts",
            "organization_ids": "organizations",
            "location_ids": "locations",
            "depends_on": "scope_blueprints",
        },
        "assignments": {
            "intent_id": "intents",
            "scope_id": "scope_blueprints",
            "rollout_stage_id": "rollout_stages",
        },
        "rollout_stages": {"depends_on": "rollout_stages"},
    }
    for collection, fields in specs.items():
        for position, item in enumerate(records(profile, collection)):
            for field, target in fields.items():
                value = item.get(field)
                path = f"$.{collection}[{position}].{field}"
                if isinstance(value, list):
                    for offset, identifier in enumerate(value):
                        _check_reference(
                            identifier, target, f"{path}[{offset}]", indexes, diagnostics
                        )
                elif value is not None:
                    _check_reference(value, target, path, indexes, diagnostics)


def _cycle_diagnostics(profile: Mapping[str, Any]) -> list[Diagnostic]:
    diagnostics: list[Diagnostic] = []
    for collection, dependency_field in (
        ("organizations", "parent_id"),
        ("intents", "depends_on"),
        ("scope_blueprints", "depends_on"),
        ("rollout_stages", "depends_on"),
    ):
        graph: dict[str, list[str]] = {}
        for item in records(profile, collection):
            identifier = record_id(item)
            if identifier is None:
                continue
            raw = item.get(dependency_field)
            graph[identifier] = [raw] if isinstance(raw, str) and raw else string_list(raw)
        _find_cycles(collection, dependency_field, graph, diagnostics)
    return diagnostics


def _find_cycles(
    collection: str,
    dependency_field: str,
    graph: Mapping[str, list[str]],
    diagnostics: list[Diagnostic],
) -> None:
    visiting: list[str] = []
    complete: set[str] = set()
    reported: set[tuple[str, ...]] = set()

    def visit(node: str) -> None:
        if node in complete or node not in graph:
            return
        if node in visiting:
            cycle = tuple(visiting[visiting.index(node) :] + [node])
            canonical = tuple(sorted(set(cycle)))
            if canonical not in reported:
                reported.add(canonical)
                diagnostics.append(
                    _diagnostic(
                        "reference.cycle",
                        f"$.{collection}",
                        f"{dependency_field} cycle: {' -> '.join(cycle)}",
                    )
                )
            return
        visiting.append(node)
        for dependency in sorted(graph[node]):
            visit(dependency)
        visiting.pop()
        complete.add(node)

    for identifier in sorted(graph):
        visit(identifier)


def _compatibility_diagnostics(
    profile: Mapping[str, Any], indexes: Mapping[str, Mapping[str, Mapping[str, Any]]]
) -> list[Diagnostic]:
    diagnostics: list[Diagnostic] = []
    for position, intent in enumerate(records(profile, "intents")):
        for offset, scope_id in enumerate(string_list(intent.get("scope_ids"))):
            scope = indexes["scope_blueprints"].get(scope_id)
            if scope is not None:
                diagnostics.extend(
                    _scope_mismatches(intent, scope, f"$.intents[{position}].scope_ids[{offset}]")
                )
    for position, assignment in enumerate(records(profile, "assignments")):
        intent_id, scope_id = assignment.get("intent_id"), assignment.get("scope_id")
        intent = indexes["intents"].get(intent_id) if isinstance(intent_id, str) else None
        scope = indexes["scope_blueprints"].get(scope_id) if isinstance(scope_id, str) else None
        if intent is None or scope is None:
            continue
        if not any(
            string_list(scope.get(field))
            for field in (
                "cohort_ids",
                "organization_ids",
                "location_ids",
                "platforms",
                "ownerships",
                "roles",
            )
        ):
            diagnostics.append(
                _diagnostic(
                    "scope.unconstrained",
                    f"$.assignments[{position}].scope_id",
                    "assignment scope has no explicit population or applicability constraint",
                )
            )
        declared_scopes = string_list(intent.get("scope_ids"))
        if declared_scopes and scope_id not in declared_scopes:
            diagnostics.append(
                _diagnostic(
                    "scope.incompatible",
                    f"$.assignments[{position}].scope_id",
                    "assignment scope is outside the intent's declared scopes",
                )
            )
        diagnostics.extend(_scope_mismatches(intent, scope, f"$.assignments[{position}].scope_id"))
    return diagnostics


def _scope_mismatches(
    intent: Mapping[str, Any], scope: Mapping[str, Any], path: str
) -> list[Diagnostic]:
    diagnostics: list[Diagnostic] = []
    for scalar, array in (
        ("platform", "platforms"),
        ("ownership", "ownerships"),
        ("role", "roles"),
    ):
        value, allowed = intent.get(scalar), string_list(scope.get(array))
        if isinstance(value, str) and value and allowed and value not in allowed:
            diagnostics.append(
                _diagnostic("scope.incompatible", path, f"scope excludes intent {scalar} {value!r}")
            )
    intended_cohorts = set(string_list(intent.get("cohort_ids")))
    scoped_cohorts = set(string_list(scope.get("cohort_ids")))
    if intended_cohorts and scoped_cohorts and not intended_cohorts.issubset(scoped_cohorts):
        diagnostics.append(
            _diagnostic("scope.incompatible", path, "scope excludes one or more intent cohorts")
        )
    return diagnostics


def _ownership_diagnostics(profile: Mapping[str, Any]) -> list[Diagnostic]:
    diagnostics: list[Diagnostic] = []
    intents = records(profile, "intents")
    for left_index, left in enumerate(intents):
        left_owner = left.get("ownership")
        if not isinstance(left_owner, str) or not left_owner:
            continue
        for right_index in range(left_index + 1, len(intents)):
            right = intents[right_index]
            right_owner = right.get("ownership")
            if not isinstance(right_owner, str) or not right_owner or left_owner == right_owner:
                continue
            shared = sorted(
                set(string_list(left.get("requirements")))
                & set(string_list(right.get("requirements")))
            )
            if shared and _intents_may_overlap(left, right):
                diagnostics.append(
                    _diagnostic(
                        "ownership.conflict",
                        f"$.intents[{right_index}].ownership",
                        f"conflicting owners for requirements: {', '.join(shared)}",
                    )
                )
    return diagnostics


def _intents_may_overlap(left: Mapping[str, Any], right: Mapping[str, Any]) -> bool:
    left_platform, right_platform = left.get("platform"), right.get("platform")
    if (
        isinstance(left_platform, str)
        and isinstance(right_platform, str)
        and left_platform != right_platform
    ):
        return False
    left_cohorts = set(string_list(left.get("cohort_ids")))
    right_cohorts = set(string_list(right.get("cohort_ids")))
    return not left_cohorts or not right_cohorts or bool(left_cohorts & right_cohorts)


def validate_profile(profile: Any) -> dict[str, Any]:
    """Return deterministic diagnostics without rejecting incomplete drafts."""
    diagnostics = _structural_diagnostics(profile)
    if isinstance(profile, Mapping):
        indexes, index_diagnostics = _indexes(profile)
        diagnostics.extend(index_diagnostics)
        diagnostics.extend(_reference_diagnostics(profile, indexes))
        diagnostics.extend(_cycle_diagnostics(profile))
        diagnostics.extend(_compatibility_diagnostics(profile, indexes))
        diagnostics.extend(_ownership_diagnostics(profile))
    diagnostics.sort(
        key=lambda item: (item["severity"], item["path"], item["code"], item["message"])
    )
    return {
        "profile_digest": canonical_sha256(profile),
        "diagnostics": diagnostics,
        "valid": not any(item["severity"] == "error" for item in diagnostics),
    }
