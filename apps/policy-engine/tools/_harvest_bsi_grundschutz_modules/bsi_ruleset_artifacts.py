"""Supports BSI Grundschutz harvesting and recommendation-mapping workflows."""
from __future__ import annotations

from .bsi_platform_baselines import PLATFORM_TARGETS
from .bsi_source_core import (
    BASELINE_PATH,
    BSI_DIR,
    CHECKLIST_COMPARISON_PATH,
    GS_PLUSPLUS_SYSTEMATICS_PATH,
    README_PATH,
)
from .bsi_source_text import relative_repo_path

import json
from pathlib import Path
from typing import Any


def build_ruleset(recommendations: list[dict[str, Any]]) -> dict[str, Any]:
    """Build the importable BSI Relution ruleset with informational partial rules."""

    policies = []
    for platform in PLATFORM_TARGETS:
        platform_recommendations = [
            entry
            for entry in recommendations
            if entry["platform"] == platform.platform and entry["status"] == "active"
        ]
        policies.append(
            {
                "platform": platform.platform,
                "name": platform.policy_name,
                "description": platform.policy_description,
                "rules": [
                    {
                        "id": entry["id"],
                        "title": f"{entry['requirementId']} {entry['title']}",
                        "informational": entry["relutionMapping"]["status"] != "exact",
                        "reason": entry["reason"],
                        "section": entry["category"],
                        "recommendedValue": entry["requirementText"],
                        "sourceIds": entry["sourceIds"],
                        "mappingStatus": entry["relutionMapping"]["status"],
                        "grundschutzKompendium": entry.get("grundschutzKompendium"),
                        "grundschutzPlusPlus": entry.get("grundschutzPlusPlus"),
                        "semanticConcepts": entry.get("semanticConcepts", []),
                        "semanticNoConceptReason": entry.get("semanticNoConceptReason"),
                        "mappings": entry["relutionMapping"]["rulesetMappings"],
                    }
                    for entry in platform_recommendations
                ],
            }
        )
    return {
        "version": 1,
        "name": "BSI Grundschutz OS Baseline",
        "verifiedAsOf": "2026-04-24",
        "sourceIndexPath": "example/bsi-references/sources.json",
        "recommendationCatalogPath": "example/bsi-references/bsi-recommendations.json",
        "policies": policies,
    }


def update_baseline_summary(
    recommendations: list[dict[str, Any]],
    plusplus_systematics: dict[str, Any],
    checklist_comparison: dict[str, Any],
) -> None:
    """Update the BSI baseline summary with recommendation and source counts."""
    baseline = json.loads(BASELINE_PATH.read_text(encoding="utf8"))
    counts_by_platform: dict[str, int] = {}
    for recommendation in recommendations:
        counts_by_platform[recommendation["platform"]] = (
            counts_by_platform.get(recommendation["platform"], 0) + 1
        )
    baseline["recommendationCatalogPath"] = (
        "example/bsi-references/bsi-recommendations.json"
    )
    baseline["importableRulesetPath"] = (
        "example/bsi-references/bsi-relution-ruleset.json"
    )
    baseline["recommendationCounts"] = {
        "total": len(recommendations),
        "active": sum(1 for entry in recommendations if entry["status"] == "active"),
        "retired": sum(1 for entry in recommendations if entry["status"] == "retired"),
        "byPlatform": counts_by_platform,
    }
    baseline["downloadCount"] = len(
        json.loads((BSI_DIR / "downloads" / "manifest.json").read_text(encoding="utf8"))
    )
    baseline["grundschutzKompendiumChecklists"] = {
        "comparisonPath": relative_repo_path(CHECKLIST_COMPARISON_PATH),
        "individualWorkbookCount": checklist_comparison["individualWorkbookCount"],
        "individualRequirementCount": checklist_comparison[
            "individualRequirementCount"
        ],
        "policyRelevantRequirementCount": checklist_comparison[
            "policyRelevantRequirementCount"
        ],
        "sourceDirectory": checklist_comparison["sourceDirectory"],
        "consolidatedThreatWorkbookPath": checklist_comparison[
            "consolidatedThreatWorkbookPath"
        ],
    }
    baseline["grundschutzPlusPlus"] = {
        "systematicsPath": relative_repo_path(GS_PLUSPLUS_SYSTEMATICS_PATH),
        "catalogTitle": plusplus_systematics["catalog"]["title"],
        "catalogVersion": plusplus_systematics["catalog"]["version"],
        "catalogLastModified": plusplus_systematics["catalog"]["lastModified"],
        "methodDocument": plusplus_systematics["methodology"]["documentTitle"],
        "methodVersion": plusplus_systematics["methodology"]["documentVersion"],
        "methodDate": plusplus_systematics["methodology"]["documentDate"],
        "status": plusplus_systematics["methodology"]["status"],
        "controlCount": plusplus_systematics["counts"]["controls"],
        "practiceGroupCount": plusplus_systematics["counts"]["practiceGroups"],
        "policyRelevantControlCount": len(
            plusplus_systematics["policyRelevantControlIds"]
        ),
        "modalVerbDefinitions": plusplus_systematics["methodology"][
            "modalVerbDefinitions"
        ],
        "policyEditorUse": plusplus_systematics["methodology"]["policyEditorUse"],
    }
    write_json(BASELINE_PATH, baseline)


def update_readme() -> None:
    """Ensure the BSI README mentions generated recommendation and ruleset artifacts."""
    readme = README_PATH.read_text(encoding="utf8")
    if "bsi-recommendations.json" in readme and "bsi-relution-ruleset.json" in readme:
        return
    insertion = """
- `bsi-recommendations.json`: per-platform BSI Grundschutz recommendation catalog derived from the saved DocBook XML and checklist workbook, including threat linkage, errata overlays, and Relution mapping metadata.
- `bsi-relution-ruleset.json`: importable Relution ruleset built from the active BSI requirements. Only exact Relution mappings are actionable; the rest stay informational with preserved metadata.
- `tools/harvest_bsi_grundschutz.py`: reproducible extractor for the local BSI XML/XLSX/text corpus.
""".strip()
    readme = readme.replace(
        (
            "- `bsi-relution-baseline.json`: consolidated 2023 baseline plus 2025 "
            "errata/checklist layer, normalized for Relution-oriented consumption"
        ),
        (
            "- `bsi-relution-baseline.json`: consolidated 2023 baseline plus 2025 "
            "errata/checklist layer, normalized for Relution-oriented consumption\n"
        )
        + insertion,
    )
    README_PATH.write_text(readme, encoding="utf8")


def write_json(path: Path, payload: Any) -> None:
    """Write stable UTF-8 JSON for generated BSI artifacts."""
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf8"
    )
