"""Implementation-category projection for normalized recommendations."""

from typing import Any

from _recommendation_mapping_modules._mapping_lexical_constants import unique_preserving_order

from .mapping_exact_targets import exact_mappings
from .recommendation_implementation_category import implementation_category


def implementation_for(source: str, recommendation: dict[str, Any], fallback_translations: list[dict[str, Any]]) -> dict[str, Any]:
    """Build implementation category, surfaces, and import path metadata."""
    relution_mapping = recommendation.get("relutionMapping", {})
    exact = exact_mappings(recommendation)
    candidate_surfaces = unique_preserving_order(candidate.get("kind") for candidate in relution_mapping.get("candidates", []) if isinstance(candidate, dict) and isinstance(candidate.get("kind"), str))
    category, blocking_reasons = implementation_category({"source": source, "recommendation": recommendation, "exact": exact, "candidateSurfaces": candidate_surfaces, "fallbackTranslations": fallback_translations, "notes": [str(note) for note in relution_mapping.get("notes", []) if isinstance(note, str) and note]})
    return {"category": category, "surfaces": implementation_surfaces(exact, candidate_surfaces, fallback_translations), "importableVia": implementation_import_paths(exact), "blockingReasons": blocking_reasons}


def implementation_surfaces(exact: list[dict[str, Any]], candidate_surfaces: list[str], fallback_translations: list[dict[str, Any]]) -> list[str]:
    """Return stable implementation-surface labels."""
    return unique_preserving_order([*(mapping["kind"] for mapping in exact), *candidate_surfaces, *( ["helper"] if fallback_translations else [])])


def implementation_import_paths(exact: list[dict[str, Any]]) -> list[str]:
    """Return supported import paths for exact mappings."""
    return unique_preserving_order([*( ["ruleset-import"] if exact else []), *( ["apply-json"] if any(mapping.get("kind") == "relution-native" for mapping in exact) else [])])
