"""Cohesive implementation stage 1 for bsi_mandatory_ledger."""

from typing import Any
from .bsi_mandatory_ledger_constants import BSI_MANDATORY_LEDGER_PATH, MANDATORY_MODAL_RE
from .ruleset_reporting import count_by
from datetime import datetime
from .mapping_exact_targets import exact_mappings
from .mapping_exact_targets import mapping_target
from datetime import timezone
from _recommendation_mapping_modules._mapping_lexical_constants import unique_preserving_order
from .artifact_io_json import write_json

def write_bsi_mandatory_mapping_ledger(
    recommendations: list[dict[str, Any]], settings_catalog: dict[str, Any]
) -> None:
    """Write mandatory BSI basis requirements and their Relution solution status."""

    rows = [
        bsi_mandatory_ledger_row(entry)
        for entry in recommendations
        if is_bsi_mandatory_basis(entry)
    ]
    summary = {
        "totalMandatoryBasisRequirements": len(rows),
        "byPlatform": count_by(rows, "platform"),
        "bySolutionStatus": count_by(rows, "solutionStatus"),
        "byMappingStatus": count_by(rows, "mappingStatus"),
        "settingBundleCount": len(settings_catalog.get("bundles", [])),
    }
    write_json(
        BSI_MANDATORY_LEDGER_PATH,
        {
            "version": 1,
            "name": "BSI Mandatory Basis Relution Mapping Ledger",
            "generatedAt": datetime.now(timezone.utc)
            .replace(microsecond=0)
            .isoformat()
            .replace("+00:00", "Z"),
            "scope": {
                "source": "BSI IT-Grundschutz Kompendium Edition 2023",
                "requirements": "Active Basis requirements containing mandatory modal verbs.",
                "target": (
                    "Relution-managed Windows, macOS, iOS, and Android Enterprise client "
                    "configuration."
                ),
            },
            "summary": summary,
            "rows": rows,
        },
    )

def is_bsi_mandatory_basis(recommendation: dict[str, Any]) -> bool:
    """Return whether a BSI recommendation is an active mandatory basis item."""

    return (
        recommendation.get("status") == "active"
        and recommendation.get("protectionLevel") == "B"
        and MANDATORY_MODAL_RE.search(str(recommendation.get("requirementText", "")))
        is not None
    )

def bsi_mandatory_ledger_row(recommendation: dict[str, Any]) -> dict[str, Any]:
    """Build one mandatory-requirement row for the BSI mapping ledger."""
    from .bsi_mandatory_ledger_classification import bsi_solution_status, mandatory_clauses

    mapping = recommendation.get("relutionMapping", {})
    implementation = recommendation.get("implementation", {})
    exact_targets = [mapping_target(entry) for entry in exact_mappings(recommendation)]
    exact_target_values = [
        {
            "kind": entry.get("kind"),
            "target": mapping_target(entry),
            "values": entry.get("values", {}),
        }
        for entry in exact_mappings(recommendation)
    ]
    parameter_requirements = (
        list(mapping.get("parameterRequirements", []))
        if isinstance(mapping.get("parameterRequirements"), list)
        else []
    )
    process_support = (
        list(mapping.get("processSupport", []))
        if isinstance(mapping.get("processSupport"), list)
        else []
    )
    candidate_targets = unique_preserving_order(
        str(candidate.get("target"))
        for candidate in mapping.get("candidates", [])
        if isinstance(candidate, dict) and isinstance(candidate.get("target"), str)
    )
    return {
        "id": recommendation["id"],
        "platform": recommendation["platform"],
        "moduleId": recommendation["moduleId"],
        "requirementId": recommendation["requirementId"],
        "title": recommendation["title"],
        "protectionLevel": recommendation["protectionLevel"],
        "mandatoryClauses": mandatory_clauses(
            str(recommendation.get("requirementText", ""))
        ),
        "mappingStatus": mapping.get("status", "none"),
        "solutionStatus": bsi_solution_status(mapping, implementation),
        "exactTargets": [target for target in exact_targets if target is not None],
        "exactTargetValues": exact_target_values,
        "candidateTargets": candidate_targets,
        "parameterRequirements": parameter_requirements,
        "processSupport": process_support,
        "blockingReasons": list(implementation.get("blockingReasons", [])),
        "notes": list(mapping.get("notes", [])),
    }
