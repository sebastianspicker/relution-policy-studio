"""Semantic concept rules for governance, data flow, and platform hardening."""

from ._mapping_models import SemanticConceptRule
from ._mapping_models import semantic_target


SEMANTIC_CONCEPT_RULES_MANAGEMENT_STRATEGY: tuple[SemanticConceptRule, ...] = (
    SemanticConceptRule(
        "mdm_strategy_selection",
        "MDM-Strategie und Produktauswahl",
        "MDM strategy and product selection",
        (
            "mdm-strategie",
            "mdm strategie",
            "strategie fuer das mobile device management",
            "strategie für das mobile device management",
            "strategie zur ios-nutzung",
            "ios-nutzung",
            "ios nutzung",
            "auswahl eines mdm-produkts",
            "auswahl eines mdm produkts",
            "mdm-produkt",
            "mdm produkt",
            "mdm product",
            "mdm-software",
            "mdm software",
            "mobile device management",
            "managementsystem",
            "verwaltungssoftware",
            "mdm",
        ),
        (
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_COMPANION",
                ("enabled", "pollInterval", "manageWingetDependencies"),
                (
                    "Windows companion settings are a Relution management-support surface, not an "
                    "exact MDM strategy implementation."
                ),
            ),
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_APP_COMPLIANCE",
                ("requiredApps",),
                "Windows app compliance can support MDM strategy checks for required software.",
            ),
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_CUSTOM_CSP",
                ("installSyncML",),
                "Windows Custom CSP can support strategy-specific policy requirements.",
            ),
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_RESTRICTION",
                ("allowManualUnenrollment", "allowSettings"),
                "Windows restrictions can support selected management strategy constraints.",
            ),
            semantic_target(
                ("MACOS",),
                "relution-native",
                "MACOS_APP_COMPLIANCE",
                ("requiredApps",),
                "macOS app compliance can support MDM strategy checks for required software.",
            ),
            semantic_target(
                ("MACOS",),
                "relution-native",
                "MACOS_ACCOUNT_SETUP",
                (
                    "accountSetupConfiguration.primaryAccountManaged",
                    "accountSetupConfiguration.primaryAccountAdmin",
                ),
                "macOS account setup can support managed onboarding decisions.",
            ),
            semantic_target(
                ("MACOS",),
                "relution-native",
                "MACOS_RESTRICTION",
                ("allowCloudDocumentSync", "allowDiagnosticSubmission"),
                "macOS restrictions can support selected management strategy constraints.",
            ),
            semantic_target(
                ("IOS",),
                "relution-native",
                "IOS_APP_COMPLIANCE",
                ("requiredApps", "disableAll", "whitelistedApps"),
                "iOS app compliance can support MDM strategy checks for required or allowed apps.",
            ),
            semantic_target(
                ("IOS",),
                "relution-native",
                "IOS_RESTRICTION",
                (
                    "allowUIConfigurationProfileInstallation",
                    "allowAppInstallation",
                    "allowOpenFromManagedToUnmanaged",
                ),
                "iOS restrictions can support selected MDM strategy constraints.",
            ),
            semantic_target(
                ("IOS",),
                "relution-native",
                "IOS_SECURED_SHARED_DEVICE",
                ("relutionClientAppIdentifier", "enforceLoginViaAppLock"),
                "iOS secured shared-device settings can support managed device strategy decisions.",
            ),
            semantic_target(
                ("IOS",),
                "relution-native",
                "IOS_SHARED_DEVICE",
                ("assetTagInformation", "lockScreenFootnote"),
                (
                    "iOS shared-device settings can support device identification and user-facing "
                    "policy context."
                ),
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                "ANDROID_ENTERPRISE_COMPLIANCE_ENFORCEMENT",
                ("configurationEnforcementRules",),
                (
                    "Android Enterprise compliance enforcement is a management-support surface for "
                    "MDM strategy checks."
                ),
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                "ANDROID_ENTERPRISE_APP_POLICY",
                ("applications", "connectedWorkAndPersonalApp"),
                "Android Enterprise app policy can support strategy-specific app scope.",
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                "ANDROID_ENTERPRISE_ADVANCED_SECURITY_OVERRIDES",
                (
                    "untrustedAppsPolicy",
                    "googlePlayProtectVerifyApps",
                    "encryptionPolicy",
                ),
                "Android Enterprise advanced security can support MDM product requirement checks.",
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                "ANDROID_ENTERPRISE_RESTRICTION",
                (
                    "installAppsDisabled",
                    "uninstallAppsDisabled",
                    "modifyAccountsDisabled",
                ),
                "Android Enterprise restrictions can support selected MDM strategy constraints.",
            ),
        ),
    ),
)
