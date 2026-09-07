"""Supports BSI Grundschutz harvesting and recommendation-mapping workflows."""
from __future__ import annotations

from .bsi_platform_baselines import PLATFORM_TARGETS
from .bsi_source_core import INDIVIDUAL_CHECKLISTS_DIR, XLSX_PATH
from .bsi_source_text import normalize_space, relative_repo_path

from pathlib import Path
from typing import Any

from .bsi_checklist_comparison import checklist_comparison_entry, build_policy_relevant_checklist_items
from .bsi_xlsx_rows import read_xlsx_rows




def _checklist_metadata_and_header(
    rows: list[dict[int, str]],
) -> tuple[str, str, int]:
    """Return checklist metadata found before the first requirements header."""

    module_title = ""
    edition = ""
    for index, row in enumerate(rows):
        marker = normalize_space(str(row.get(2, "")))
        if marker.startswith("Baustein:"):
            module_title = marker.removeprefix("Baustein:").strip()
            continue
        if marker.startswith("Kompendium:"):
            edition = marker.removeprefix("Kompendium:").strip()
            continue
        if marker == "ID-Anforderung":
            return module_title, edition, index
    return module_title, edition, -1


def _checklist_requirements_after_header(
    rows: list[dict[int, str]], header_index: int, module_id: str
) -> dict[str, dict[str, str]]:
    """Extract normalized requirement records for one checklist module."""
    requirements: dict[str, dict[str, str]] = {}
    for row in rows[header_index + 1 :]:
        requirement_id = normalize_space(str(row.get(2, "")))
        if not requirement_id.startswith(f"{module_id}.A"):
            continue
        requirements[requirement_id] = {
            "requirementId": requirement_id,
            "title": normalize_space(str(row.get(3, ""))),
            "text": normalize_space(str(row.get(4, ""))),
            "type": normalize_space(str(row.get(5, ""))),
        }
    return requirements


def parse_individual_checklist_workbooks(directory: Path) -> dict[str, dict[str, Any]]:
    """Parse BSI per-module checklist workbooks into requirement records by module."""
    checklists: dict[str, dict[str, Any]] = {}
    for path in sorted(directory.glob("Checkliste_*.xlsx")):
        rows_by_sheet = read_xlsx_rows(path)
        for sheet_name, rows in rows_by_sheet.items():
            module_id = normalize_space(sheet_name)
            if not module_id:
                continue
            module_title, edition, header_index = _checklist_metadata_and_header(rows)
            requirements = (
                _checklist_requirements_after_header(rows, header_index, module_id)
                if header_index >= 0
                else {}
            )
            checklists[module_id] = {
                "moduleId": module_id,
                "moduleTitle": module_title or module_id,
                "edition": edition,
                "sourcePath": relative_repo_path(path),
                "sheetName": sheet_name,
                "requirements": requirements,
            }
    return checklists


def build_checklist_comparison(
    module_catalog: dict[str, dict[str, Any]], checklists: dict[str, dict[str, Any]]
) -> dict[str, Any]:
    """Compare parsed checklist workbooks against the DocBook module catalog."""
    platform_module_ids = {
        module.module_id for platform in PLATFORM_TARGETS for module in platform.modules
    }
    workbook_rows: list[dict[str, Any]] = []
    compared_modules: list[dict[str, Any]] = []
    for module_id, checklist in sorted(checklists.items()):
        requirements = checklist["requirements"]
        workbook_rows.append(
            {
                "moduleId": module_id,
                "moduleTitle": checklist["moduleTitle"],
                "sourcePath": checklist["sourcePath"],
                "requirementCount": len(requirements),
            }
        )
        if module_id not in module_catalog:
            continue
        compared_modules.append(
            checklist_comparison_entry(
                module_id, checklist, module_catalog[module_id], platform_module_ids
            )
        )
    policy_relevant = build_policy_relevant_checklist_items(checklists)
    return {
        "version": 1,
        "name": "BSI IT-Grundschutz Kompendium Individual Checklist Comparison",
        "sourceDirectory": relative_repo_path(INDIVIDUAL_CHECKLISTS_DIR),
        "consolidatedThreatWorkbookPath": relative_repo_path(XLSX_PATH),
        "individualWorkbookCount": len(checklists),
        "individualRequirementCount": sum(
            len(entry["requirements"]) for entry in checklists.values()
        ),
        "workbooks": workbook_rows,
        "comparedPlatformModules": compared_modules,
        "policyRelevantRequirementCount": len(policy_relevant),
        "policyRelevantRequirements": policy_relevant,
    }
