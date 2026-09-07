"""Index helpers for recommendation mapping."""

from ._mapping_paths import APPLE_SCHEMA_CATALOG_PATH
from typing import Any
from ._mapping_models import FieldEntry
from pathlib import Path
from ._mapping_paths import TEMPLATE_BUNDLE_PATH
from .field_matching_apple_catalog import apple_schema_fields
from .field_matching_candidates import candidate_from_score
from .field_matching_candidates import candidate_key
from .field_matching_values import flatten_value_paths
from .field_matching_relution_catalog import relution_fields
from .field_matching_scoring import score_fields

def build_setting_index(
    template_bundle_path: Path = TEMPLATE_BUNDLE_PATH,
    apple_schema_catalog_path: Path = APPLE_SCHEMA_CATALOG_PATH,
) -> dict[str, list[FieldEntry]]:
    """Build platform-indexed Relution and Apple field metadata."""
    indexed: dict[str, list[FieldEntry]] = {}
    for field in relution_fields(template_bundle_path):
        for platform in field.platforms:
            indexed.setdefault(platform, []).append(field)
    if apple_schema_catalog_path.exists():
        for field in apple_schema_fields(apple_schema_catalog_path):
            for platform in field.platforms:
                indexed.setdefault(platform, []).append(field)
    for fields in indexed.values():
        fields.sort(key=lambda field: (field.kind, field.target, field.field_path))
    return indexed
def mapping_candidates(
    platform: str,
    title: str,
    section: str,
    field_index: dict[str, list[FieldEntry]],
    options: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Return ranked mapping candidates for recommendation text and options."""
    options = options or {}
    limit = int(options.get("limit", 5))
    candidates = [
        candidate_from_score(entry)
        for entry in scored_candidate_fields(
            platform, title, section, field_index, options
        )[:limit]
    ]
    candidates = prepend_exact_mapping_candidates(
        candidates, options.get("exactMapping")
    )
    return candidates[:limit]
def scored_candidate_fields(
    platform: str,
    title: str,
    section: str,
    field_index: dict[str, list[FieldEntry]],
    options: dict[str, Any],
) -> list[Any]:
    """Score fields with optional extra text, value, and kind constraints."""
    return score_fields(
        platform,
        title,
        section,
        field_index,
        {
            "extraTexts": tuple(str(text) for text in options.get("extraTexts", ())),
            "recommendedValue": options.get("recommendedValue"),
            "allowedKinds": options.get("allowedKinds"),
        },
    )
def prepend_exact_mapping_candidates(
    candidates: list[dict[str, Any]], exact_mapping: Any
) -> list[dict[str, Any]]:
    """Put caller-provided exact mappings ahead of inferred candidates."""
    if not isinstance(exact_mapping, tuple):
        return candidates
    target, values = exact_mapping
    for path in flatten_value_paths(values):
        exact_candidate = {
            "kind": "relution-native",
            "target": target,
            "fieldPaths": [path],
        }
        candidates = [
            exact_candidate,
            *[
                candidate
                for candidate in candidates
                if candidate_key(candidate) != candidate_key(exact_candidate)
            ],
        ]
    return candidates
