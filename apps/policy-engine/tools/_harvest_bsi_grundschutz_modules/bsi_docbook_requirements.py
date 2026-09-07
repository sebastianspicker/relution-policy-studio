"""Supports BSI Grundschutz harvesting and recommendation-mapping workflows."""
from __future__ import annotations

from typing import Any

from .bsi_docbook_identifiers import parse_requirement_title
from .bsi_docbook_sections import collect_direct_blocks
from .bsi_source_core import DOCBOOK_NS
from .bsi_source_text import normalize_space


def parse_module_requirements(module_section: Any) -> dict[str, dict[str, Any]]:
    """Extract active and retired requirements from a BSI module section."""

    requirements_parent = next(
        child
        for child in module_section.findall("db:section", DOCBOOK_NS)
        if normalize_space(
            child.findtext("db:title", default="", namespaces=DOCBOOK_NS)
        )
        == "Anforderungen"
    )
    requirements: dict[str, dict[str, Any]] = {}
    for category_section in requirements_parent.findall("db:section", DOCBOOK_NS):
        category_title = normalize_space(
            category_section.findtext("db:title", default="", namespaces=DOCBOOK_NS)
        )
        for requirement_section in category_section.findall("db:section", DOCBOOK_NS):
            raw_title = normalize_space(
                requirement_section.findtext(
                    "db:title", default="", namespaces=DOCBOOK_NS
                )
            )
            parsed_title = parse_requirement_title(raw_title)
            if parsed_title is None:
                continue
            blocks = collect_direct_blocks(requirement_section)
            requirement_id = parsed_title["requirement_id"]
            title = parsed_title["title"]
            status = "retired" if title == "ENTFALLEN" else "active"
            requirements[requirement_id] = {
                "requirementId": requirement_id,
                "title": title,
                "protectionLevel": parsed_title["level"],
                "actors": [
                    normalize_space(actor)
                    for actor in parsed_title["actors"].split(",")
                    if normalize_space(actor)
                ],
                "status": status,
                "category": category_title,
                "paragraphs": blocks,
                "requirementText": " ".join(blocks),
            }
    return requirements
