"""Generated ruleset row builders."""

from typing import Any

from .artifact_io_rule_text import informational_reason, informational_title, informational_value


def build_informational_rule(source: str, recommendation: dict[str, Any]) -> dict[str, Any]:
    """Create a non-actionable ruleset row that preserves recommendation metadata."""
    rule: dict[str, Any] = {"id": recommendation["id"], "title": informational_title(source, recommendation), "informational": True, "reason": informational_reason(source, recommendation), "recommendedValue": informational_value(source, recommendation), "sourceIds": list(recommendation.get("sourceIds", [])), "mappingStatus": recommendation.get("relutionMapping", {}).get("status"), "mappings": []}
    if source == "bsi":
        rule["section"] = recommendation.get("category")
        for key in ("grundschutzKompendium", "grundschutzPlusPlus", "semanticConcepts", "semanticNoConceptReason"):
            if isinstance(recommendation.get(key), (dict, list, str)):
                rule[key] = recommendation[key]
    if source == "cis":
        rule["assessmentStatus"] = recommendation.get("assessmentStatus")
        for key in ("semanticConcepts", "semanticNoConceptReason"):
            if isinstance(recommendation.get(key), (list, str)):
                rule[key] = recommendation[key]
    if source == "vendor":
        rule["section"] = recommendation.get("section")
    return rule


def build_aggregate_rule(bundle: dict[str, Any]) -> dict[str, Any]:
    """Create an actionable aggregate rule from an exact settings bundle."""
    details = dict(bundle["details"])
    details.pop("type", None)
    variant_id = bundle.get("variantId")
    title_suffix = f" ({variant_id})" if variant_id else ""
    return {"id": f"{bundle['bundleId']}-aggregate", "title": f"Relution aggregate: {bundle['targetType']}{title_suffix}", "informational": False, "reason": "Aggregates exact Relution mappings from " f"{', '.join(bundle['derivedFromRecommendationIds'])}.", "sourceIds": bundle["sourceIds"], "mappings": [{"kind": "relution-native", "type": bundle["targetType"], "values": details}], **({"variantId": variant_id} if variant_id else {})}
