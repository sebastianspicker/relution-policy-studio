"""Supports BSI Grundschutz harvesting and recommendation-mapping workflows."""
from __future__ import annotations

from typing import Any

from .bsi_docbook_identifiers import parse_generic_threat_title
from .bsi_docbook_requirements import parse_module_requirements
from .bsi_docbook_sections import parse_module_description, parse_module_threats
from .bsi_platform_baselines import PLATFORM_TARGETS
from .bsi_source_core import DOCBOOK_NS
from .bsi_source_text import normalize_space


def parse_docbook_modules(root: Any) -> dict[str, dict[str, Any]]:
    """Extract configured BSI module metadata from the DocBook XML tree."""

    sections_by_title = {
        normalize_space(title_element.text or ""): section
        for section in root.findall(".//db:section", DOCBOOK_NS)
        if (title_element := section.find("db:title", DOCBOOK_NS)) is not None
    }
    modules: dict[str, dict[str, Any]] = {}
    for platform in PLATFORM_TARGETS:
        for module in platform.modules:
            if module.module_id in modules:
                continue
            section = sections_by_title[module.module_title]
            modules[module.module_id] = {
                "moduleId": module.module_id,
                "moduleTitle": module.module_title,
                "sourceId": module.source_id,
                "description": parse_module_description(section),
                "moduleThreats": parse_module_threats(section),
                "requirements": parse_module_requirements(section),
            }
    return modules


def parse_generic_threat_catalog(root: Any) -> dict[str, str]:
    """Extract generic threat ids and titles from the DocBook XML tree."""

    threats: dict[str, str] = {}
    for title_element in root.findall(".//db:title", DOCBOOK_NS):
        title = normalize_space("".join(title_element.itertext()))
        parsed_threat = parse_generic_threat_title(title)
        if parsed_threat is None or parsed_threat["id"] in threats:
            continue
        threats[parsed_threat["id"]] = parsed_threat["title"]
    return threats
