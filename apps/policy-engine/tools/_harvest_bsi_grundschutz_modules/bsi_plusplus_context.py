"""Supports BSI Grundschutz harvesting and recommendation-mapping workflows."""
from __future__ import annotations

from .bsi_plusplus_platform_context import (
    GS_PLUSPLUS_METHOD_CONTEXT,
    GS_PLUSPLUS_RELATED_CONTROL_RULES,
    PLATFORM_GS_PLUSPLUS_TARGET_CATEGORIES,
)
from .bsi_source_text import normalize_for_match
from typing import Any

from .bsi_plusplus_lexical import lexical_plusplus_controls, slim_plusplus_control



def plusplus_context_for(
    platform: str,
    requirement: dict[str, Any],
    plusplus: dict[str, Any],
) -> dict[str, Any]:
    """Build GS++ realization-monitoring context for a BSI requirement."""

    controls_by_id = plusplus["controlsById"]
    text = " ".join(
        (
            str(requirement.get("title", "")),
            str(requirement.get("category", "")),
            str(requirement.get("requirementText", "")),
        )
    )
    matched_rules = matching_plusplus_rules(text)
    related_controls = []
    for rule in matched_rules:
        for control_id in rule["controlIds"]:
            control = controls_by_id.get(control_id)
            if control is not None:
                related_controls.append(slim_plusplus_control(control, rule["reason"]))
    if not related_controls:
        related_controls = lexical_plusplus_controls(text, controls_by_id)
    return {
        "methodDocument": GS_PLUSPLUS_METHOD_CONTEXT["documentTitle"],
        "methodVersion": GS_PLUSPLUS_METHOD_CONTEXT["documentVersion"],
        "catalogVersion": plusplus["systematics"]["catalog"]["version"],
        "policyEditorRole": "realization-monitoring-context",
        "processSteps": [
            {"step": 2, "name": "Anforderungsanalyse", "pdcaPhase": "Plan"},
            {"step": 3, "name": "Realisierung", "pdcaPhase": "Do"},
            {"step": 4, "name": "Überwachung", "pdcaPhase": "Check"},
        ],
        "platformTargetObjectCategories": list(
            PLATFORM_GS_PLUSPLUS_TARGET_CATEGORIES.get(platform, ())
        ),
        "relatedControls": merge_plusplus_controls(related_controls)[:5],
        "notes": [
            (
                "GS++ controls enrich policy context and comparison only; they do not create "
                "exact Relution mappings without concrete setting evidence."
            ),
            (
                "Local asset scope, target-object-category selection, parameter values, "
                "ownership, and risk exceptions remain institution decisions."
            ),
        ],
    }


def matching_plusplus_rules(text: str) -> list[dict[str, Any]]:
    """Return curated GS++ relation rules whose terms appear in normalized text."""
    normalized = normalize_for_match(text)
    matches = []
    for rule in GS_PLUSPLUS_RELATED_CONTROL_RULES:
        if any(normalize_for_match(term) in normalized for term in rule["terms"]):
            matches.append(rule)
    return matches


def merge_plusplus_controls(controls: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Deduplicate related GS++ controls while preserving evidence order."""
    merged: list[dict[str, Any]] = []
    seen: set[str] = set()
    for control in controls:
        control_id = str(control.get("id", ""))
        if not control_id or control_id in seen:
            continue
        seen.add(control_id)
        merged.append(control)
    return merged
