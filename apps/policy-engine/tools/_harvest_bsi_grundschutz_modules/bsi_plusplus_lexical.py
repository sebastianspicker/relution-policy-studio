"""Supports BSI Grundschutz harvesting and recommendation-mapping workflows."""
from __future__ import annotations

from .bsi_source_collections import natural_control_sort_key
from .bsi_source_text import token_set

from typing import Any

def lexical_plusplus_controls(
    text: str, controls_by_id: dict[str, dict[str, Any]]
) -> list[dict[str, Any]]:
    """Fallback-match GS++ controls by token overlap within policy practices."""

    tokens = token_set(text)
    if not tokens:
        return []
    scored = []
    for control in controls_by_id.values():
        if control.get("practiceId") not in {
            "ASST",
            "ARCH",
            "BER",
            "DET",
            "KONF",
            "NOT",
            "TEST",
        }:
            continue
        control_tokens = token_set(
            f"{control.get('title', '')} {control.get('statement', '')} {control.get('result', '')}"
        )
        overlap = tokens.intersection(control_tokens)
        if len(overlap) < 2 and not any(len(token) >= 9 for token in overlap):
            continue
        scored.append(
            (len(overlap), str(control.get("id", "")), control, sorted(overlap))
        )
    scored.sort(key=lambda entry: (-entry[0], natural_control_sort_key(entry[1])))
    return [
        slim_plusplus_control(control, f"lexical overlap: {', '.join(overlap[:4])}")
        for _, _, control, overlap in scored[:3]
    ]


def slim_plusplus_control(control: dict[str, Any], match_reason: str) -> dict[str, Any]:
    """Project a GS++ control to the compact context embedded in recommendations."""
    return {
        "id": control["id"],
        "title": control["title"],
        "practiceId": control["practiceId"],
        "practiceTitle": control["practiceTitle"],
        "controlGroupId": control["controlGroupId"],
        "controlGroupTitle": control["controlGroupTitle"],
        "securityLevel": control["securityLevel"],
        "effortLevel": control["effortLevel"],
        "modalVerb": control["modalVerb"],
        "actionWord": control["actionWord"],
        "targetObjectCategories": control["targetObjectCategories"],
        "documentation": control["documentation"],
        "tags": control["tags"],
        "parameters": control["parameters"],
        "statement": control["statement"],
        "matchReason": match_reason,
    }
