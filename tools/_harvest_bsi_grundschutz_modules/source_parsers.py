#!/usr/bin/env python3
"""Parse BSI DocBook, checklist, and catalog source files."""

from __future__ import annotations

import importlib
import re
import sys
from pathlib import Path
from typing import Any
from defusedxml import ElementTree as ET

from recommendation_mapping import unique_preserving_order

from .bsi_platform_targets import (
    GS_PLUSPLUS_METHOD_CONTEXT,
    GS_PLUSPLUS_RELATED_CONTROL_RULES,
    GS_PLUSPLUS_STOPWORDS,
    MAPPING_RULES,
    ModuleTarget,
    PlatformTarget,
    PLATFORM_GS_PLUSPLUS_TARGET_CATEGORIES,
    PLATFORM_TARGETS,
)

_COMPAT_EXPORTS = (
    GS_PLUSPLUS_METHOD_CONTEXT,
    GS_PLUSPLUS_RELATED_CONTROL_RULES,
    MAPPING_RULES,
    ModuleTarget,
    PlatformTarget,
    PLATFORM_GS_PLUSPLUS_TARGET_CATEGORIES,
)


DOCBOOK_NS = {"db": "http://docbook.org/ns/docbook"}
SHEET_NS = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
RELATIONSHIP_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PACKAGE_RELATIONSHIP_NS = "http://schemas.openxmlformats.org/package/2006/relationships"

REPO_ROOT = Path(__file__).resolve().parents[2]
BSI_DIR = REPO_ROOT / "example" / "bsi-references"
XML_PATH = BSI_DIR / "downloads" / "pdf-xlsx-html" / "XML_Kompendium_2023.xml"
XLSX_PATH = BSI_DIR / "downloads" / "pdf-xlsx-html" / "krt2023_Excel.xlsx"
INDIVIDUAL_CHECKLISTS_DIR = (
    BSI_DIR
    / "downloads"
    / "pdf-xlsx-html"
    / "Checklisten zum IT-Grundschutz-Kompendium (Edition 2023)"
)
ERRATA_TEXT_PATH = BSI_DIR / "downloads" / "text" / "it-grundschutz-errata-2023.txt"
GS_PLUSPLUS_CATALOG_PATH = (
    BSI_DIR / "downloads" / "pdf-xlsx-html" / "Grundschutz++-catalog.json"
)
GS_PLUSPLUS_METHOD_PATH = (
    BSI_DIR / "downloads" / "pdf-xlsx-html" / "Methodik_Grundschutz_PlusPlus.pdf"
)
BASELINE_PATH = BSI_DIR / "bsi-relution-baseline.json"
README_PATH = BSI_DIR / "README.md"
CATALOG_PATH = BSI_DIR / "bsi-recommendations.json"
RULESET_PATH = BSI_DIR / "bsi-relution-ruleset.json"
GS_PLUSPLUS_SYSTEMATICS_PATH = BSI_DIR / "bsi-grundschutz-plusplus-systematics.json"
CHECKLIST_COMPARISON_PATH = (
    BSI_DIR / "bsi-grundschutz-kompendium-checklist-comparison.json"
)

CELL_REF_RE = re.compile(r"(?P<column>[A-Z]+)")

if not hasattr(ET, "Element"):
    ET.Element = Any  # type: ignore[attr-defined]


def relative_repo_path(path: Path) -> str:
    """Return a repository-relative POSIX path for a source artifact."""

    return path.resolve().relative_to(REPO_ROOT).as_posix()


def local_name(tag: str) -> str:
    """Return an XML tag name without its namespace prefix."""

    return tag.split("}", 1)[1] if "}" in tag else tag


def normalize_space(text: str) -> str:
    """Collapse whitespace in extracted source text."""

    return " ".join(text.split())


def slugify(value: str) -> str:
    """Convert BSI identifiers and labels into stable slug fragments."""

    slug = value.lower().replace(".", "-").replace("_", "-")
    slug = re.sub(r"[^a-z0-9-]+", "-", slug)
    slug = re.sub(r"-{2,}", "-", slug)
    return slug.strip("-")


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


def parse_requirement_title(raw_title: str) -> dict[str, str] | None:
    """Parse a BSI requirement heading into id, title, level, and actors."""

    title = normalize_space(raw_title)
    actors = ""
    if title.endswith("]"):
        actor_start = title.rfind(" [")
        if actor_start != -1:
            actors = title[actor_start + 2 : -1]
            title = title[:actor_start]
    level_start = title.rfind(" (")
    if level_start == -1 or not title.endswith(")"):
        return None
    level_text = title[level_start + 2 : -1]
    if level_text not in {"B", "S", "H"}:
        return None
    prefix_and_title = title[:level_start]
    requirement_id, separator, requirement_title = prefix_and_title.partition(" ")
    if separator == "" or not is_bsi_requirement_id(requirement_id):
        return None
    return {
        "requirement_id": requirement_id,
        "title": normalize_space(requirement_title),
        "level": level_text,
        "actors": actors,
    }


def parse_generic_threat_title(title: str) -> dict[str, str] | None:
    """Parse a generic BSI threat heading into id and title."""

    prefix, separator, threat_title = normalize_space(title).partition(" ")
    if separator == "" or not prefix.startswith("G"):
        return None
    number = prefix[1:]
    if (
        not number
        or "." not in number
        or not all(part.isdigit() for part in number.split("."))
    ):
        return None
    return {"id": f"G {number}", "title": normalize_space(threat_title)}


def is_bsi_requirement_id(value: str) -> bool:
    """Check the SYS.x.y.Az BSI requirement id format."""

    prefix, separator, requirement = value.rpartition(".A")
    if separator == "" or not requirement.isdigit() or not prefix.startswith("SYS."):
        return False
    return all(part.isdigit() for part in prefix.removeprefix("SYS.").split("."))


def read_xlsx_rows(path: Path) -> dict[str, list[dict[int, str]]]:
    """Load workbook rows via the checklist parser without a hard import cycle."""

    module = importlib.import_module(
        "_harvest_bsi_grundschutz_modules.checklist_and_plusplus"
    )
    return module.read_xlsx_rows(path)


def parse_checklist_workbook(
    xlsx_path: Path, module_ids: set[str]
) -> dict[str, list[str]]:
    """Map module requirement ids to checklist threat ids."""

    rows_by_sheet = read_xlsx_rows(xlsx_path)
    requirement_threats: dict[str, list[str]] = {}
    for module_id in sorted(module_ids):
        sheet_name = f"KRT_{module_id}.xlsx"
        rows = rows_by_sheet.get(sheet_name, [])
        if not rows:
            continue
        header = rows[0]
        threat_columns = {
            index: value
            for index, value in header.items()
            if isinstance(value, str) and value.startswith("G ")
        }
        for row in rows[1:]:
            requirement_id = normalize_space(str(row.get(1, "")))
            if not requirement_id.startswith(f"{module_id}.A"):
                continue
            requirement_threats[requirement_id] = [
                threat_id
                for index, threat_id in threat_columns.items()
                if normalize_space(str(row.get(index, ""))).upper() == "X"
            ]
    return requirement_threats


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


def split_values(values: list[str]) -> list[str]:
    """Split comma-separated source values and deduplicate in source order."""

    split = []
    for value in values:
        split.extend(
            normalize_space(part) for part in value.split(",") if normalize_space(part)
        )
    return unique_preserving_order(split)


def count_values(values: Any) -> dict[str, int]:
    """Count non-null values with deterministic key ordering."""

    counts: dict[str, int] = {}
    for value in values:
        if value is None:
            continue
        key = str(value)
        counts[key] = counts.get(key, 0) + 1
    return dict(sorted(counts.items()))


def natural_control_sort_key(control_id: str) -> tuple[Any, ...]:
    """Build a natural sort key for dotted control identifiers."""

    parts: list[Any] = []
    for part in re.split(r"(\d+)", control_id):
        if part.isdigit():
            parts.append(int(part))
        elif part:
            parts.append(part)
    return tuple(parts)


def normalize_for_match(text: str) -> str:
    """Normalize German/English text for token-based matching."""

    normalized = text.lower()
    normalized = (
        normalized.replace("ä", "ae")
        .replace("ö", "oe")
        .replace("ü", "ue")
        .replace("ß", "ss")
    )
    normalized = re.sub(r"[^a-z0-9]+", " ", normalized)
    return normalize_space(normalized)


def token_set(text: str) -> set[str]:
    """Return significant normalized tokens for BSI matching."""

    return {
        token
        for token in normalize_for_match(text).split()
        if len(token) >= 5 and token not in GS_PLUSPLUS_STOPWORDS
    }


def shorten(text: str, max_length: int) -> str:
    """Shorten normalized text with an ellipsis when needed."""

    normalized = normalize_space(text)
    if len(normalized) <= max_length:
        return normalized
    return normalized[: max_length - 1].rstrip() + "..."


__all__ = [
    name for name in globals() if not name.startswith("_") and name != "read_xlsx_rows"
]
