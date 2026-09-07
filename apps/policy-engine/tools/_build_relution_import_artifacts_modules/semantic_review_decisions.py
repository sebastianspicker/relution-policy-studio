"""Cohesive implementation stage 4 for semantic_review_candidates."""

from typing import Any

def candidate_semantic_concept_id(spec: dict[str, Any], semantic_ids: list[str]) -> str:
    """Resolve an explicit or marker-derived semantic concept id for a candidate."""
    explicit = str(spec.get("semanticConceptId", ""))
    if explicit:
        return explicit
    candidate_text = " ".join(
        [
            str(spec.get("target", "")),
            *[
                str(path)
                for path in spec.get("fieldPaths", [])
                if isinstance(path, str)
            ],
        ]
    ).lower()
    markers = {
        "dns_resolution": ("dns", "name resolution"),
        "time_sync": ("time", "date", "timezone"),
        "lock_screen_message": (
            "lockscreen",
            "lock_screen",
            "lock screen",
            "loginmessage",
            "login message",
            "supportmessage",
            "support message",
        ),
        "network_connectivity": (
            "vpn",
            "wifi",
            "wi-fi",
            "proxy",
            "cellular",
            "apn",
            "connectivity",
        ),
        "exploit_mitigation": (
            "exploit",
            "antivirus",
            "custom_csp",
            "custom csp",
            "networkprotection",
            "ioav",
            "pua",
        ),
        "device_attestation_posture": (
            "advanced_security",
            "advanced security",
            "compliance",
            "bitlocker",
            "tpm",
            "system_policy",
        ),
    }
    for concept_id in semantic_ids:
        if any(marker in candidate_text for marker in markers.get(concept_id, ())):
            return concept_id
    return ""

def candidate_review_decision(
    provenance: str,
    value_compatibility: str,
    shared_concepts: list[str],
    reference_ids: list[str],
    target_overlap: int,
) -> str:
    """Classify whether a candidate is strong, reference-backed, semantic, or weak."""
    if (
        value_compatibility
        in {"manual-reviewed", "curated-analog", "curated-android-analog"}
        and provenance == "current-candidate"
    ):
        return (
            "strong candidate; still non-exact unless present as a ruleset mapping or "
            "manual promotion."
        )
    if shared_concepts and reference_ids and target_overlap >= 20:
        return (
            "review candidate against exact references; language and target family align, "
            "but values are not proven."
        )
    if shared_concepts:
        return "semantic candidate; concept matches but exact setting values remain unresolved."
    return "weak candidate for review context only."

