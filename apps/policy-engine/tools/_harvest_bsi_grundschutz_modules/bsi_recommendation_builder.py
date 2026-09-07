"""Supports BSI Grundschutz harvesting and recommendation-mapping workflows."""
from __future__ import annotations

from _recommendation_mapping_modules._mapping_lexical_constants import unique_preserving_order
from _recommendation_mapping_modules.candidate_inference_semantic_candidates import semantic_candidates_for
from _recommendation_mapping_modules.candidate_inference_semantic_concepts import semantic_concepts_for
from _recommendation_mapping_modules.candidate_inference_semantic_output import semantic_metadata_for

from .bsi_platform_baselines import PLATFORM_TARGETS
from .bsi_source_text import slugify

from typing import Any


from .bsi_checklist_context import checklist_context_for
from .bsi_plusplus_context import plusplus_context_for
from .bsi_semantic_evidence import semantic_evidence_sources_for
from .bsi_mapping_selection import mapping_for


def build_recommendations(source_data: dict[str, Any]) -> list[dict[str, Any]]:
    """Build deterministic BSI recommendation records for all platform modules."""

    recommendations: list[dict[str, Any]] = []
    for platform in PLATFORM_TARGETS:
        for module in platform.modules:
            module_data = source_data["moduleCatalog"][module.module_id]
            for requirement_id, requirement in module_data["requirements"].items():
                recommendations.append(
                    build_recommendation_entry(
                        {
                            "platform": platform,
                            "module": module,
                            "moduleData": module_data,
                            "requirementId": requirement_id,
                            "requirement": requirement,
                            "sourceData": source_data,
                        }
                    )
                )
    recommendations.sort(
        key=lambda entry: (entry["platform"], entry["moduleId"], entry["requirementId"])
    )
    return recommendations


def build_recommendation_entry(context: dict[str, Any]) -> dict[str, Any]:
    """Build one BSI recommendation with checklist, GS++, and semantic evidence."""
    platform = context["platform"]
    module = context["module"]
    module_data = context["moduleData"]
    requirement_id = context["requirementId"]
    requirement = context["requirement"]
    source_data = context["sourceData"]
    threat_ids = source_data["checklistThreats"].get(requirement_id, [])
    source_ids = recommendation_source_ids(
        module, requirement_id, source_data["errataMap"]
    )
    plusplus_context = plusplus_context_for(
        platform.platform, requirement, source_data["plusplus"]
    )
    checklist_context = checklist_context_for(
        module.module_id,
        requirement_id,
        requirement,
        source_data["individualChecklists"],
        source_data["policyRelevantRequirements"],
    )
    semantic_evidence_sources = semantic_evidence_sources_for(
        requirement, checklist_context, plusplus_context
    )
    semantic_concepts = semantic_concepts_for(
        platform.platform, semantic_evidence_sources
    )
    semantic_candidates = semantic_candidates_for(platform.platform, semantic_concepts)
    return {
        "id": slugify(f"{platform.platform}-{requirement_id}"),
        "platform": platform.platform,
        "osFamily": platform.os_family,
        "policyName": platform.policy_name,
        "moduleId": module.module_id,
        "moduleTitle": module.module_title,
        "moduleRole": module.role,
        "sourceIds": unique_preserving_order(source_ids),
        "supportingSourceIds": list(module.supporting_source_ids),
        "category": requirement["category"],
        "requirementId": requirement_id,
        "title": requirement["title"],
        "status": requirement["status"],
        "protectionLevel": requirement["protectionLevel"],
        "actors": requirement["actors"],
        "paragraphs": requirement["paragraphs"],
        "requirementText": requirement["requirementText"],
        "reason": requirement["requirementText"],
        "descriptionContext": module_data["description"],
        "checklistThreatIds": threat_ids,
        "checklistThreatTitles": [
            source_data["threatCatalog"][threat_id]
            for threat_id in threat_ids
            if threat_id in source_data["threatCatalog"]
        ],
        "moduleThreatContext": module_data["moduleThreats"],
        "errata": source_data["errataMap"].get(requirement_id, []),
        "grundschutzKompendium": checklist_context,
        "grundschutzPlusPlus": plusplus_context,
        **semantic_metadata_for(semantic_evidence_sources, semantic_concepts),
        "relutionMapping": mapping_for(
            {
                "platform": platform.platform,
                "requirementId": requirement_id,
                "requirement": requirement,
                "fieldIndex": source_data["fieldIndex"],
                "appleMobileconfigEvidence": source_data["appleMobileconfigEvidence"],
                "semanticCandidates": semantic_candidates,
            }
        ),
    }


def recommendation_source_ids(
    module: Any, requirement_id: str, errata_map: dict[str, list[dict[str, str]]]
) -> list[str]:
    """List stable source IDs that justify a generated BSI recommendation."""
    source_ids = [module.source_id, "it-grundschutz-checklists-2023"]
    if requirement_id in errata_map:
        source_ids.append("it-grundschutz-errata-2023")
    source_ids.extend(list(module.supporting_source_ids))
    return source_ids
