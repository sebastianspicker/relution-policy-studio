"""Package exports for BSI Grundschutz harvesting helpers."""

from build_relution_import_artifacts import build_source_artifacts
from recommendation_mapping import build_setting_index, load_apple_mobileconfig_evidence

from .source_parsers import *  # noqa: F401,F403
from .checklist_and_plusplus import *  # noqa: F401,F403
from .curated_mapping_rules import *  # noqa: F401,F403
from .recommendation_rulesets import *  # noqa: F401,F403

from .checklist_and_plusplus import (
    build_checklist_comparison,
    build_errata_map,
    build_recommendations,
    parse_grundschutz_plusplus_catalog,
    parse_individual_checklist_workbooks,
)
from .recommendation_rulesets import update_baseline_summary, write_json
from .source_parsers import (
    CATALOG_PATH,
    CHECKLIST_COMPARISON_PATH,
    ERRATA_TEXT_PATH,
    GS_PLUSPLUS_CATALOG_PATH,
    GS_PLUSPLUS_SYSTEMATICS_PATH,
    INDIVIDUAL_CHECKLISTS_DIR,
    PLATFORM_TARGETS,
    XML_PATH,
    XLSX_PATH,
    ET,
    parse_checklist_workbook,
    parse_docbook_modules,
    parse_generic_threat_catalog,
)


def main() -> None:
    """Build BSI catalogs, comparison artifacts, and source-specific outputs."""

    root = ET.parse(XML_PATH).getroot()
    module_catalog = parse_docbook_modules(root)
    threat_catalog = parse_generic_threat_catalog(root)
    target_module_ids = {
        module.module_id for platform in PLATFORM_TARGETS for module in platform.modules
    }
    checklist_threats = parse_checklist_workbook(XLSX_PATH, target_module_ids)
    individual_checklists = parse_individual_checklist_workbooks(
        INDIVIDUAL_CHECKLISTS_DIR
    )
    errata_map = build_errata_map(
        ERRATA_TEXT_PATH.read_text(encoding="utf8"),
        {
            requirement_id
            for module_data in module_catalog.values()
            for requirement_id in module_data["requirements"]
        },
    )
    plusplus = parse_grundschutz_plusplus_catalog(GS_PLUSPLUS_CATALOG_PATH)
    checklist_comparison = build_checklist_comparison(
        module_catalog, individual_checklists
    )
    write_json(GS_PLUSPLUS_SYSTEMATICS_PATH, plusplus["systematics"])
    write_json(CHECKLIST_COMPARISON_PATH, checklist_comparison)

    field_index = build_setting_index()
    apple_mobileconfig_evidence = load_apple_mobileconfig_evidence()
    recommendations = build_recommendations(
        {
            "moduleCatalog": module_catalog,
            "threatCatalog": threat_catalog,
            "checklistThreats": checklist_threats,
            "individualChecklists": individual_checklists,
            "policyRelevantRequirements": checklist_comparison[
                "policyRelevantRequirements"
            ],
            "plusplus": plusplus,
            "errataMap": errata_map,
            "fieldIndex": field_index,
            "appleMobileconfigEvidence": apple_mobileconfig_evidence,
        }
    )
    write_json(CATALOG_PATH, recommendations)
    update_baseline_summary(
        recommendations, plusplus["systematics"], checklist_comparison
    )
    build_source_artifacts("bsi")
