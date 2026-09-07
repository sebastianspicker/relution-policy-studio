"""Cohesive implementation stage 1 for manual_mapping_promotions."""

from typing import Any
from .artifact_paths import MANUAL_MAPPING_PROMOTIONS_PATH
from pathlib import Path
from .artifact_io_json import read_json
from .artifact_io_paths import relative_path
from .artifact_io_json import write_json

def manual_promotions_by_recommendation(source: str) -> dict[str, list[dict[str, Any]]]:
    """Load valid manual promotions grouped by recommendation id for one source."""
    from .manual_mapping_promotion_mappings import manual_promotion_ruleset_mapping

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
