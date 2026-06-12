"""Validate manually reviewed mapping promotions for recommendation imports."""

from pathlib import Path
from typing import Any

from recommendation_mapping import build_setting_index, flatten_value_paths

from .artifact_pipeline import (
    ALL_SOURCES,
    MANUAL_MAPPING_PROMOTIONS_PATH,
    REPO_ROOT,
    mapping_target,
    normalize_policy_platform,
    read_json,
    write_json,
)
from .artifact_io import relative_path
from .mapping_helpers import mapping_with_target
from .recommendation_catalog import load_recommendations_by_global_id


def manual_promotions_by_recommendation(source: str) -> dict[str, list[dict[str, Any]]]:
    """Load valid manual promotions grouped by recommendation id for one source."""

    entries = load_manual_mapping_promotion_entries()
    if not entries:
        return {}
    grouped: dict[str, list[dict[str, Any]]] = {}
    for entry in entries:
        if str(entry.get("source", "")) != source:
            continue
        recommendation_id = str(entry.get("recommendationId", ""))
        mapping = manual_promotion_ruleset_mapping(entry)
        if recommendation_id and mapping is not None:
            grouped.setdefault(recommendation_id, []).append(mapping)
    return grouped


def load_manual_mapping_promotion_entries() -> list[dict[str, Any]]:
    """Read promotion ledger entries after validating the outer JSON shape."""

    if not MANUAL_MAPPING_PROMOTIONS_PATH.exists():
        return []
    payload = read_json(MANUAL_MAPPING_PROMOTIONS_PATH)
    if not isinstance(payload, dict):
        raise ValueError(
            f"{relative_path(MANUAL_MAPPING_PROMOTIONS_PATH)} must contain a JSON object"
        )
    entries = payload.get("entries", [])
    if not isinstance(entries, list):
        raise ValueError(
            f"{relative_path(MANUAL_MAPPING_PROMOTIONS_PATH)} entries must be an array"
        )
    return [entry for entry in entries if isinstance(entry, dict)]


def ensure_manual_mapping_promotions_file(
    path: Path = MANUAL_MAPPING_PROMOTIONS_PATH,
) -> None:
    """Create the empty manual promotion ledger when it does not exist yet."""

    if path.exists():
        return
    write_json(
        path,
        {
            "version": 1,
            "name": "Manual Mapping Promotions",
            "entries": [],
        },
    )


def validate_manual_mapping_promotions(
    exact_references: list[dict[str, Any]], path: Path = MANUAL_MAPPING_PROMOTIONS_PATH
) -> list[dict[str, Any]]:
    """Validate that manual promotions reference known recommendations and fields."""

    payload = read_json(path)
    path_label = manual_mapping_promotions_path_label(path)
    if not isinstance(payload, dict):
        raise ValueError(f"{path_label} must contain a JSON object")
    if payload.get("version") != 1:
        raise ValueError(f"{path_label} version must be 1")
    entries = payload.get("entries", [])
    if not isinstance(entries, list):
        raise ValueError(f"{path_label} entries must be an array")

    references = {str(row["mappingId"]) for row in exact_references}
    recommendations = load_recommendations_by_global_id()
    field_index = build_setting_index()
    errors: list[str] = []
    valid_entries: list[dict[str, Any]] = []
    for index, entry in enumerate(entries):
        if isinstance(entry, dict):
            errors.extend(
                validate_manual_mapping_promotion_entry(
                    index, entry, references, recommendations, field_index
                )
            )
            valid_entries.append(entry)
        else:
            errors.append(f"entry {index}: must be an object")
    if errors:
        raise ValueError(
            "Invalid manual mapping promotion ledger:\n" + "\n".join(errors)
        )
    return valid_entries


def validate_manual_mapping_promotion_entry(
    index: int,
    entry: dict[str, Any],
    references: set[str],
    recommendations: dict[str, dict[str, Any]],
    field_index: dict[str, list[Any]],
) -> list[str]:
    """Return validation errors for one manual promotion ledger entry."""

    errors: list[str] = []
    source = str(entry.get("source", ""))
    recommendation_id = str(entry.get("recommendationId", ""))
    global_id = f"{source}:{recommendation_id}"
    recommendation = recommendations.get(global_id)
    if source not in ALL_SOURCES:
        errors.append(f"entry {index}: unknown source {source!r}")
    platform = validated_manual_mapping_platform(
        index, entry, recommendation, global_id, errors
    )
    reference_ids = [
        str(value)
        for value in entry.get("referenceMappingIds", [])
        if isinstance(value, str)
    ]
    if not reference_ids or any(
        reference_id not in references for reference_id in reference_ids
    ):
        errors.append(
            f"entry {index}: referenceMappingIds must point to exact mapping references"
        )
    mapping = manual_promotion_ruleset_mapping(entry)
    if mapping is None:
        errors.append(
            f"entry {index}: mapping must include kind, target, and object values"
        )
    elif not manual_promotion_target_is_valid(platform, mapping, field_index):
        errors.append(
            f"entry {index}: mapping target or field paths are not valid for {platform}"
        )
    if (
        not isinstance(entry.get("reviewerNote"), str)
        or not str(entry.get("reviewerNote", "")).strip()
    ):
        errors.append(f"entry {index}: reviewerNote is required")
    if not isinstance(entry.get("evidenceRefs"), list) or not entry.get("evidenceRefs"):
        errors.append(f"entry {index}: evidenceRefs are required")
    return errors


def validated_manual_mapping_platform(
    index: int,
    entry: dict[str, Any],
    recommendation: dict[str, Any] | None,
    global_id: str,
    errors: list[str],
) -> str:
    """Validate a promotion entry platform against its target recommendation."""

    if recommendation is None:
        errors.append(f"entry {index}: unknown recommendation {global_id!r}")
        return str(entry.get("platform", ""))
    platform = normalize_policy_platform(str(recommendation.get("platform", "")))
    if normalize_policy_platform(str(entry.get("platform", platform))) != platform:
        errors.append(f"entry {index}: platform does not match recommendation")
    if str(recommendation.get("relutionMapping", {}).get("status", "none")) == "exact":
        errors.append(f"entry {index}: recommendation is already exact")
    return platform


def manual_mapping_promotions_path_label(path: Path) -> str:
    """Render promotion-ledger paths relative to the repo when possible."""

    try:
        return relative_path(path)
    except ValueError:
        return path.as_posix()


def manual_promotion_ruleset_mapping(entry: dict[str, Any]) -> dict[str, Any] | None:
    """Convert one validated manual promotion entry to a ruleset mapping."""

    raw_mapping = entry.get("mapping")
    if not isinstance(raw_mapping, dict):
        return None
    kind = raw_mapping.get("kind")
    target = raw_mapping.get("target")
    values = raw_mapping.get("values")
    if (
        not isinstance(kind, str)
        or not isinstance(target, str)
        or not isinstance(values, dict)
    ):
        return None
    mapping = mapping_with_target(kind, target, values, allow_default=False)
    if mapping is None:
        return None
    mapping["match"] = {
        "score": 100,
        "matchedTerms": [
            str(value)
            for value in entry.get("evidenceRefs", [])
            if isinstance(value, str)
        ],
        "valueCompatibility": "manual-reviewed",
        "reason": str(entry.get("reviewerNote", "Manual mapping promotion.")),
    }
    if isinstance(raw_mapping.get("constraints"), list):
        mapping["constraints"] = [
            dict(value)
            for value in raw_mapping["constraints"]
            if isinstance(value, dict)
        ]
    return mapping


def manual_promotion_target_is_valid(
    platform: str, mapping: dict[str, Any], field_index: dict[str, list[Any]]
) -> bool:
    """Check that a manual promotion targets known payloads or setting fields."""

    target = mapping_target(mapping)
    if target is None:
        return False
    if mapping.get("kind") == "apple-mobileconfig":
        evidence_path = (
            REPO_ROOT
            / "example"
            / "vendor-references"
            / "downloads"
            / "derived"
            / "apple-mobileconfig-evidence.json"
        )
        if not evidence_path.exists():
            return False
        payload = read_json(evidence_path)
        payload_types = {
            str(entry.get("payloadType", ""))
            for entry in payload.get("settings", [])
            if isinstance(entry, dict)
        }
        return target in payload_types
    available_paths = {
        str(field.field_path)
        for field in field_index.get(platform, [])
        if field.kind == mapping.get("kind") and field.target == target
    }
    return bool(available_paths) and all(
        path in available_paths
        for path in flatten_value_paths(mapping.get("values", {}))
    )
