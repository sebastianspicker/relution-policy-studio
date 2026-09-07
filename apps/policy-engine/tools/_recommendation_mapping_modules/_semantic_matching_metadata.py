"""Semantic-matching target constants and source metadata."""

ANDROID_ADVANCED_SECURITY = "ANDROID_ENTERPRISE_ADVANCED_SECURITY_OVERRIDES"
ANDROID_DISPLAY = "ANDROID_ENTERPRISE_DISPLAY"
ANDROID_KEYGUARD = "ANDROID_ENTERPRISE_KEYGUARD_FEATURE_MANAGEMENT"
ANDROID_LOCATION = "ANDROID_ENTERPRISE_LOCATION_SHARING_MANAGEMENT"
ANDROID_PLAY_STORE = "ANDROID_ENTERPRISE_PLAY_STORE_MANAGEMENT"
ANDROID_RESTRICTION = "ANDROID_ENTERPRISE_RESTRICTION"
ANDROID_SYSTEM_UPDATE = "ANDROID_ENTERPRISE_SYSTEM_UPDATE"

BSI_CONCEPT_MATCH_REASON = "BSI/GS++ concept match"
MANAGEMENT_SUPPORT_CONCEPT_IDS = frozenset(
    {
        "policy_governance",
        "mdm_strategy_selection",
        "device_onboarding",
        "reference_configuration_rollout",
        "administration_procedures",
        "hardened_device_procurement",
    }
)
DIRECT_SEMANTIC_SOURCES = frozenset(
    {
        "bsi-title",
        "bsi-requirement",
        "kompendium-checklist",
        "cis-title",
        "cis-description",
        "vendor-title",
        "vendor-section",
        "relution-field",
        "apple-schema-field",
    }
)
RELATED_SEMANTIC_SOURCES = frozenset({"related-kompendium-checklist"})
GS_PLUSPLUS_SEMANTIC_SOURCES = frozenset({"grundschutz-plusplus-control"})
PROCESS_ONLY_TITLE_TERMS = (
    "notfallplanung",
    "notfallmanagement",
    "stromversorgung",
    "unterbrechungsfreie",
    "usv",
    "power supply",
    "emergency planning",
)
