"""Semantic concept rules for governance, data flow, and platform hardening."""

from ._apple_analog_constants import APPLE_APPLICATION_ACCESS
from ._mapping_models import SemanticConceptRule
from ._mapping_models import semantic_target


SEMANTIC_CONCEPT_RULES_DATA_GOVERNANCE: tuple[SemanticConceptRule, ...] = (
    SemanticConceptRule(
        "managed_data_flow",
        "Managed Open-In und Datenfluss",
        "Managed data flow",
        (
            "managed open",
            "managed pasteboard",
            "copy/paste",
            "pasteboard",
            "datenfluss",
            "unmanaged",
            "managed domains",
            "corporate documents",
            "dienstliche daten",
        ),
        (
            semantic_target(
                ("IOS",),
                "relution-native",
                "IOS_MANAGED_DOMAINS",
                ("emailDomains", "webDomains"),
                "iOS managed domains can scope managed data flow.",
            ),
            semantic_target(
                ("IOS", "MACOS"),
                "apple-schema-profile",
                APPLE_APPLICATION_ACCESS,
                (
                    "requireManagedPasteboard",
                    "allowOpenFromManagedToUnmanaged",
                    "allowOpenFromUnmanagedToManaged",
                ),
                "Apple restrictions schema covers managed pasteboard and open-in controls.",
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                "ANDROID_ENTERPRISE_PERSONAL_USAGE",
                ("personalApplications", "personalPlayStoreMode"),
                (
                    "Android Enterprise personal-usage controls help separate work and personal "
                    "data flow."
                ),
            ),
        ),
        ("KONF.11.8",),
    ),
    SemanticConceptRule(
        "policy_governance",
        "Richtlinien und Governance",
        "Policy and governance",
        (
            "richtlinie",
            "richtlinien",
            "sicherheitsrichtlinie",
            "sicherheitsrichtlinien",
            "interne richtlinien",
            "security policy",
            "local security policy",
            "policy governance",
            "nutzung und kontrolle der geraete",
            "nutzung und kontrolle der geräte",
            "kontrolle der geraete",
            "kontrolle der geräte",
            "control of devices",
            "regelungen",
        ),
        (
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_LOCAL_DEVICE_SECURITY",
                ("allowLocalAdminAccounts", "allowGuestAccounts", "loginMessageText"),
                (
                    "Windows local security policy supports documented governance decisions for "
                    "managed clients."
                ),
            ),
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_RESTRICTION",
                ("allowSettings", "allowAccounts", "allowPrivacy"),
                (
                    "Windows restrictions can implement selected policy decisions once local scope "
                    "is known."
                ),
            ),
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_APP_COMPLIANCE",
                ("requiredApps",),
                "Windows app compliance can support policy checks for required managed software.",
            ),
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_CUSTOM_CSP",
                ("installSyncML",),
                "Windows Custom CSP can carry organization-specific security policy settings.",
            ),
            semantic_target(
                ("MACOS",),
                "relution-native",
                "MACOS_RESTRICTION",
                ("allowCamera", "allowCloudDocumentSync", "allowDiagnosticSubmission"),
                (
                    "macOS restrictions can implement selected policy decisions once local "
                    "scope is known."
                ),
            ),
            semantic_target(
                ("MACOS",),
                "relution-native",
                "MACOS_SECURITY_PREFERENCES",
                ("dontAllowFireWallUI", "dontAllowLockMessageUI"),
                "macOS security preferences can protect locally governed security settings.",
            ),
            semantic_target(
                ("MACOS",),
                "relution-native",
                "MACOS_SYSTEM_POLICY_CONTROL",
                ("allowIdentifiedDevelopers", "enableAssessment"),
                "macOS system policy control supports platform trust decisions.",
            ),
            semantic_target(
                ("MACOS",),
                "relution-native",
                "MACOS_APP_COMPLIANCE",
                ("requiredApps",),
                "macOS app compliance can support policy checks for required managed software.",
            ),
            semantic_target(
                ("IOS",),
                "relution-native",
                "IOS_RESTRICTION",
                ("allowAppInstallation", "allowCamera", "allowCloudBackup"),
                (
                    "iOS restrictions can implement selected policy decisions once local scope is "
                    "known."
                ),
            ),
            semantic_target(
                ("IOS",),
                "relution-native",
                "IOS_APP_COMPLIANCE",
                ("requiredApps", "whitelistedApps", "uninstallForbiddenApps"),
                "iOS app compliance can support policy checks for required or forbidden apps.",
            ),
            semantic_target(
                ("IOS",),
                "relution-native",
                "IOS_SHARED_DEVICE",
                ("assetTagInformation", "lockScreenFootnote"),
                (
                    "iOS shared-device settings can surface organization policy context on managed "
                    "devices."
                ),
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                "ANDROID_ENTERPRISE_RESTRICTION",
                (
                    "installAppsDisabled",
                    "uninstallAppsDisabled",
                    "screenCaptureDisabled",
                ),
                (
                    "Android Enterprise restrictions can implement selected policy decisions once "
                    "local scope is known."
                ),
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                "ANDROID_ENTERPRISE_COMPLIANCE_ENFORCEMENT",
                ("configurationEnforcementRules",),
                (
                    "Android Enterprise compliance enforcement can support governance checks and "
                    "reactions."
                ),
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                "ANDROID_ENTERPRISE_APP_POLICY",
                ("applications",),
                "Android Enterprise app policy can support governed app scope.",
            ),
        ),
    ),
)
