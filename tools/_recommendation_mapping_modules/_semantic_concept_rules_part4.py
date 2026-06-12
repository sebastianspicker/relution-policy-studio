"""Semantic concept rules for governance, data flow, and platform hardening."""

from .mapping_types_and_constants import (
    APPLE_APPLICATION_ACCESS,
    SemanticConceptRule,
    semantic_target,
)


SEMANTIC_CONCEPT_RULES_PART_4: tuple[SemanticConceptRule, ...] = (
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
    SemanticConceptRule(
        "device_onboarding",
        "Geräte-Onboarding und Enrollment",
        "Device onboarding and enrollment",
        (
            "bereitstellen",
            "bereitstellt",
            "enrollment",
            "registrierung",
            "geraeteregistrierung",
            "geräteregistrierung",
            "device enrollment",
            "onboarding",
            "installation des mdm-clients",
            "installation des mdm clients",
            "mdm-client",
            "mdm client",
            "verteilung",
            "verteilt werden",
            "deployment",
        ),
        (
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_COMPANION",
                ("enabled", "appInstallationTimeout", "pollAfterMinutes"),
                "Windows companion settings can support managed-device rollout behavior.",
            ),
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_APP_COMPLIANCE",
                ("requiredApps",),
                "Windows app compliance can require onboarding support software.",
            ),
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_RESTRICTION",
                ("allowManualUnenrollment",),
                "Windows restrictions can support managed enrollment constraints.",
            ),
            semantic_target(
                ("MACOS",),
                "relution-native",
                "MACOS_ACCOUNT_SETUP",
                (
                    "accountSetupConfiguration.primaryAccountManaged",
                    "accountSetupConfiguration.primaryAccountShortName",
                ),
                "macOS account setup can support managed device onboarding.",
            ),
            semantic_target(
                ("MACOS",),
                "relution-native",
                "MACOS_APP_COMPLIANCE",
                ("requiredApps",),
                "macOS app compliance can require onboarding support software.",
            ),
            semantic_target(
                ("IOS",),
                "relution-native",
                "IOS_SECURED_SHARED_DEVICE",
                ("relutionClientAppIdentifier", "enforceLoginViaAppLock"),
                "iOS secured shared-device settings can support managed onboarding workflows.",
            ),
            semantic_target(
                ("IOS",),
                "relution-native",
                "IOS_SHARED_DEVICE",
                ("assetTagInformation", "lockScreenFootnote"),
                "iOS shared-device settings can support device identification during onboarding.",
            ),
            semantic_target(
                ("IOS",),
                "relution-native",
                "IOS_APP_COMPLIANCE",
                ("requiredApps",),
                "iOS app compliance can require MDM client or onboarding support apps.",
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                "ANDROID_ENTERPRISE_COMPLIANCE_ENFORCEMENT",
                ("configurationEnforcementRules",),
                (
                    "Android Enterprise compliance enforcement can support onboarding completion "
                    "checks."
                ),
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                "ANDROID_ENTERPRISE_APP_POLICY",
                ("applications",),
                "Android Enterprise app policy can deploy onboarding support apps.",
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                "ANDROID_ENTERPRISE_RESTRICTION",
                ("factoryResetDisabled", "removeUserDisabled"),
                "Android Enterprise restrictions can support managed enrollment constraints.",
            ),
        ),
    ),
    SemanticConceptRule(
        "reference_configuration_rollout",
        "Referenzkonfiguration und Änderungsrollout",
        "Reference configuration and change rollout",
        (
            "grundkonfiguration",
            "referenzinstallation",
            "referenzumgebung",
            "referenzkonfiguration",
            "reference installation",
            "reference configuration",
            "konfigurationsaenderung",
            "konfigurationsaenderungen",
            "konfigurationsänderung",
            "konfigurationsänderungen",
            "sicherheitskonfiguration",
            "zentralisiert verteilt",
            "change rollout",
            "rollout",
        ),
        (
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_CUSTOM_CSP",
                ("installSyncML",),
                (
                    "Windows Custom CSP can distribute organization-specific reference "
                    "configuration settings."
                ),
            ),
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_LOCAL_DEVICE_SECURITY",
                (
                    "allowLocalAdminAccounts",
                    "inactivityTimeUntilScreenSaver",
                    "lanManagerAuthenticationLvl",
                ),
                "Windows local security policy can support reference security configuration.",
            ),
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_RESTRICTION",
                ("allowSettings", "allowPrivacy", "allowUpdateAndSecurity"),
                "Windows restrictions can support reference configuration decisions.",
            ),
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_COMPANION",
                ("pollInterval", "appInstallationTimeout"),
                "Windows companion settings can support rollout timing and managed app changes.",
            ),
            semantic_target(
                ("MACOS",),
                "relution-native",
                "MACOS_SECURITY_PREFERENCES",
                ("dontAllowFireWallUI", "dontAllowLockMessageUI"),
                "macOS security preferences can lock selected reference security settings.",
            ),
            semantic_target(
                ("MACOS",),
                "relution-native",
                "MACOS_SYSTEM_POLICY_CONTROL",
                ("allowIdentifiedDevelopers", "enableAssessment"),
                "macOS system policy control can support reference platform-trust configuration.",
            ),
            semantic_target(
                ("MACOS",),
                "relution-native",
                "MACOS_RESTRICTION",
                ("allowCloudDocumentSync", "allowCamera", "allowDiagnosticSubmission"),
                "macOS restrictions can support reference configuration decisions.",
            ),
            semantic_target(
                ("MACOS",),
                "relution-native",
                "MACOS_APP_COMPLIANCE",
                ("requiredApps",),
                "macOS app compliance can support reference software baselines.",
            ),
            semantic_target(
                ("IOS",),
                "relution-native",
                "IOS_RESTRICTION",
                (
                    "allowAppInstallation",
                    "allowCloudBackup",
                    "allowUIConfigurationProfileInstallation",
                ),
                "iOS restrictions can support reference configuration decisions.",
            ),
            semantic_target(
                ("IOS",),
                "relution-native",
                "IOS_APP_COMPLIANCE",
                ("requiredApps", "whitelistedApps"),
                "iOS app compliance can support reference software baselines.",
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                "ANDROID_ENTERPRISE_RESTRICTION",
                ("installAppsDisabled", "uninstallAppsDisabled", "vpnConfigDisabled"),
                "Android Enterprise restrictions can support reference configuration decisions.",
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
                (
                    "Android Enterprise advanced security can support reference security "
                    "configuration."
                ),
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                "ANDROID_ENTERPRISE_COMPLIANCE_ENFORCEMENT",
                ("configurationEnforcementRules",),
                (
                    "Android Enterprise compliance enforcement can monitor reference configuration "
                    "state."
                ),
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                "ANDROID_ENTERPRISE_APP_POLICY",
                ("applications",),
                "Android Enterprise app policy can support reference software baselines.",
            ),
        ),
    ),
)
