"""Cohesive implementation stage 3 for manual_mapping_promotions."""

from .artifact_paths import ALL_SOURCES
from typing import Any
from pathlib import Path
from .artifact_io_values import normalize_policy_platform
from .artifact_io_paths import relative_path

def validate_manual_mapping_promotion_entry(
    index: int,
    entry: dict[str, Any],
    references: set[str],
    recommendations: dict[str, dict[str, Any]],
    field_index: dict[str, list[Any]],
) -> list[str]:
    """Return validation errors for one manual promotion ledger entry."""
    from .manual_mapping_promotion_mappings import manual_promotion_ruleset_mapping
    from .manual_mapping_promotion_targets import manual_promotion_target_is_valid

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
