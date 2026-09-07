"""Windows-specific CIS mapping rules."""
from __future__ import annotations

from typing import Any

from _harvest_cis_benchmarks_modules.cis_mapping_accumulator import add_candidate, add_exact

def add_windows_standalone_mapping(
    acc: dict[str, list[dict[str, Any]] | list[str]],
    normalized_title: str,
    recommended_value: str | None,
) -> None:
    """Apply curated Windows standalone password and camera mappings."""
    if "enforce password history" in normalized_title:
        add_exact(
            acc,
            (
                "relution-native",
                "WINDOWS_PASSCODE",
                ["history"],
                {"history": 24},
                [{"path": "history", "operator": "atLeast", "value": 24}],
            ),
        )
    elif (
        "minimum password length" in normalized_title
        and "relax minimum password length limits" not in normalized_title
    ):
        add_exact(
            acc,
            (
                "relution-native",
                "WINDOWS_PASSCODE",
                ["minLength"],
                {"minLength": 14},
                [{"path": "minLength", "operator": "atLeast", "value": 14}],
            ),
        )
    elif "allow use of camera" in normalized_title and recommended_value == "Disabled":
        add_exact(
            acc,
            (
                "relution-native",
                "WINDOWS_RESTRICTION",
                ["allowCamera"],
                {"allowCamera": False},
            ),
        )


def add_windows_defender_mapping(
    acc: dict[str, list[dict[str, Any]] | list[str]],
    normalized_title: str,
    recommended_value: str | None,
) -> None:
    """Apply curated Microsoft Defender Antivirus mappings."""
    if (
        "turn on behavior monitoring" in normalized_title
        and recommended_value == "Enabled"
    ):
        add_exact(
            acc,
            (
                "relution-native",
                "WINDOWS_ANTIVIRUS",
                ["allowBehaviorMonitoring"],
                {"allowBehaviorMonitoring": True},
            ),
        )
    elif (
        "turn on script scanning" in normalized_title and recommended_value == "Enabled"
    ):
        add_exact(
            acc,
            (
                "relution-native",
                "WINDOWS_ANTIVIRUS",
                ["allowScriptScanning"],
                {"allowScriptScanning": True},
            ),
        )
    elif (
        "potentially unwanted applications" in normalized_title
        and "block" in (recommended_value or "").lower()
    ):
        add_exact(
            acc,
            (
                "relution-native",
                "WINDOWS_ANTIVIRUS",
                ["puaProtection"],
                {"puaProtection": "ON"},
            ),
        )
    elif (
        "dangerous websites" in normalized_title
        and "block" in (recommended_value or "").lower()
    ):
        add_exact(
            acc,
            (
                "relution-native",
                "WINDOWS_ANTIVIRUS",
                ["enableNetworkProtection"],
                {"enableNetworkProtection": "ON"},
            ),
        )
    elif "join microsoft maps" in normalized_title:
        add_candidate(
            acc,
            "relution-native",
            "WINDOWS_ANTIVIRUS",
            ["allowCloudProtection"],
            (
                "MAPS enrollment is related to cloud protection, but the Relution Windows "
                "antivirus template only exposes a coarse cloud-protection toggle rather than "
                "the CIS MAPS membership level."
            ),
        )

