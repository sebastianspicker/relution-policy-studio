"""Supports BSI Grundschutz harvesting and recommendation-mapping workflows."""
from __future__ import annotations

import sys

from .bsi_source_core import (
    CELL_REF_RE,
    ET,
    PACKAGE_RELATIONSHIP_NS,
    RELATIONSHIP_NS,
    SHEET_NS,
)
from .bsi_source_text import normalize_space

import zipfile
from pathlib import Path

def _read_xlsx_rows(path: Path) -> dict[str, list[dict[int, str]]]:
    """Read workbook sheets as sparse 1-based column-indexed row dictionaries."""

    with zipfile.ZipFile(path) as archive:
        shared_strings = parse_shared_strings(archive)
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        relationship_targets = {
            relation.attrib["Id"]: relation.attrib["Target"]
            for relation in relationships.findall(
                f"{{{PACKAGE_RELATIONSHIP_NS}}}Relationship"
            )
        }
        rows_by_sheet: dict[str, list[dict[int, str]]] = {}
        for sheet in workbook.findall("x:sheets/x:sheet", SHEET_NS):
            name = sheet.attrib["name"]
            relation_id = sheet.attrib[f"{{{RELATIONSHIP_NS}}}id"]
            target = relationship_targets[relation_id].lstrip("/")
            if not target.startswith("xl/"):
                target = f"xl/{target}"
            rows_by_sheet[name] = parse_sheet_rows(archive, target, shared_strings)
        return rows_by_sheet


read_xlsx_rows = _read_xlsx_rows


def parse_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    """Decode an XLSX shared-string table, returning blanks when it is absent."""
    try:
        shared_root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    except KeyError:
        print(
            (
                "WARNING: sharedStrings.xml not found in workbook; shared-string cells will "
                "decode as blank"
            ),
            file=sys.stderr,
        )
        return []
    return [
        normalize_space("".join(string.itertext()))
        for string in shared_root.findall("x:si", SHEET_NS)
    ]


def parse_sheet_rows(
    archive: zipfile.ZipFile, sheet_path: str, shared_strings: list[str]
) -> list[dict[int, str]]:
    """Decode one XLSX worksheet into normalized sparse row values."""
    sheet_root = ET.fromstring(archive.read(sheet_path))
    rows: list[dict[int, str]] = []
    for row in sheet_root.findall(".//x:sheetData/x:row", SHEET_NS):
        values: dict[int, str] = {}
        for cell in row.findall("x:c", SHEET_NS):
            ref = cell.attrib.get("r", "")
            column_match = CELL_REF_RE.match(ref)
            if column_match is None:
                continue
            column_index = excel_column_to_index(column_match.group("column"))
            values[column_index] = read_cell_value(cell, shared_strings)
        rows.append(values)
    return rows


def read_cell_value(cell: ET.Element, shared_strings: list[str]) -> str:
    """Normalize shared, inline, and raw XLSX cell values to plain text."""
    cell_type = cell.attrib.get("t")
    if cell_type == "s":
        value_text = cell.findtext("x:v", default="", namespaces=SHEET_NS)
        if value_text.isdigit():
            return shared_strings[int(value_text)]
        return normalize_space(value_text)
    if cell_type == "inlineStr":
        inline = cell.find("x:is", SHEET_NS)
        return normalize_space("".join(inline.itertext()) if inline is not None else "")
    return normalize_space(cell.findtext("x:v", default="", namespaces=SHEET_NS))


def excel_column_to_index(column: str) -> int:
    """Convert an Excel column label to the 1-based column index used by rows."""
    index = 0
    for character in column:
        index = index * 26 + (ord(character) - 64)
    return index
