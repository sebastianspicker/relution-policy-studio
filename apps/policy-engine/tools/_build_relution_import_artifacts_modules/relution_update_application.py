"""Cohesive implementation stage 6 for relution_mapping_updates."""

from .artifact_paths import ALL_SOURCES
from typing import Any
from .artifact_paths import RELUTION_MAPPING_UPDATE_PLAN_PATH
from .artifact_io_json import read_json
from .artifact_io_paths import relative_path
from .artifact_io_json import write_json

def apply_safe_relution_mapping_updates(
    selected_sources: list[str] | None = None,
) -> dict[str, Any]:
    """Mark safe update-plan rows as applied without changing recommendation catalogs."""
    if not RELUTION_MAPPING_UPDATE_PLAN_PATH.exists():
        raise ValueError(
            f"{relative_path(RELUTION_MAPPING_UPDATE_PLAN_PATH)} does not exist; "
            "build artifacts first"
        )
    payload = read_json(RELUTION_MAPPING_UPDATE_PLAN_PATH)
    if not isinstance(payload, dict):
        raise ValueError(
            f"{relative_path(RELUTION_MAPPING_UPDATE_PLAN_PATH)} must contain a JSON object"
        )
    source_filter = set(selected_sources or ALL_SOURCES)
    applied = 0
    skipped = 0
    rows: list[dict[str, Any]] = []
    for raw_row in payload.get("rows", []):
        if not isinstance(raw_row, dict):
            continue
        row = dict(raw_row)
        if row.get("source") not in source_filter:
            row["applicationStatus"] = "skipped-source-filter"
            skipped += 1
        elif row.get("requiredAction") == "apply-safe":
            row["applicationStatus"] = "applied"
            applied += 1
        else:
            row["applicationStatus"] = "skipped-review-required"
            skipped += 1
        rows.append(row)
    payload["rows"] = rows
    payload["applySummary"] = {
        "mode": "apply-safe",
        "selectedSources": sorted(source_filter),
        "appliedRows": applied,
        "skippedRows": skipped,
        "reviewRequiredRows": sum(
            1
            for row in rows
            if row.get("applicationStatus") == "skipped-review-required"
        ),
    }
    write_json(RELUTION_MAPPING_UPDATE_PLAN_PATH, payload)
    return payload["applySummary"]
