"""Validation and diagnostics for optional recommendation mapping entries."""

from typing import Any

from .mapping_exact_targets import mapping_target


def optional_dict_entries(source: str, recommendation: dict[str, Any], field: str, value: Any, diagnostics: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Return optional list entries that are dictionaries, recording drops."""
    if value is None:
        return []
    if not isinstance(value, list):
        record_mapping_diagnostic(source, recommendation, diagnostics, {"field": field, "droppedCount": 1, "reason": "expected array"})
        return []
    entries = [dict(entry) for entry in value if isinstance(entry, dict)]
    if dropped_count := len(value) - len(entries):
        record_mapping_diagnostic(source, recommendation, diagnostics, {"field": field, "droppedCount": dropped_count, "reason": "expected object entries"})
    return entries


def optional_string_entries(source: str, recommendation: dict[str, Any], field: str, value: Any, diagnostics: list[dict[str, Any]]) -> list[str]:
    """Return optional list entries that are strings, recording drops."""
    if value is None:
        return []
    if not isinstance(value, list):
        record_mapping_diagnostic(source, recommendation, diagnostics, {"field": field, "droppedCount": 1, "reason": "expected array"})
        return []
    entries = [entry for entry in value if isinstance(entry, str)]
    if dropped_count := len(value) - len(entries):
        record_mapping_diagnostic(source, recommendation, diagnostics, {"field": field, "droppedCount": dropped_count, "reason": "expected string entries"})
    return entries


def record_mapping_diagnostic(source: str, recommendation: dict[str, Any], diagnostics: list[dict[str, Any]], detail: dict[str, Any]) -> None:
    """Append a normalized warning about dropped optional mapping evidence."""
    recommendation_id = str(recommendation.get("id", recommendation.get("recommendationId", "<unknown>")))
    field, dropped_count, reason = str(detail["field"]), int(detail["droppedCount"]), str(detail["reason"])
    diagnostics.append({"level": "warning", "code": "dropped-optional-mapping-evidence", "source": source, "recommendationId": recommendation_id, "field": field, "droppedCount": dropped_count, "message": f"{source}:{recommendation_id} dropped {dropped_count} optional mapping evidence item(s) from {field}: {reason}."})


def valid_exact_mappings(status: str, mappings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Return exact mappings only when all required target fields are present."""
    if status != "exact" or not mappings:
        return []
    exact: list[dict[str, Any]] = []
    for mapping in mappings:
        if not isinstance(mapping.get("kind"), str) or mapping_target(mapping) is None or not isinstance(mapping.get("values"), dict):
            return []
        exact.append(mapping)
    return exact
