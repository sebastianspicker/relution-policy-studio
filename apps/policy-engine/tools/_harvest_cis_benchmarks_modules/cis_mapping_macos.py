"""macOS-specific CIS mapping rules."""
from __future__ import annotations

from typing import Any

from _harvest_cis_benchmarks_modules.cis_mapping_accumulator import add_candidate, add_exact

def add_macos_curated_mapping(
    acc: dict[str, list[dict[str, Any]] | list[str]], normalized_title: str, title: str
) -> None:
    """Apply direct macOS native and Apple profile mapping rules."""
    macos_rules = {
        "Ensure Firewall Is Enabled": (
            "relution-native",
            "MACOS_FIREWALL",
            ["enableFirewall"],
            {"enableFirewall": True},
        ),
        "Ensure FileVault Is Enabled": (
            "relution-native",
            "MACOS_FILE_VAULT",
            ["enabled"],
            {"enabled": True},
        ),
        "Ensure Download New Updates When Available Is Enabled": (
            "apple-schema-profile",
            "profile:com.apple.SoftwareUpdate",
            ["AutomaticDownload"],
            {"AutomaticDownload": True},
        ),
        "Ensure Install of macOS Updates Is Enabled": (
            "apple-schema-profile",
            "profile:com.apple.SoftwareUpdate",
            ["AutomaticallyInstallMacOSUpdates"],
            {"AutomaticallyInstallMacOSUpdates": True},
        ),
        "Ensure Install Application Updates from the App Store Is Enabled": (
            "apple-schema-profile",
            "profile:com.apple.SoftwareUpdate",
            ["AutomaticallyInstallAppUpdates"],
            {"AutomaticallyInstallAppUpdates": True},
        ),
        "Ensure Install Security Responses and System Files Is Enabled": (
            "apple-schema-profile",
            "profile:com.apple.SoftwareUpdate",
            ["CriticalUpdateInstall", "ConfigDataInstall"],
            {"CriticalUpdateInstall": True, "ConfigDataInstall": True},
        ),
        "Ensure Firewall Stealth Mode Is Enabled": (
            "apple-schema-profile",
            "profile:com.apple.security.firewall",
            ["EnableFirewall", "EnableStealthMode"],
            {"EnableFirewall": True, "EnableStealthMode": True},
        ),
        "Ensure Login Window Displays as Name and Password Is Enabled": (
            "apple-schema-profile",
            "profile:com.apple.loginwindow",
            ["SHOWFULLNAME"],
            {"SHOWFULLNAME": True},
        ),
    }
    if title in macos_rules:
        kind, target, field_paths, values = macos_rules[title]
        add_exact(acc, (kind, target, field_paths, values))
    elif "password history is set to at least 24" in normalized_title:
        add_exact(
            acc,
            (
                "relution-native",
                "IOS_PASSCODE",
                ["pinHistory"],
                {"pinHistory": 24},
                [{"path": "pinHistory", "operator": "atLeast", "value": 24}],
            ),
        )
    elif "software update deferment" in normalized_title:
        add_candidate(
            acc,
            "relution-native",
            "MACOS_RESTRICTION",
            ["forceDelayedSoftwareUpdates", "enforcedSoftwareUpdateDelay"],
            (
                "Relution exposes deferral controls, but the CIS recommendation allows any "
                "value up to 30 days and may require organization-specific update cadence "
                "decisions."
            ),
        )

