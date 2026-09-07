"""Supports BSI Grundschutz harvesting and recommendation-mapping workflows."""
from __future__ import annotations

import sys
from typing import Any

from .bsi_source_core import DOCBOOK_NS
from .bsi_source_text import local_name, normalize_space


def parse_module_description(module_section: Any) -> list[str]:
    """Extract the Beschreibung section paragraphs for a BSI module."""

    for child_section in module_section.findall("db:section", DOCBOOK_NS):
        title = child_section.findtext("db:title", default="", namespaces=DOCBOOK_NS)
        if normalize_space(title) == "Beschreibung":
            return collect_direct_blocks(child_section)
    print(
        f"WARNING: {docbook_section_label(module_section)}: expected DocBook "
        "section 'Beschreibung' not found",
        file=sys.stderr,
    )
    return []


def parse_module_threats(module_section: Any) -> list[dict[str, str]]:
    """Extract Gefährdungslage threat entries for a BSI module."""

    for child_section in module_section.findall("db:section", DOCBOOK_NS):
        title = child_section.findtext("db:title", default="", namespaces=DOCBOOK_NS)
        if normalize_space(title) != "Gefährdungslage":
            continue
        threats: list[dict[str, str]] = []
        for threat_section in child_section.findall("db:section", DOCBOOK_NS):
            threat_title = normalize_space(
                threat_section.findtext("db:title", default="", namespaces=DOCBOOK_NS)
            )
            if not threat_title:
                continue
            threat_text = " ".join(collect_direct_blocks(threat_section))
            threats.append({"title": threat_title, "text": threat_text})
        return threats
    print(
        f"WARNING: {docbook_section_label(module_section)}: expected DocBook "
        "section 'Gefährdungslage' not found",
        file=sys.stderr,
    )
    return []


def docbook_section_label(module_section: Any) -> str:
    """Return a readable label for DocBook diagnostics."""

    title = normalize_space(
        module_section.findtext("db:title", default="", namespaces=DOCBOOK_NS)
    )
    return title or module_section.attrib.get("id", "<unknown>")


def collect_direct_blocks(section: Any) -> list[str]:
    """Collect direct paragraph and list-item text from a DocBook section."""

    blocks = []
    for child in section:
        tag = local_name(child.tag)
        if tag == "title":
            continue
        if tag == "para":
            text = normalize_space("".join(child.itertext()))
            if text:
                blocks.append(text)
            continue
        if tag in {"itemizedlist", "orderedlist"}:
            for item in child.findall("db:listitem", DOCBOOK_NS):
                text = normalize_space("".join(item.itertext()))
                if text:
                    blocks.append(f"- {text}")
    return blocks
