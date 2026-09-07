"""Shared constants and type aliases for baseline-template generation."""

from typing import Any

from .artifact_paths import REPO_ROOT

BASELINE_TEMPLATE_ROOT = REPO_ROOT / "example" / "relution-baseline-templates"
BASELINE_TEMPLATE_SOURCE_ROOT = BASELINE_TEMPLATE_ROOT / "sources"
BASELINE_TEMPLATE_CONSOLIDATED_ROOT = BASELINE_TEMPLATE_ROOT / "consolidated"
BASELINE_TEMPLATE_MODULAR_ROOT = BASELINE_TEMPLATE_ROOT / "modular"
BASELINE_TEMPLATE_TIERED_ROOT = BASELINE_TEMPLATE_ROOT / "tiered"
BASELINE_TEMPLATE_INDEX_PATH = BASELINE_TEMPLATE_ROOT / "index.json"
BASELINE_TEMPLATE_PLATFORMS = ("WINDOWS", "MACOS", "IOS", "ANDROID_ENTERPRISE")
SOURCE_PRECEDENCE = ("bsi", "cis", "vendor")
BASELINE_TIERS = (1, 2, 3)
MULTI_INSTANCE_CONSOLIDATED_TARGETS = {
    ("relution-native", "WINDOWS_CUSTOM_CSP"),
}
MACOS_IMPORT_CONFLICT_PREFERENCES = (
    {
        "preferred": (
            "apple-schema-profile",
            "profile:com.apple.mobiledevice.passwordpolicy",
        ),
        "suppressed": ("relution-native", "IOS_PASSCODE"),
        "reason": (
            "Relution imports the macOS password policy profile as the server-side passcode "
            "singleton."
        ),
    },
    {
        "preferred": ("apple-schema-profile", "profile:com.apple.security.firewall"),
        "suppressed": ("relution-native", "MACOS_FIREWALL"),
        "reason": (
            "Relution imports the macOS firewall profile as the server-side firewall "
            "singleton."
        ),
    },
    {
        "preferred": ("relution-native", "MACOS_RESTRICTION"),
        "suppressed": ("apple-schema-profile", "profile:com.apple.applicationaccess"),
        "reason": (
            "Relution treats macOS restrictions and the application access payload as "
            "conflicting server singletons; the BSI native restriction mapping has "
            "precedence."
        ),
    },
    {
        "preferred": ("relution-native", "MACOS_SCREENSAVER"),
        "suppressed": ("apple-schema-profile", "profile:com.apple.screensaver"),
        "reason": (
            "Relution imports the macOS screensaver profile as the server-side screensaver "
            "singleton; the BSI native screensaver mapping has precedence."
        ),
    },
)
IOS_IMPORT_CONFLICT_PREFERENCES = (
    {
        "preferred": ("relution-native", "IOS_PASSCODE"),
        "suppressed": (
            "apple-schema-profile",
            "profile:com.apple.mobiledevice.passwordpolicy",
        ),
        "reason": (
            "Relution treats the iOS password policy profile and native passcode setting as "
            "conflicting server singletons; the BSI native passcode mapping has precedence."
        ),
    },
    {
        "preferred": ("relution-native", "IOS_RESTRICTION"),
        "suppressed": ("apple-schema-profile", "profile:com.apple.applicationaccess"),
        "reason": (
            "Relution treats the iOS application access payload and native restrictions as "
            "conflicting server singletons; the BSI native restriction mapping has "
            "precedence."
        ),
    },
)
NON_IMPORTABLE_CONSOLIDATED_TARGETS = {
    (
        "IOS",
        "relution-native",
        "IOS_WIFI",
    ): (
        "IOS_WIFI requires organization-specific ssid, encryptionType, and proxyType "
        "values; disableAssociationMACRandomization is retained as informational "
        "guidance instead of an importable singleton."
    ),
}

GroupedEntries = dict[tuple[str, str], list[dict[str, Any]]]
SuppressionResult = tuple[GroupedEntries, list[dict[str, Any]], list[dict[str, Any]]]
