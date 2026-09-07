"""Supports BSI Grundschutz harvesting and recommendation-mapping workflows."""
from __future__ import annotations

from typing import Any

def semantic_evidence_sources_for(
    requirement: dict[str, Any],
    checklist_context: dict[str, Any],
    plusplus_context: dict[str, Any],
) -> list[dict[str, Any]]:
    """Compose weighted text sources for downstream semantic mapping inference."""
    sources: list[dict[str, Any]] = [
        {
            "source": "bsi-title",
            "sourceId": str(requirement.get("requirementId", "")),
            "text": str(requirement.get("title", "")),
            "confidence": 0.9,
        },
        {
            "source": "bsi-requirement",
            "sourceId": str(requirement.get("requirementId", "")),
            "text": str(requirement.get("requirementText", "")),
            "confidence": 0.78,
        },
        {
            "source": "bsi-category",
            "sourceId": str(requirement.get("requirementId", "")),
            "text": str(requirement.get("category", "")),
            "confidence": 0.58,
        },
    ]
    checklist_text = checklist_context.get("individualChecklistText")
    if isinstance(checklist_text, str) and checklist_text:
        sources.append(
            {
                "source": "kompendium-checklist",
                "sourceId": str(requirement.get("requirementId", "")),
                "text": checklist_text,
                "confidence": 0.74,
            }
        )
    for item in checklist_context.get("relatedChecklistItems", []):
        if not isinstance(item, dict):
            continue
        sources.append(
            {
                "source": "related-kompendium-checklist",
                "sourceId": str(item.get("requirementId", "")),
                "text": f"{item.get('title', '')} {item.get('text', '')}",
                "confidence": 0.62,
            }
        )
    for control in plusplus_context.get("relatedControls", []):
        if not isinstance(control, dict):
            continue
        sources.append(
            {
                "source": "grundschutz-plusplus-control",
                "sourceId": str(control.get("id", "")),
                "gsControlId": str(control.get("id", "")),
                "modalVerb": str(control.get("modalVerb", "")),
                "securityLevel": str(control.get("securityLevel", "")),
                "text": " ".join(
                    str(part)
                    for part in (
                        control.get("title", ""),
                        control.get("statement", ""),
                        control.get("matchReason", ""),
                        " ".join(
                            str(tag)
                            for tag in control.get("tags", [])
                            if isinstance(tag, str)
                        ),
                    )
                    if part
                ),
                "confidence": 0.7,
            }
        )
    return sources
