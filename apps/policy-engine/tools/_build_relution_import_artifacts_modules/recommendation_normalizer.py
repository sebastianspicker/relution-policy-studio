"""Normalization pipeline for harvested recommendation records."""

from collections.abc import Callable
from typing import Any

from _recommendation_mapping_modules._mapping_lexical_constants import unique_preserving_order

from .artifact_paths import ALLOWED_MAPPING_STATUSES
from .recommendation_implementation import implementation_for
from .recommendation_mapping_entries import optional_dict_entries, record_mapping_diagnostic, valid_exact_mappings


def normalize_recommendations(source: str, recommendations: list[dict[str, Any]], *, get_promotions: Callable[[str], dict[str, list[dict[str, Any]]]] | None = None) -> list[dict[str, Any]]:
    """Normalize mappings, fallback translations, and implementation metadata."""
    normalized: list[dict[str, Any]] = []
    manual_promotions = get_promotions(source) if get_promotions is not None else {}
    for recommendation in recommendations:
        entry, diagnostics = dict(recommendation), []
        entry.pop("normalizationDiagnostics", None)
        entry["relutionMapping"] = normalize_relution_mapping(source, entry, diagnostics, manual_promotions.get(str(entry.get("id", "")), []))
        fallback_translations = normalize_fallback_translations(source, entry, diagnostics)
        entry["fallbackTranslations"] = fallback_translations
        entry["implementation"] = implementation_for(source, entry, fallback_translations)
        if diagnostics:
            entry["normalizationDiagnostics"] = diagnostics
        normalized.append(entry)
    return normalized


def normalize_relution_mapping(source: str, recommendation: dict[str, Any], diagnostics: list[dict[str, Any]], manual_promotions: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    """Return validated Relution mapping metadata for one recommendation."""
    raw_mapping = recommendation.get("relutionMapping", {})
    if not isinstance(raw_mapping, dict):
        record_mapping_diagnostic(source, recommendation, diagnostics, {"field": "relutionMapping", "droppedCount": 1, "reason": "expected object"})
        raw_mapping = {}
    status = str(raw_mapping.get("status", "none"))
    if status not in ALLOWED_MAPPING_STATUSES:
        raise ValueError(f"{recommendation.get('id', '<unknown>')}: unknown Relution mapping status {status!r}")
    candidates = optional_dict_entries(source, recommendation, "relutionMapping.candidates", raw_mapping.get("candidates"), diagnostics)
    ruleset_mappings = optional_dict_entries(source, recommendation, "relutionMapping.rulesetMappings", raw_mapping.get("rulesetMappings"), diagnostics)
    notes = [str(note) for note in raw_mapping.get("notes", []) if isinstance(note, str) and note]
    if manual_promotions:
        ruleset_mappings = [*ruleset_mappings, *manual_promotions]
        status, notes = "exact", unique_preserving_order([*notes, "Exact mapping promoted by validated manual mapping ledger."])
    exact = valid_exact_mappings(status, ruleset_mappings)
    if status == "exact" and not exact:
        raise ValueError(f"{recommendation.get('id', '<unknown>')}: exact mappings require supported non-empty rulesetMappings")
    return {"status": status, "mergeableInImportableRuleset": bool(exact), "candidates": candidates, "rulesetMappings": ruleset_mappings, "notes": notes, **({"parameterRequirements": list(raw_mapping["parameterRequirements"])} if isinstance(raw_mapping.get("parameterRequirements"), list) else {}), **({"processSupport": list(raw_mapping["processSupport"])} if isinstance(raw_mapping.get("processSupport"), list) else {})}


def normalize_fallback_translations(source: str, recommendation: dict[str, Any], diagnostics: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Return validated helper-only fallback translation entries."""
    translations = recommendation.get("fallbackTranslations")
    if translations is not None:
        normalized = optional_dict_entries(source, recommendation, "fallbackTranslations", translations, diagnostics)
        if isinstance(translations, list):
            return normalized
    return []
