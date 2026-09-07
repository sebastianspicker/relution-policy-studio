"""Implementation support-category decisions."""

from typing import Any


def implementation_category(state: dict[str, Any]) -> tuple[str, list[str]]:
    """Classify implementation support and blocking reasons for one recommendation."""
    source, recommendation, exact = str(state["source"]), state["recommendation"], state["exact"]
    candidate_surfaces, fallback_translations, notes = state["candidateSurfaces"], state["fallbackTranslations"], state["notes"]
    if exact:
        return "relution-achievable", notes
    if candidate_surfaces:
        return "relution-partial", notes or ["Current repo mappings cover only part of this recommendation."]
    if recommendation.get("relutionMapping", {}).get("status") == "parameterized":
        return "relution-partial", notes or ["Relution can support this BSI requirement, but local parameters or process evidence are required."]
    if fallback_translations:
        return "helper-only", notes or ["No exact Relution mapping is available; only structured helper guidance is available."]
    if source == "bsi" and recommendation.get("status") == "retired":
        return "gap", notes or ["This BSI requirement is marked retired and is not emitted as an actionable control."]
    return "gap", notes or ["No current Relution-native, Apple transport, or helper translation is available in this repo."]
