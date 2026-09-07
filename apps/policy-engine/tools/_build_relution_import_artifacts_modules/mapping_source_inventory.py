"""Cohesive implementation stage 2 for mapping_review_artifacts."""

from typing import Any
from pathlib import Path
from .artifact_pipeline_inputs import missing_required_inputs_message
from .artifact_io_json import read_json
from .mapping_source_snapshots import previous_source_change_rows
from .mapping_source_snapshots import source_manifest_paths

def build_source_change_rows(
    recommendations: dict[str, dict[str, Any]],
    previous_rows: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Compare current source manifests with previous source-change snapshots."""
    from .mapping_source_rows import current_source_change_row, removed_source_change_row
    from .mapping_source_snapshots import recommendation_ids_by_source_id_for

    recommendation_ids_by_source_id = recommendation_ids_by_source_id_for(
        recommendations
    )
    previous_by_key = previous_source_change_rows_by_key(previous_rows)
    rows: list[dict[str, Any]] = []
    current_keys: set[tuple[str, str]] = set()
    for source, manifest_path in required_source_manifest_paths():
        manifest = read_json(manifest_path)
        if not isinstance(manifest, list):
            raise ValueError(
                "Required source manifest malformed: "
                f"source={source} path={manifest_path} expected list"
            )
        for entry in manifest:
            if not isinstance(entry, dict):
                continue
            source_id = str(entry.get("id", ""))
            if not source_id:
                continue
            key = (source, source_id)
            current_keys.add(key)
            rows.append(
                current_source_change_row(
                    source,
                    source_id,
                    entry,
                    previous_by_key.get(key),
                    recommendation_ids_by_source_id.get(key, []),
                )
            )
    for key, previous_snapshot in previous_by_key.items():
        if key in current_keys:
            continue
        rows.append(
            removed_source_change_row(
                key, previous_snapshot, recommendation_ids_by_source_id
            )
        )
    rows.sort(key=lambda row: (row["source"], row["sourceId"]))
    return rows

def previous_source_change_rows_by_key(
    previous_rows: list[dict[str, Any]] | None = None,
) -> dict[tuple[str, str], dict[str, Any]]:
    """Index previous source-change rows by source and source id."""

    return {
        (str(row.get("source", "")), str(row.get("sourceId", ""))): row
        for row in (
            previous_source_change_rows() if previous_rows is None else previous_rows
        )
        if isinstance(row, dict) and row.get("source") and row.get("sourceId")
    }

def required_source_manifest_paths() -> list[tuple[str, Path]]:
    """Return all required source manifests or fail with a complete missing list."""

    present: list[tuple[str, Path]] = []
    missing: list[tuple[str, Path]] = []
    for source, manifest_path in source_manifest_paths().items():
        if manifest_path.exists():
            present.append((source, manifest_path))
        else:
            missing.append((source, manifest_path))
    if missing:
        raise FileNotFoundError(
            missing_required_inputs_message("source manifests", present, missing)
        )
    return present
