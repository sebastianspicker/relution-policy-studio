"""Curated exact and partial BSI-to-Relution mapping rules."""

from typing import Any

MAPPING_RULES: dict[tuple[str, str], dict[str, Any]] = {
    ("ANDROID_ENTERPRISE", "SYS.3.2.4.A2"): {
        "status": "exact",
        "mergeableInImportableRuleset": True,
        "candidates": [
            {
                "kind": "relution-native",
                "target": "ANDROID_ENTERPRISE_ADVANCED_SECURITY_OVERRIDES",
                "fieldPaths": ["developerSettings"],
            }
        ],
        "rulesetMappings": [
            {
                "kind": "relution-native",
                "type": "ANDROID_ENTERPRISE_ADVANCED_SECURITY_OVERRIDES",
                "values": {"developerSettings": "DEVELOPER_SETTINGS_DISABLED"},
            }
        ],
        "notes": [
            (
                "BSI explicitly recommends that Android developer mode should be disabled on "
                "all Android-based devices."
            )
        ],
    },
    ("ANDROID_ENTERPRISE", "SYS.3.2.1.A8"): {
        "status": "partial",
        "mergeableInImportableRuleset": False,
        "candidates": [
            {
                "kind": "relution-native",
                "target": "ANDROID_ENTERPRISE_ADVANCED_SECURITY_OVERRIDES",
                "fieldPaths": ["untrustedAppsPolicy"],
            }
        ],
        "rulesetMappings": [],
        "notes": [
            (
                "Relution can block installation from unauthorized sources, but the BSI "
                "requirement also covers governance of approved apps and approved app sources."
            )
        ],
    },
    ("ANDROID_ENTERPRISE", "SYS.3.2.1.A11"): {
        "status": "partial",
        "mergeableInImportableRuleset": False,
        "candidates": [
            {
                "kind": "relution-native",
                "target": "ANDROID_ENTERPRISE_ADVANCED_SECURITY_OVERRIDES",
                "fieldPaths": ["encryptionPolicy"],
            }
        ],
        "rulesetMappings": [],
        "notes": [
            (
                "The Android Enterprise encryption policy covers storage encryption, but the "
                "BSI text is a broader mobile requirement that is not Android-only."
            )
        ],
    },
    ("ANDROID_ENTERPRISE", "SYS.2.1.A21"): {
        "status": "partial",
        "mergeableInImportableRuleset": False,
        "candidates": [
            {
                "kind": "relution-native",
                "target": "ANDROID_ENTERPRISE_DISABLE_CAMERAS",
                "fieldPaths": ["cameraDisabled"],
            }
        ],
        "rulesetMappings": [],
        "notes": [
            (
                "The BSI requirement covers microphones and cameras, while the Relution "
                "template only covers camera disablement."
            )
        ],
    },
    ("IOS", "SYS.2.1.A21"): {
        "status": "partial",
        "mergeableInImportableRuleset": False,
        "candidates": [
            {
                "kind": "relution-native",
                "target": "IOS_RESTRICTION",
                "fieldPaths": ["allowCamera"],
            }
        ],
        "rulesetMappings": [],
        "notes": [
            (
                "The BSI requirement covers microphones and cameras, while the Relution "
                "template only covers camera disablement."
            )
        ],
    },
    ("IOS", "SYS.3.2.3.A14"): {
        "status": "partial",
        "mergeableInImportableRuleset": False,
        "candidates": [
            {
                "kind": "relution-native",
                "target": "IOS_RESTRICTION",
                "fieldPaths": [
                    "allowCloudBackup",
                    "allowCloudDocumentSync",
                    "allowCloudKeychainSync",
                    "allowCloudPhotoLibrary",
                ],
            }
        ],
        "rulesetMappings": [],
        "notes": [
            (
                "The iOS restriction payload can reduce iCloud usage, but the BSI requirement "
                "also depends on local policy decisions and two-factor authentication for "
                "allowed use."
            )
        ],
    },
    ("IOS", "SYS.3.2.3.A17"): {
        "status": "partial",
        "mergeableInImportableRuleset": False,
        "candidates": [
            {
                "kind": "relution-native",
                "target": "IOS_PASSCODE",
                "fieldPaths": ["pinHistory"],
            }
        ],
        "rulesetMappings": [],
        "notes": [
            (
                "BSI requires an appropriate device-code history value, but does not prescribe "
                "a concrete history depth."
            )
        ],
    },
    ("MACOS", "SYS.2.1.A21"): {
        "status": "partial",
        "mergeableInImportableRuleset": False,
        "candidates": [
            {
                "kind": "relution-native",
                "target": "MACOS_RESTRICTION",
                "fieldPaths": ["allowCamera"],
            }
        ],
        "rulesetMappings": [],
        "notes": [
            (
                "The BSI requirement covers microphones and cameras, while the Relution "
                "template only covers camera disablement."
            )
        ],
    },
    ("MACOS", "SYS.2.4.A4"): {
        "status": "partial",
        "mergeableInImportableRuleset": False,
        "candidates": [
            {
                "kind": "relution-native",
                "target": "MACOS_FILE_VAULT",
                "fieldPaths": [
                    "enabled",
                    "enableRecoveryKeyEscrow",
                    "fdeFileVaultOptions.dontAllowFDEDisable",
                ],
            }
        ],
        "rulesetMappings": [],
        "notes": [
            (
                "Relution can enforce FileVault, but the BSI requirement also covers "
                "recovery-key handling and banning Apple-hosted key storage."
            )
        ],
    },
    ("MACOS", "SYS.2.4.A10"): {
        "status": "exact",
        "mergeableInImportableRuleset": True,
        "candidates": [
            {
                "kind": "apple-schema-profile",
                "target": "profile:com.apple.security.firewall",
                "fieldPaths": ["EnableFirewall"],
            }
        ],
        "rulesetMappings": [
            {
                "kind": "apple-schema-profile",
                "schemaId": "profile:com.apple.security.firewall",
                "values": {"EnableFirewall": True},
            }
        ],
        "notes": [
            "The Apple firewall profile can enforce the built-in macOS personal firewall directly."
        ],
    },
    ("MACOS", "SYS.2.4.A8"): {
        "status": "partial",
        "mergeableInImportableRuleset": False,
        "candidates": [
            {
                "kind": "relution-native",
                "target": "MACOS_RESTRICTION",
                "fieldPaths": [
                    "allowCloudDocumentSync",
                    "allowCloudKeychainSync",
                    "allowCloudPhotoLibrary",
                    "allowCloudDesktopAndDocuments",
                ],
            }
        ],
        "rulesetMappings": [],
        "notes": [
            (
                "Relution can disable multiple iCloud synchronization surfaces, but the BSI "
                "requirement applies specifically to sensitive data and institution-operated "
                "services."
            )
        ],
    },
    ("WINDOWS", "SYS.2.1.A21"): {
        "status": "partial",
        "mergeableInImportableRuleset": False,
        "candidates": [
            {
                "kind": "relution-native",
                "target": "WINDOWS_RESTRICTION",
                "fieldPaths": ["allowCamera"],
            }
        ],
        "rulesetMappings": [],
        "notes": [
            (
                "The BSI requirement covers microphones and cameras, while the available "
                "Windows template candidate only covers camera disablement."
            )
        ],
    },
    ("WINDOWS", "SYS.2.2.3.A4"): {
        "status": "partial",
        "mergeableInImportableRuleset": False,
        "candidates": [
            {
                "kind": "relution-native",
                "target": "WINDOWS_RESTRICTION",
                "fieldPaths": [
                    "allowPrivacy",
                    "allowPrivacyExperience",
                    "allowSyncMySettings",
                ],
            }
        ],
        "rulesetMappings": [],
        "notes": [
            (
                "Relution exposes Windows privacy-related settings, but the BSI telemetry "
                "requirement is broader than a single toggle set."
            )
        ],
    },
    ("WINDOWS", "SYS.2.2.3.A6"): {
        "status": "partial",
        "mergeableInImportableRuleset": False,
        "candidates": [
            {
                "kind": "relution-native",
                "target": "WINDOWS_RESTRICTION",
                "fieldPaths": [
                    "allowAddingForeignAccountsManually",
                    "allowAccounts",
                    "allowYourAccount",
                ],
            }
        ],
        "rulesetMappings": [],
        "notes": [
            (
                "The BSI requirement limits online-account integration, but compliance still "
                "depends on directory-service and account-governance decisions outside a single "
                "template."
            )
        ],
    },
}
