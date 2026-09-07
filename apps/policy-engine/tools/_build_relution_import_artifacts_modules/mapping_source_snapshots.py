"""Cohesive implementation stage 3 for mapping_review_artifacts."""

from typing import Any
from pathlib import Path
from .artifact_paths import REPO_ROOT
from .artifact_paths import SOURCE_CHANGE_REPORT_PATH
from .artifact_io_json import read_json

def previous_source_change_rows() -> list[dict[str, Any]]:
    """Load prior source-change rows when the report already exists."""

    if not SOURCE_CHANGE_REPORT_PATH.exists():
        return []
    payload = read_json(SOURCE_CHANGE_REPORT_PATH)
    rows = payload.get("rows", []) if isinstance(payload, dict) else []
    return [row for row in rows if isinstance(row, dict)]

def previous_affected_recommendation_ids(
    previous_snapshot: dict[str, Any],
) -> list[str]:
    """Extract affected recommendation ids from a previous source snapshot."""

    return [
        str(recommendation_id)
        for recommendation_id in previous_snapshot.get("affectedRecommendationIds", [])
        if isinstance(recommendation_id, str)
    ]

def source_change_row_payload(
    current_snapshot: dict[str, Any],
    previous_snapshot: dict[str, Any],
    classification: str,
    affected_recommendation_ids: list[str],
) -> dict[str, Any]:
    """Merge current and previous source snapshots into one report row."""

    return {
        **current_snapshot,
        "changeClassification": classification,
        "classification": classification,
        "previousSha256": str(previous_snapshot.get("sha256", "")),
        "previousTextSha256": str(previous_snapshot.get("textSha256", "")),
        "affectedRecommendationIds": affected_recommendation_ids,
        "affectedRecommendationCount": len(affected_recommendation_ids),
    }

def source_change_snapshot(
    source: str, source_id: str, entry: dict[str, Any], text_hash: str
) -> dict[str, Any]:
    """Capture comparable source manifest metadata and text digest fields."""

    return {
        "source": source,
        "sourceId": source_id,
        "title": str(entry.get("title", "")),
        "url": str(entry.get("url", "")),
        "finalUrl": str(entry.get("finalUrl", "")),
        "documentDate": str(entry.get("documentDate", "")),
        "verifiedAsOf": str(entry.get("verifiedAsOf", "")),
        "localPath": str(entry.get("localPath", "")),
        "textPath": str(entry.get("textPath", "")),
        "sha256": str(entry.get("sha256", "")),
        "textSha256": text_hash,
    }

def source_manifest_paths() -> dict[str, Path]:
    """Return checked-in source manifest paths for all recommendation sources."""

    return {
        "bsi": REPO_ROOT / "example" / "bsi-references" / "downloads" / "manifest.json",
        "cis": REPO_ROOT / "example" / "cis-references" / "downloads" / "manifest.json",
        "vendor": REPO_ROOT
        / "example"
        / "vendor-references"
        / "downloads"
        / "manifest.json",
    }

def recommendation_ids_by_source_id_for(
    recommendations: dict[str, dict[str, Any]],
) -> dict[tuple[str, str], list[str]]:
    """Index recommendation ids by source id for source-change impact reports."""

    index: dict[tuple[str, str], list[str]] = {}
    for recommendation in recommendations.values():
        source = str(recommendation.get("_source", ""))
        recommendation_id = str(recommendation.get("id", ""))
        for source_id in recommendation.get("sourceIds", []):
            if isinstance(source_id, str) and source_id:
                index.setdefault((source, source_id), []).append(recommendation_id)
    for key in index:
        index[key] = sorted(set(index[key]))
    return index
