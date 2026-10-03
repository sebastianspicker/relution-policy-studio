"""Project source recommendations into strict assurance catalog rows."""

from __future__ import annotations

import re
from typing import Any

from .artifact_io_values import flatten_values
from .assurance_schema_validation import MappingSchema, json_pointer
from .assurance_sources import canonical_digest
from .mapping_exact_targets import mapping_target
from .ruleset_catalog_instances import multi_instance_id


def disposition_for(
    recommendation: dict[str, Any], audits: list[dict[str, Any]]
) -> str:
    """Assign one explicit disposition without promoting candidate evidence."""

    mapping = recommendation.get("relutionMapping", {})
    status = mapping.get("status", "none")
    exact_audits = [row for row in audits if row["role"] == "exact"]
    if recommendation.get("status") == "retired":
        return "unsupported"
    if (
        status == "exact"
        and exact_audits
        and all(row["outcome"] == "valid" for row in exact_audits)
    ):
        return "supported"
    if (
        status == "parameterized"
        and exact_audits
        and all(row["outcome"] == "valid" for row in exact_audits)
    ):
        return "parameter"
    if mapping.get("processSupport"):
        return "organizational"
    if mapping.get("candidates"):
        return "candidate"
    return "unsupported"


def selectable_mapping_for(
    mappings: list[Any], audits: list[dict[str, Any]]
) -> dict[str, Any] | None:
    """Return one valid mapping, failing closed on mixed or multiple mappings."""

    exact_audits = [row for row in audits if row["role"] == "exact"]
    if len(mappings) != 1 or len(exact_audits) != 1:
        return None
    if exact_audits[0]["outcome"] != "valid" or not isinstance(mappings[0], dict):
        return None
    return mappings[0]


def applicability_for(
    platform: str,
    recommendation: dict[str, Any],
    mapping: dict[str, Any] | None,
    schemas: dict[tuple[str, str], MappingSchema],
) -> dict[str, Any]:
    """Build only predicates directly supported by source and schema evidence."""

    predicates: list[dict[str, Any]] = [
        {"field": "platform", "operator": "equals", "value": platform}
    ]
    if mapping is not None:
        schema = schemas.get((str(mapping.get("kind")), str(mapping_target(mapping))))
        channels = (
            applicable_enrollment_channels(platform, schema.enrollment_channels)
            if schema is not None
            else ()
        )
        if channels:
            predicates.append(
                {
                    "field": "enrollmentChannel",
                    "operator": "oneOf",
                    "value": list(channels),
                }
            )
    unresolved = []
    os_version = explicit_os_version(recommendation)
    if os_version is not None:
        predicates.append(
            {"field": "osVersion", "operator": "equals", "value": os_version}
        )
    profile_applicability = recommendation.get("profileApplicability", [])
    if isinstance(profile_applicability, list):
        append_profile_applicability(predicates, unresolved, profile_applicability)
    management_surface = recommendation.get("managementSurface")
    if (
        isinstance(management_surface, str)
        and management_surface
        and not supported_management_surface(management_surface, platform, mapping)
    ):
        unresolved.append(f"managementSurface={management_surface}")
    return {
        "operator": "all",
        "predicates": predicates,
        "unresolvedRequirements": sorted(set(unresolved)),
    }


def constraints_for(mapping: dict[str, Any] | None) -> list[dict[str, Any]]:
    """Express exact-value matching without inventing stronger/weaker ordering."""

    if mapping is None:
        return []
    constraints = []
    constrained_paths = set()
    for raw in mapping.get("constraints", []):
        if not isinstance(raw, dict) or not isinstance(raw.get("path"), str):
            continue
        path = path_to_pointer(raw["path"])
        operator = raw.get("operator")
        constraints.append(
            {
                "path": path,
                "operator": operator,
                "value": raw.get("value"),
                "strength": strength_for(operator),
            }
        )
        constrained_paths.add(path)
    for path, value in flatten_values(mapping["values"]).items():
        pointer = json_pointer(path)
        if pointer in constrained_paths:
            continue
        constraints.append(
            {
                "path": pointer,
                "operator": "equals",
                "value": value,
                "strength": strength_for("equals"),
            }
        )
    return sorted(constraints, key=lambda row: row["path"])


def parameters_for(global_id: str, mapping: dict[str, Any]) -> list[dict[str, Any]]:
    """Normalize declared parameters while leaving unresolved candidates unselectable."""

    rows = []
    for index, parameter in enumerate(
        mapping.get("parameterRequirements", []), start=1
    ):
        if not isinstance(parameter, dict):
            continue
        path = parameter.get("path")
        rows.append(
            {
                "id": f"{global_id}#parameter-{parameter.get('id', index)}",
                "path": path_to_pointer(path),
                "label": str(parameter.get("label", parameter.get("id", index))),
                "required": True,
                "valueType": "string",
            }
        )
    return rows


def source_ids_for(
    source: str,
    recommendation: dict[str, Any],
    source_index: dict[str, dict[str, Any]],
) -> list[str]:
    """Resolve recommendation evidence ids to source-qualified source records."""

    candidates = recommendation.get("sourceIds", [])
    rows = [
        f"{source}:{source_id}"
        for source_id in candidates
        if f"{source}:{source_id}" in source_index
    ]
    return sorted(set(rows))


def provenance_for(
    source: str,
    recommendation_id: str,
    source_ids: list[str],
    source_index: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    """Attach exact source identity and retained snapshot digests."""

    primary_source_id = source_ids[0] if source_ids else None
    return {
        "sourceId": primary_source_id,
        "sourceRecommendationId": recommendation_id,
        "sourceDigest": (
            source_index[primary_source_id]["digest"]
            if primary_source_id is not None
            else canonical_digest([])
        ),
        "evidence": source_ids,
    }


def public_mapping(mapping: dict[str, Any], recommendation_id: str) -> dict[str, Any]:
    """Project one exact mapping into the strict runtime shape."""

    target = mapping_target(mapping)
    row = {
        "family": mapping["kind"],
        "target": target,
        "values": mapping["values"],
    }
    instance_id = multi_instance_id(mapping, recommendation_id)
    if instance_id is not None:
        row["instanceId"] = instance_id
    return row


def disposition_reasons(
    recommendation: dict[str, Any],
    disposition: str,
    audits: list[dict[str, Any]],
    mapping: dict[str, Any] | None,
) -> list[str]:
    """Explain the disposition and any fail-closed selection result."""

    reasons = [
        str(value)
        for value in recommendation.get("relutionMapping", {}).get("notes", [])
        if isinstance(value, str) and value
    ]
    invalid = [reason for row in audits for reason in row.get("reasons", [])]
    reasons.extend(invalid)
    if disposition == "candidate":
        reasons.append("Candidate mappings are review evidence and are not selectable.")
    elif disposition == "parameter":
        reasons.append("Required parameters and exact mapping values are unresolved.")
    elif disposition == "organizational":
        reasons.append(
            "This recommendation requires organizational scope, process, or evidence; technical candidates remain nonselectable review evidence."
        )
    elif disposition == "unsupported":
        reasons.append(
            "No validated supported mapping is available in checked-in evidence."
        )
    elif disposition == "supported" and mapping is None:
        reasons.append(
            "Multiple or mixed exact mappings fail closed for runtime selection."
        )
    return list(dict.fromkeys(reasons)) or [
        "Validated exact mapping and source evidence."
    ]


def normalize_platform(value: str) -> str:
    """Use the runtime platform vocabulary."""

    return "ANDROID_ENTERPRISE" if value == "ANDROID" else value


def rationale_for(recommendation: dict[str, Any]) -> str | None:
    """Preserve rationale text from the source-specific recommendation shape."""

    return optional_text(
        recommendation.get("rationale") or recommendation.get("reason")
    )


def optional_text(value: Any) -> str | None:
    """Return a nonempty source string or None."""

    return value if isinstance(value, str) and value.strip() else None


def prerequisites_for(recommendation: dict[str, Any]) -> list[str]:
    """Expose only explicitly declared parameter prerequisites."""

    return [
        str(row["description"])
        for row in recommendation.get("relutionMapping", {}).get(
            "parameterRequirements", []
        )
        if isinstance(row, dict) and isinstance(row.get("description"), str)
    ]


def requirement_strength(recommendation: dict[str, Any]) -> str:
    """Derive strength only from explicit normative words in source text."""

    text = " ".join(
        str(recommendation.get(key, ""))
        for key in ("requirementText", "reason", "title")
    )
    if re.search(r"\bMUSS(?:TE|TEN|T)?\b", text):
        return "must"
    if re.search(r"\bSOLLTE(?:N)?\b", text):
        return "should"
    if re.search(r"\bKANN\b", text):
        return "may"
    return "not-stated"


def errata_for(recommendation: dict[str, Any]) -> dict[str, Any]:
    """Normalize source errata without interpreting it."""

    value = recommendation.get("errata")
    if value is None:
        return {"present": False, "entries": []}
    entries = value if isinstance(value, list) else [value]
    return {
        "present": bool(entries),
        "entries": [
            row if isinstance(row, dict) else {"text": str(row)} for row in entries
        ],
    }


def refresh_for_sources(
    source_ids: list[str], source_index: dict[str, dict[str, Any]]
) -> dict[str, Any]:
    """Project the most conservative freshness result across cited sources."""

    refreshes = [source_index[source_id]["refresh"] for source_id in source_ids]
    if not refreshes:
        return {
            "freshnessState": "unknown",
            "checkedAt": None,
            "outcome": "unresolved-source-provenance",
            "reportPath": "example/recommendation-coverage/source-refresh-report.json",
        }
    state = (
        "outdated"
        if any(row["freshnessState"] == "outdated" for row in refreshes)
        else "unknown"
    )
    checked = sorted(row["checkedAt"] for row in refreshes if row["checkedAt"])
    outcomes = sorted({row["outcome"] for row in refreshes})
    return {
        "freshnessState": state,
        "checkedAt": checked[-1] if checked else None,
        "outcome": "; ".join(outcomes),
        "reportPath": "example/recommendation-coverage/source-refresh-report.json",
    }


def path_to_pointer(value: Any) -> str:
    """Convert source dotted parameter paths to the runtime JSON pointer contract."""

    if not isinstance(value, str) or not value:
        return "/"
    return json_pointer(tuple(value.split(".")))


def strength_for(operator: Any) -> dict[str, str]:
    """State the source constraint ordering used by runtime comparison."""

    return {
        "equals": {"comparison": "exact", "strongerDirection": "not-defined"},
        "atLeast": {"comparison": "ordered", "strongerDirection": "higher"},
        "atMost": {"comparison": "ordered", "strongerDirection": "lower"},
        "containsAll": {"comparison": "set", "strongerDirection": "superset"},
    }.get(operator, {"comparison": "unknown", "strongerDirection": "not-defined"})


def explicit_os_version(recommendation: dict[str, Any]) -> str | None:
    """Extract only a version named in the source benchmark title."""

    title = recommendation.get("benchmarkTitle")
    if not isinstance(title, str):
        return None
    match = re.search(
        r"\b(?:Windows|iOS|iPadOS|macOS|Android)\s+(\d+(?:\.\d+)*)\b", title
    )
    return match.group(1) if match else None


def append_profile_applicability(
    predicates: list[dict[str, Any]],
    unresolved: list[str],
    values: list[Any],
) -> None:
    """Preserve explicit ownership/supervision conditions and unresolved labels."""

    ownership = set()
    supervision = set()
    for raw in values:
        value = str(raw)
        if "End-User Owned" in value:
            ownership.add("user")
        if "Institutionally-Owned" in value:
            ownership.add("organization")
        if "Unsupervised" in value:
            supervision.add("unsupervised")
        elif "Supervised" in value:
            supervision.add("supervised")
        remainder = re.sub(
            r"Level\s+[12](?:\s*\([^)]*\))?|\s*-\s*(?:End-User Owned Devices|Institutionally-Owned Devices|Unsupervised Devices|Supervised Devices)",
            "",
            value,
        ).strip(" +-()")
        if remainder:
            unresolved.append(f"profileApplicability={value}")
    if ownership:
        predicates.append(
            {
                "field": "deviceOwnership",
                "operator": "oneOf",
                "value": sorted(ownership),
            }
        )
    if supervision:
        predicates.append(
            {
                "field": "supervision",
                "operator": "oneOf",
                "value": sorted(supervision),
            }
        )


def supported_management_surface(
    surface: str, platform: str, mapping: dict[str, Any] | None
) -> bool:
    """Recognize only delivery surfaces consistent with an exact MDM mapping."""

    if mapping is None:
        return False
    family = mapping.get("kind")
    if surface == "APPLE_CONFIGURATION_PROFILE":
        return platform in {"IOS", "MACOS"} and family in {
            "apple-schema-profile",
            "apple-mobileconfig",
            "relution-native",
        }
    if surface == "MICROSOFT_INTUNE":
        return platform == "WINDOWS" and family == "relution-native"
    return False


def applicable_enrollment_channels(
    platform: str, channels: tuple[str, ...]
) -> tuple[str, ...]:
    """Exclude enrollment modes for platforms outside the source recommendation."""

    prefix = {
        "ANDROID_ENTERPRISE": "ANDROID_ENTERPRISE",
        "IOS": "IOS",
        "MACOS": "MACOS",
        "WINDOWS": "WINDOWS",
    }.get(platform)
    if prefix is None:
        return ()
    return tuple(channel for channel in channels if channel.startswith(prefix))
