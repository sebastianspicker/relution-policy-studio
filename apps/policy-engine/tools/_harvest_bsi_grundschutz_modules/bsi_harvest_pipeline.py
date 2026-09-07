"""Offline BSI harvest pipeline orchestration."""

import argparse

from _build_relution_import_artifacts_modules.orchestration import build_source_artifacts
from _recommendation_mapping_modules.candidate_inference_apple_mobileconfig import load_apple_mobileconfig_evidence
from _recommendation_mapping_modules.candidate_inference_index import build_setting_index

from .bsi_checklist_parser import parse_checklist_workbook
from .bsi_checklist_workbooks import build_checklist_comparison, parse_individual_checklist_workbooks
from .bsi_docbook_catalog import parse_docbook_modules, parse_generic_threat_catalog
from .bsi_errata import build_errata_map
from .bsi_plusplus_catalog import parse_grundschutz_plusplus_catalog
from .bsi_platform_baselines import PLATFORM_TARGETS
from .bsi_recommendation_builder import build_recommendations
from .bsi_ruleset_artifacts import update_baseline_summary, write_json
from .bsi_source_core import CATALOG_PATH, CHECKLIST_COMPARISON_PATH, ERRATA_TEXT_PATH, ET, GS_PLUSPLUS_CATALOG_PATH, GS_PLUSPLUS_SYSTEMATICS_PATH, INDIVIDUAL_CHECKLISTS_DIR, XLSX_PATH, XML_PATH


def main() -> None:
    """Build BSI catalogs, comparison artifacts, and source-specific outputs."""

    parser = argparse.ArgumentParser(description="Harvest checked-in BSI guidance.")
    parser.add_argument(
        "--defer-artifacts",
        action="store_true",
        help="Write the harvested catalog without rebuilding derived global artifacts.",
    )
    args = parser.parse_args()

    root = ET.parse(XML_PATH).getroot()
    module_catalog = parse_docbook_modules(root)
    threat_catalog = parse_generic_threat_catalog(root)
    target_module_ids = {
        module.module_id for platform in PLATFORM_TARGETS for module in platform.modules
    }
    checklist_threats = parse_checklist_workbook(XLSX_PATH, target_module_ids)
    individual_checklists = parse_individual_checklist_workbooks(INDIVIDUAL_CHECKLISTS_DIR)
    errata_map = build_errata_map(
        ERRATA_TEXT_PATH.read_text(encoding="utf8"),
        {
            requirement_id
            for module_data in module_catalog.values()
            for requirement_id in module_data["requirements"]
        },
    )
    plusplus = parse_grundschutz_plusplus_catalog(GS_PLUSPLUS_CATALOG_PATH)
    checklist_comparison = build_checklist_comparison(module_catalog, individual_checklists)
    write_json(GS_PLUSPLUS_SYSTEMATICS_PATH, plusplus["systematics"])
    write_json(CHECKLIST_COMPARISON_PATH, checklist_comparison)
    recommendations = build_recommendations(
        {
            "moduleCatalog": module_catalog,
            "threatCatalog": threat_catalog,
            "checklistThreats": checklist_threats,
            "individualChecklists": individual_checklists,
            "policyRelevantRequirements": checklist_comparison["policyRelevantRequirements"],
            "plusplus": plusplus,
            "errataMap": errata_map,
            "fieldIndex": build_setting_index(),
            "appleMobileconfigEvidence": load_apple_mobileconfig_evidence(),
        }
    )
    write_json(CATALOG_PATH, recommendations)
    update_baseline_summary(recommendations, plusplus["systematics"], checklist_comparison)
    if not args.defer_artifacts:
        build_source_artifacts("bsi")
