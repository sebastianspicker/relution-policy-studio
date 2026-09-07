"""Semantic concept rules for governance, data flow, and platform hardening."""

from ._mapping_models import SemanticConceptRule
from ._mapping_models import semantic_target


SEMANTIC_CONCEPT_RULES_DEVICE_LIFECYCLE: tuple[SemanticConceptRule, ...] = (
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
