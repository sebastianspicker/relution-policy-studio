"""Normalize harvested recommendation records and mapping metadata."""

from collections.abc import Callable
from typing import Any

from recommendation_mapping import unique_preserving_order

from .artifact_paths import ALLOWED_MAPPING_STATUSES
from .mapping_helpers import exact_mappings, mapping_target


def normalize_recommendations(
    source: str,
    recommendations: list[dict[str, Any]],
    *,
    get_promotions: Callable[[str], dict[str, list[dict[str, Any]]]] | None = None,
) -> list[dict[str, Any]]:
    """Normalize mappings, fallback translations, and implementation metadata."""

    normalized: list[dict[str, Any]] = []
    manual_promotions = get_promotions(source) if get_promotions is not None else {}
    for recommendation in recommendations:
        entry = dict(recommendation)
        diagnostics: list[dict[str, Any]] = []
        entry.pop("normalizationDiagnostics", None)
        entry["relutionMapping"] = normalize_relution_mapping(
            source,
            entry,
            diagnostics,
            manual_promotions.get(str(entry.get("id", "")), []),
        )
        fallback_translations = normalize_fallback_translations(
            source, entry, diagnostics
        )
        entry["fallbackTranslations"] = fallback_translations
        entry["implementation"] = implementation_for(
            source, entry, fallback_translations
        )
        if diagnostics:
            entry["normalizationDiagnostics"] = diagnostics
        normalized.append(entry)
    return normalized


def normalize_relution_mapping(
    source: str,
    recommendation: dict[str, Any],
    diagnostics: list[dict[str, Any]],
    manual_promotions: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Return validated Relution mapping metadata for one recommendation."""

    raw_mapping = recommendation.get("relutionMapping", {})
    if not isinstance(raw_mapping, dict):
        record_mapping_diagnostic(
            source,
            recommendation,
            diagnostics,
            {
                "field": "relutionMapping",
                "droppedCount": 1,
                "reason": "expected object",
            },
        )
        raw_mapping = {}
    status = str(raw_mapping.get("status", "none"))
    if status not in ALLOWED_MAPPING_STATUSES:
        raise ValueError(
            f"{recommendation.get('id', '<unknown>')}: unknown Relution mapping status {status!r}"
        )

    candidates = optional_dict_entries(
        source,
        recommendation,
        "relutionMapping.candidates",
        raw_mapping.get("candidates"),
        diagnostics,
    )
    ruleset_mappings = optional_dict_entries(
        source,
        recommendation,
        "relutionMapping.rulesetMappings",
        raw_mapping.get("rulesetMappings"),
        diagnostics,
    )
    notes = [
        str(note)
        for note in raw_mapping.get("notes", [])
        if isinstance(note, str) and note
    ]
    if manual_promotions:
        ruleset_mappings = [
            *ruleset_mappings,
            *manual_promotions,
        ]
        status = "exact"
        notes = unique_preserving_order(
            [*notes, "Exact mapping promoted by validated manual mapping ledger."]
        )
    exact = valid_exact_mappings(status, ruleset_mappings)
    if status == "exact" and not exact:
        raise ValueError(
            f"{recommendation.get('id', '<unknown>')}: exact mappings require "
            "supported non-empty rulesetMappings"
        )
    return {
        "status": status,
        "mergeableInImportableRuleset": bool(exact),
        "candidates": candidates,
        "rulesetMappings": ruleset_mappings,
        "notes": notes,
        **(
            {"parameterRequirements": list(raw_mapping["parameterRequirements"])}
            if isinstance(raw_mapping.get("parameterRequirements"), list)
            else {}
        ),
        **(
            {"processSupport": list(raw_mapping["processSupport"])}
            if isinstance(raw_mapping.get("processSupport"), list)
            else {}
        ),
    }


def optional_dict_entries(
    source: str,
    recommendation: dict[str, Any],
    field: str,
    value: Any,
    diagnostics: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Return optional list entries that are dictionaries, recording drops."""

    if value is None:
        return []
    if not isinstance(value, list):
        record_mapping_diagnostic(
            source,
            recommendation,
            diagnostics,
            {"field": field, "droppedCount": 1, "reason": "expected array"},
        )
        return []
    entries: list[dict[str, Any]] = []
    dropped_count = 0
    for entry in value:
        if isinstance(entry, dict):
            entries.append(dict(entry))
        else:
            dropped_count += 1
    if dropped_count:
        record_mapping_diagnostic(
            source,
            recommendation,
            diagnostics,
            {
                "field": field,
                "droppedCount": dropped_count,
                "reason": "expected object entries",
            },
        )
    return entries


def optional_string_entries(
    source: str,
    recommendation: dict[str, Any],
    field: str,
    value: Any,
    diagnostics: list[dict[str, Any]],
) -> list[str]:
    """Return optional list entries that are strings, recording drops."""

    if value is None:
        return []
    if not isinstance(value, list):
        record_mapping_diagnostic(
            source,
            recommendation,
            diagnostics,
            {"field": field, "droppedCount": 1, "reason": "expected array"},
        )
        return []
    entries: list[str] = []
    dropped_count = 0
    for entry in value:
        if isinstance(entry, str):
            entries.append(entry)
        else:
            dropped_count += 1
    if dropped_count:
        record_mapping_diagnostic(
            source,
            recommendation,
            diagnostics,
            {
                "field": field,
                "droppedCount": dropped_count,
                "reason": "expected string entries",
            },
        )
    return entries


def record_mapping_diagnostic(
    source: str,
    recommendation: dict[str, Any],
    diagnostics: list[dict[str, Any]],
    detail: dict[str, Any],
) -> None:
    """Append a normalized warning about dropped optional mapping evidence."""

    recommendation_id = str(
        recommendation.get("id", recommendation.get("recommendationId", "<unknown>"))
    )
    field = str(detail["field"])
    dropped_count = int(detail["droppedCount"])
    reason = str(detail["reason"])
    diagnostics.append(
        {
            "level": "warning",
            "code": "dropped-optional-mapping-evidence",
            "source": source,
            "recommendationId": recommendation_id,
            "field": field,
            "droppedCount": dropped_count,
            "message": (
                f"{source}:{recommendation_id} dropped {dropped_count} optional "
                f"mapping evidence item(s) from {field}: {reason}."
            ),
        }
    )


def valid_exact_mappings(
    status: str, mappings: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Return exact mappings only when all required target fields are present."""

    if status != "exact" or not mappings:
        return []
    exact: list[dict[str, Any]] = []
    for mapping in mappings:
        if (
            not isinstance(mapping.get("kind"), str)
            or mapping_target(mapping) is None
            or not isinstance(mapping.get("values"), dict)
        ):
            return []
        exact.append(mapping)
    return exact


def normalize_fallback_translations(
    source: str,
    recommendation: dict[str, Any],
    diagnostics: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Return validated helper-only fallback translation entries."""

    translations = recommendation.get("fallbackTranslations")
    if translations is not None:
        normalized = optional_dict_entries(
            source, recommendation, "fallbackTranslations", translations, diagnostics
        )
        if isinstance(translations, list):
            return normalized
    return []


def implementation_for(
    source: str,
    recommendation: dict[str, Any],
    fallback_translations: list[dict[str, Any]],
) -> dict[str, Any]:
    """Build implementation category, surfaces, and import path metadata."""

    relution_mapping = recommendation.get("relutionMapping", {})
    exact = exact_mappings(recommendation)
    exact_surfaces = unique_preserving_order(mapping["kind"] for mapping in exact)
    candidate_surfaces = unique_preserving_order(
        candidate.get("kind")
        for candidate in relution_mapping.get("candidates", [])
        if isinstance(candidate, dict) and isinstance(candidate.get("kind"), str)
    )
    surfaces = unique_preserving_order(
        [
            *exact_surfaces,
            *candidate_surfaces,
            *(["helper"] if fallback_translations else []),
        ]
    )
    importable_via = unique_preserving_order(
        [
            *(["ruleset-import"] if exact else []),
            *(
                ["apply-json"]
                if any(mapping.get("kind") == "relution-native" for mapping in exact)
                else []
            ),
        ]
    )
    notes = [
        str(note)
        for note in relution_mapping.get("notes", [])
        if isinstance(note, str) and note
    ]
    category, blocking_reasons = implementation_category(
        {
            "source": source,
            "recommendation": recommendation,
            "exact": exact,
            "candidateSurfaces": candidate_surfaces,
            "fallbackTranslations": fallback_translations,
            "notes": notes,
        }
    )
    return {
        "category": category,
        "surfaces": surfaces,
        "importableVia": importable_via,
        "blockingReasons": blocking_reasons,
    }


def implementation_category(state: dict[str, Any]) -> tuple[str, list[str]]:
    """Classify implementation support and blocking reasons for one recommendation."""

    source = str(state["source"])
    recommendation = state["recommendation"]
    exact = state["exact"]
    candidate_surfaces = state["candidateSurfaces"]
    fallback_translations = state["fallbackTranslations"]
    notes = state["notes"]
    if exact:
        return "relution-achievable", notes
    if candidate_surfaces:
        return "relution-partial", notes or [
            "Current repo mappings cover only part of this recommendation."
        ]
    if recommendation.get("relutionMapping", {}).get("status") == "parameterized":
        return "relution-partial", notes or [
            (
                "Relution can support this BSI requirement, but local parameters or process "
                "evidence are required."
            )
        ]
    if fallback_translations:
        return "helper-only", notes or [
            "No exact Relution mapping is available; only structured helper guidance is available."
        ]
    if source == "bsi" and recommendation.get("status") == "retired":
        return "gap", notes or [
            "This BSI requirement is marked retired and is not emitted as an actionable control."
        ]
    return "gap", notes or [
        (
            "No current Relution-native, Apple transport, or helper translation is "
            "available in this repo."
        )
    ]
