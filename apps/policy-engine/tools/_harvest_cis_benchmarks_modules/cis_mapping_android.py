"""Android Enterprise-specific CIS mapping rules."""
from __future__ import annotations

from typing import Any

from _recommendation_mapping_modules.candidate_inference_android import android_relution_analog_mappings_for
from _harvest_cis_benchmarks_modules.cis_mapping_accumulator import add_exact, add_mapping

def add_android_curated_mapping(
    acc: dict[str, list[dict[str, Any]] | list[str]],
    normalized_title: str,
    title: str,
    recommended_value: str | None,
    platform: str,
) -> None:
    """Apply curated Android Enterprise exact and analog mapping rules."""
    if "developer options" in normalized_title and recommended_value == "Disabled":
        add_exact(
            acc,
            (
                "relution-native",
                "ANDROID_ENTERPRISE_ADVANCED_SECURITY_OVERRIDES",
                ["developerSettings"],
                {"developerSettings": "DEVELOPER_SETTINGS_DISABLED"},
            ),
        )
    elif "install unknown apps" in normalized_title and recommended_value == "Disabled":
        add_exact(
            acc,
            (
                "relution-native",
                "ANDROID_ENTERPRISE_ADVANCED_SECURITY_OVERRIDES",
                ["untrustedAppsPolicy"],
                {"untrustedAppsPolicy": "DISALLOW_INSTALL"},
            ),
        )
    elif (
        "scan device for security threats" in normalized_title
        and recommended_value == "Enabled"
    ):
        add_exact(
            acc,
            (
                "relution-native",
                "ANDROID_ENTERPRISE_ADVANCED_SECURITY_OVERRIDES",
                ["googlePlayProtectVerifyApps"],
                {"googlePlayProtectVerifyApps": "VERIFY_APPS_ENFORCED"},
            ),
        )
    elif "camera" in normalized_title and recommended_value == "Disabled":
        add_exact(
            acc,
            (
                "relution-native",
                "ANDROID_ENTERPRISE_DISABLE_CAMERAS",
                ["cameraDisabled"],
                {"cameraDisabled": True},
            ),
        )
    if not acc["exactMappings"]:
        for mapping in android_relution_analog_mappings_for(
            platform, title, recommended_value
        ):
            add_mapping(acc, mapping)
