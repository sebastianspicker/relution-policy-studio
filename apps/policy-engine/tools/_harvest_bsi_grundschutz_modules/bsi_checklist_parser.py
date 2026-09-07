"""Supports BSI Grundschutz harvesting and recommendation-mapping workflows."""
from __future__ import annotations

from pathlib import Path

from .bsi_source_text import normalize_space
from .bsi_xlsx_rows import read_xlsx_rows


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
