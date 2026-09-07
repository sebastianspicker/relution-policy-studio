"""Primary iOS/iPadOS CIS mapping rules."""
from __future__ import annotations

from typing import Any

from _harvest_cis_benchmarks_modules.cis_mapping_accumulator import add_exact
from _harvest_cis_benchmarks_modules.cis_mapping_ios_special import add_ios_special_mapping

def add_ios_curated_mapping(
    acc: dict[str, list[dict[str, Any]] | list[str]],
    normalized_title: str,
    title: str,
    recommended_value: str | None,
) -> None:
    """Apply direct iOS/iPadOS restriction and passcode mapping rules."""
    ios_rules = [
        (
            "force encrypted backup",
            {"forceEncryptedBackup": True},
            "relution-native",
            "IOS_RESTRICTION",
            ["forceEncryptedBackup"],
            {"Enabled", "Yes"},
        ),
        (
            "block simple passwords",
            {"allowSimple": False},
            "relution-native",
            "IOS_PASSCODE",
            ["allowSimple"],
            {"Yes"},
        ),
        (
            "block touch id and face id unlock",
            {"allowFingerprintForUnlock": False},
            "relution-native",
            "IOS_RESTRICTION",
            ["allowFingerprintForUnlock"],
            {"Yes"},
        ),
        (
            "require safari fraud warnings",
            {"safariForceFraudWarning": True},
            "apple-schema-profile",
            "profile:com.apple.applicationaccess",
            ["safariForceFraudWarning"],
            {"Yes"},
        ),
        (
            "block icloud photos sync",
            {"allowCloudPhotoLibrary": False},
            "apple-schema-profile",
            "profile:com.apple.applicationaccess",
            ["allowCloudPhotoLibrary"],
            {"Yes"},
        ),
        (
            "require password",
            {"forcePIN": True},
            "apple-schema-profile",
            "profile:com.apple.mobiledevice.passwordpolicy",
            ["forcePIN"],
            {"Yes"},
        ),
        (
            "required password type",
            {"requireAlphanumeric": True},
            "apple-schema-profile",
            "profile:com.apple.mobiledevice.passwordpolicy",
            ["requireAlphanumeric"],
            {"Alphanumeric"},
        ),
        (
            "block icloud keychain sync",
            {"allowCloudKeychainSync": False},
            "apple-schema-profile",
            "profile:com.apple.applicationaccess",
            ["allowCloudKeychainSync"],
            {"Yes"},
        ),
        (
            "authentication for autofill",
            {"forceAuthenticationBeforeAutoFill": True},
            "apple-schema-profile",
            "profile:com.apple.applicationaccess",
            ["forceAuthenticationBeforeAutoFill"],
            {"Yes"},
        ),
    ]
    for phrase, values, kind, target, field_paths, accepted_values in ios_rules:
        if phrase in normalized_title and recommended_value in accepted_values:
            add_exact(acc, (kind, target, field_paths, values))
            return
    add_ios_special_mapping(acc, normalized_title, title, recommended_value)

