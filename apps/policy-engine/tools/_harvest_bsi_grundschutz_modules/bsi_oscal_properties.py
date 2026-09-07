"""Supports BSI Grundschutz harvesting and recommendation-mapping workflows."""
from __future__ import annotations

from typing import Any

from .bsi_source_text import normalize_space


def first_part(control: dict[str, Any], name: str) -> dict[str, Any]:
    """Return the first OSCAL control part with the requested name."""

    for part in control.get("parts", []):
        if isinstance(part, dict) and part.get("name") == name:
            return part
    return {}


def prop_value(props: Any, name: str) -> str | None:
    """Return the first normalized OSCAL property value for a name."""

    values = prop_values(props, name)
    return values[0] if values else None


def prop_values(props: Any, name: str) -> list[str]:
    """Return all normalized OSCAL property values for a name."""

    if not isinstance(props, list):
        return []
    return [
        normalize_space(str(prop.get("value", "")))
        for prop in props
        if isinstance(prop, dict)
        and prop.get("name") == name
        and normalize_space(str(prop.get("value", "")))
    ]


def prop_remark(props: Any, name: str) -> str:
    """Return the normalized remarks field for a named OSCAL property."""

    if not isinstance(props, list):
        return ""
    for prop in props:
        if isinstance(prop, dict) and prop.get("name") == name:
            return normalize_space(str(prop.get("remarks", "")))
    return ""
