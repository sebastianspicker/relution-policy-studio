"""Phrase-specific iOS/iPadOS CIS mapping rules."""
from __future__ import annotations

from typing import Any

from _harvest_cis_benchmarks_modules.cis_mapping_accumulator import add_exact
from _harvest_cis_benchmarks_modules.cis_mapping_ios_passwords import add_minimum_ios_password_length, ios_password_proximity_disabled, ios_password_sharing_disabled, phrase_value_matches

def add_ios_special_mapping(
    acc: dict[str, list[dict[str, Any]] | list[str]],
    normalized_title: str,
    title: str,
    recommended_value: str | None,
) -> None:
    """Apply iOS/iPadOS mappings that need phrase-specific handling."""
    if add_ios_icloud_mapping(acc, normalized_title, recommended_value):
        return
    if "minimum password length" in normalized_title:
        add_minimum_ios_password_length(acc, recommended_value, title)
    elif (
        "require airplay outgoing requests pairing password" in normalized_title
        and recommended_value == "Yes"
    ):
        add_exact(
            acc,
            (
                "apple-schema-profile",
                "profile:com.apple.applicationaccess",
                ["forceAirPlayOutgoingRequestsPairingPassword"],
                {"forceAirPlayOutgoingRequestsPairingPassword": True},
            ),
        )
    elif (
        "maximum minutes after screen lock before password is required"
        in normalized_title
        and recommended_value == "Immediately"
    ):
        add_exact(
            acc,
            (
                "apple-schema-profile",
                "profile:com.apple.mobiledevice.passwordpolicy",
                ["maxGracePeriod"],
                {"maxGracePeriod": 0},
            ),
        )
    elif ios_password_proximity_disabled(normalized_title, recommended_value):
        add_exact(
            acc,
            (
                "apple-schema-profile",
                "profile:com.apple.applicationaccess",
                ["allowPasswordProximityRequests"],
                {"allowPasswordProximityRequests": False},
            ),
        )
    elif ios_password_sharing_disabled(normalized_title, recommended_value):
        add_exact(
            acc,
            (
                "apple-schema-profile",
                "profile:com.apple.applicationaccess",
                ["allowPasswordSharing"],
                {"allowPasswordSharing": False},
            ),
        )


def add_ios_icloud_mapping(
    acc: dict[str, list[dict[str, Any]] | list[str]],
    normalized_title: str,
    recommended_value: str | None,
) -> bool:
    """Map CIS iCloud allow/block phrasing to Relution restriction fields."""
    icloud_rules = [
        (
            ("allow icloud backup", "Disabled"),
            ("block icloud backup", "Yes"),
            ["allowCloudBackup"],
            {"allowCloudBackup": False},
        ),
        (
            ("allow icloud documents & data", "Disabled"),
            ("block icloud document and data sync", "Yes"),
            ["allowCloudDocumentSync"],
            {"allowCloudDocumentSync": False},
        ),
        (
            ("allow managed apps to store data in icloud", "Disabled"),
            ("block managed apps from storing data in icloud", "Yes"),
            ["allowManagedAppsCloudSync"],
            {"allowManagedAppsCloudSync": False},
        ),
    ]
    for disabled_phrase, block_phrase, field_paths, values in icloud_rules:
        if phrase_value_matches(
            normalized_title, recommended_value, disabled_phrase
        ) or phrase_value_matches(normalized_title, recommended_value, block_phrase):
            add_exact(acc, ("relution-native", "IOS_RESTRICTION", field_paths, values))
            return True
    return False

