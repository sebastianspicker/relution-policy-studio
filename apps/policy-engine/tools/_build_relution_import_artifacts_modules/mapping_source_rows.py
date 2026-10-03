"""Cohesive implementation stage 4 for mapping_review_artifacts."""

from typing import Any

def current_source_change_row(
    source: str,
    source_id: str,
    entry: dict[str, Any],
    previous_snapshot: dict[str, Any] | None,
    affected_recommendation_ids: list[str],
) -> dict[str, Any]:
    """Build the source-change row for a source still present in the manifest."""
    from .mapping_source_classification import classify_source_change, source_text_hash
    from .mapping_source_snapshots import source_change_row_payload, source_change_snapshot

    source_body_availability = "available"
    try:
        text_sha256 = source_text_hash(entry)
    except FileNotFoundError:
        text_sha256 = str((previous_snapshot or {}).get("textSha256", ""))
        source_body_availability = (
            "retained-hash-source-body-missing"
            if text_sha256
            else "missing-without-retained-hash"
        )
    current_snapshot = source_change_snapshot(source, source_id, entry, text_sha256)
    previous_or_current = previous_snapshot or current_snapshot
    row = source_change_row_payload(
        current_snapshot,
        previous_or_current,
        classify_source_change(previous_snapshot, current_snapshot),
        affected_recommendation_ids,
    )
    row["sourceBodyAvailability"] = source_body_availability
    return row

def removed_source_change_row(
    key: tuple[str, str],
    previous_snapshot: dict[str, Any],
    recommendation_ids_by_source_id: dict[tuple[str, str], list[str]],
) -> dict[str, Any]:
    """Build the source-change row for a source removed from the manifest."""
    from .mapping_source_snapshots import previous_affected_recommendation_ids, source_change_row_payload, source_change_snapshot

    source, source_id = key
    affected_recommendation_ids = previous_affected_recommendation_ids(
        previous_snapshot
    )
    if not affected_recommendation_ids:
        affected_recommendation_ids = recommendation_ids_by_source_id.get(key, [])
    return source_change_row_payload(
        source_change_snapshot(
            source,
            source_id,
            previous_snapshot,
            str(previous_snapshot.get("textSha256", "")),
        ),
        previous_snapshot,
        "removed-source",
        affected_recommendation_ids,
    )
