"""Semantic concept rules for MDM strategy and device lifecycle controls."""

from .mapping_types_and_constants import SemanticConceptRule, semantic_target


SEMANTIC_CONCEPT_RULES_PART_5: tuple[SemanticConceptRule, ...] = (
    SemanticConceptRule(
        "administration_procedures",
        "Administrationsverfahren",
        "Administration procedures",
        (
            "administrationsverfahren",
            "administrationsprozess",
            "administration",
            "administriert",
            "administrative procedures",
            "admin procedures",
            "verwaltung der sicherheitsrichtlinien",
            "lokale sicherheitsrichtlinien",
            "sicherheitsmanagement",
            "betriebsdokumentation",
            "betriebliche aufgaben",
        ),
        (
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_LOCAL_DEVICE_SECURITY",
                (
                    "allowLocalAdminAccounts",
                    "requireCtrlAltDelToLogon",
                    "loginMessageText",
                ),
                "Windows local security policy can support administration-procedure constraints.",
            ),
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_CUSTOM_CSP",
                ("installSyncML",),
                "Windows Custom CSP can carry administrative hardening settings.",
            ),
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_COMPANION",
                ("logLevel", "pollInterval"),
                "Windows companion settings expose management polling and logging support.",
            ),
            semantic_target(
                ("MACOS",),
                "relution-native",
                "MACOS_ACCOUNT_SETUP",
                (
                    "accountSetupConfiguration.primaryAccountAdmin",
                    "accountSetupConfiguration.adminAccountHidden",
                ),
                "macOS account setup can support administrative account procedures.",
            ),
            semantic_target(
                ("MACOS",),
                "relution-native",
                "MACOS_SECURITY_PREFERENCES",
                ("dontAllowFireWallUI", "dontAllowPasswordResetUI"),
                "macOS security preferences can protect administrative security changes.",
            ),
            semantic_target(
                ("MACOS",),
                "relution-native",
                "MACOS_SYSTEM_POLICY_CONTROL",
                ("allowIdentifiedDevelopers", "enableAssessment"),
                "macOS system policy control supports administrative platform-trust decisions.",
            ),
            semantic_target(
                ("IOS",),
                "relution-native",
                "IOS_RESTRICTION",
                (
                    "allowUIConfigurationProfileInstallation",
                    "allowEraseContentAndSettings",
                ),
                "iOS restrictions can limit administrative profile and erase actions.",
            ),
            semantic_target(
                ("IOS",),
                "relution-native",
                "IOS_APP_COMPLIANCE",
                ("requiredApps", "uninstallForbiddenApps"),
                "iOS app compliance can support administrative software requirements.",
            ),
            semantic_target(
                ("IOS",),
                "relution-native",
                "IOS_SECURED_SHARED_DEVICE",
                ("enforceLoginViaAppLock", "disableSsoLogin"),
                "iOS secured shared-device settings can support controlled administrative use.",
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                "ANDROID_ENTERPRISE_RESTRICTION",
                (
                    "modifyAccountsDisabled",
                    "credentialsConfigDisabled",
                    "factoryResetDisabled",
                ),
                "Android Enterprise restrictions can support administrative procedure constraints.",
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                "ANDROID_ENTERPRISE_COMPLIANCE_ENFORCEMENT",
                ("configurationEnforcementRules",),
                "Android Enterprise compliance enforcement can support administrative checks.",
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                "ANDROID_ENTERPRISE_ADVANCED_SECURITY_OVERRIDES",
                ("developerSettings", "commonCriteriaMode"),
                (
                    "Android Enterprise advanced security can support administrative hardening "
                    "settings."
                ),
            ),
        ),
    ),
    SemanticConceptRule(
        "hardened_device_procurement",
        "Abgesicherte Geräte und Beschaffung",
        "Hardened devices and procurement",
        (
            "besonders abgesicherte endgeraete",
            "besonders abgesicherte endgeräte",
            "besonders abgesicherte mobile endgeraete",
            "besonders abgesicherte mobile endgeräte",
            "abgesicherte endgeraete",
            "abgesicherte endgeräte",
            "geeignete endgeraete",
            "geeignete endgeräte",
            "erlaubte mobile endgeraete",
            "erlaubte mobile endgeräte",
            "aktuelle mac-hardware",
            "aktuelle mac hardware",
            "geeignete windows-version",
            "geeignete windows version",
            "auswahl und beschaffung",
            "beschaffung",
            "procurement",
            "secure hardware",
            "hardened device",
            "hardened devices",
            "latest device architecture",
            "device architecture",
            "current hardware architecture",
            "high-value target",
            "high value target",
            "high-value targets",
            "high value targets",
        ),
        (
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_LOCAL_DEVICE_SECURITY",
                (
                    "allowLocalAdminAccounts",
                    "lanManagerAuthenticationLvl",
                    "onlyElevateSignedValidExecFiles",
                ),
                "Windows local security policy can support hardened-device baseline decisions.",
            ),
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_CUSTOM_CSP",
                ("installSyncML",),
                "Windows Custom CSP can support hardware- or edition-specific hardening settings.",
            ),
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_RESTRICTION",
                (
                    "allowDeveloperUnlock",
                    "allowAllTrustedApps",
                    "allowUpdateAndSecurity",
                ),
                "Windows restrictions can support hardened device selection constraints.",
            ),
            semantic_target(
                ("MACOS",),
                "relution-native",
                "MACOS_SYSTEM_POLICY_CONTROL",
                ("allowIdentifiedDevelopers", "enableAssessment"),
                "macOS system policy control supports hardened platform-trust decisions.",
            ),
            semantic_target(
                ("MACOS",),
                "relution-native",
                "MACOS_SECURITY_PREFERENCES",
                ("dontAllowFireWallUI", "dontAllowPasswordResetUI"),
                "macOS security preferences can support protected security controls.",
            ),
            semantic_target(
                ("MACOS",),
                "relution-native",
                "MACOS_RESTRICTION",
                ("allowCloudDocumentSync", "allowDiagnosticSubmission", "allowAirDrop"),
                "macOS restrictions can support hardened-device constraints.",
            ),
            semantic_target(
                ("MACOS",),
                "relution-native",
                "MACOS_APP_COMPLIANCE",
                ("requiredApps",),
                "macOS app compliance can support hardened software baselines.",
            ),
            semantic_target(
                ("IOS",),
                "relution-native",
                "IOS_SECURED_SHARED_DEVICE",
                (
                    "relutionClientAppIdentifier",
                    "enforceLoginViaAppLock",
                    "disableTouch",
                ),
                (
                    "iOS secured shared-device settings can support hardened shared-device "
                    "deployments."
                ),
            ),
            semantic_target(
                ("IOS",),
                "relution-native",
                "IOS_SHARED_DEVICE",
                ("assetTagInformation", "lockScreenFootnote"),
                "iOS shared-device settings can identify governed device classes.",
            ),
            semantic_target(
                ("IOS",),
                "relution-native",
                "IOS_RESTRICTION",
                ("allowAppInstallation", "allowCloudBackup", "allowScreenShot"),
                "iOS restrictions can support hardened-device constraints.",
            ),
            semantic_target(
                ("IOS",),
                "relution-native",
                "IOS_APP_COMPLIANCE",
                ("requiredApps", "whitelistedApps"),
                "iOS app compliance can support hardened software baselines.",
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                "ANDROID_ENTERPRISE_ADVANCED_SECURITY_OVERRIDES",
                (
                    "googlePlayProtectVerifyApps",
                    "commonCriteriaMode",
                    "encryptionPolicy",
                ),
                "Android Enterprise advanced security can support hardened-device requirements.",
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                "ANDROID_ENTERPRISE_RESTRICTION",
                (
                    "debuggingFeaturesAllowed",
                    "safeBootDisabled",
                    "screenCaptureDisabled",
                ),
                "Android Enterprise restrictions can support hardened-device constraints.",
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                "ANDROID_ENTERPRISE_COMPLIANCE_ENFORCEMENT",
                ("configurationEnforcementRules",),
                "Android Enterprise compliance enforcement can check hardened-device state.",
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                "ANDROID_ENTERPRISE_APP_POLICY",
                ("applications",),
                "Android Enterprise app policy can support hardened software baselines.",
            ),
        ),
    ),
    SemanticConceptRule(
        "mdm_compliance",
        "MDM und Compliance",
        "MDM and compliance",
        (
            "mdm",
            "mobile device management",
            "geräteverwaltung",
            "geraeteverwaltung",
            "grundkonfiguration",
            "compliance",
            "compliant",
            "regelmäßige überprüfung",
            "regelmaessige ueberpruefung",
        ),
        (
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_COMPANION",
                ("pollInterval", "manageWingetDependencies"),
                "Windows companion policy is a candidate Relution management surface.",
            ),
            semantic_target(
                ("MACOS",),
                "relution-native",
                "MACOS_APP_COMPLIANCE",
                ("requiredApps",),
                "macOS app compliance is a candidate Relution compliance surface.",
            ),
            semantic_target(
                ("IOS",),
                "relution-native",
                "IOS_APP_COMPLIANCE",
                ("requiredApps", "disableAll", "whitelistedApps"),
                "iOS app compliance is a candidate Relution compliance surface.",
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                "ANDROID_ENTERPRISE_COMPLIANCE_ENFORCEMENT",
                ("configurationEnforcementRules",),
                (
                    "Android Enterprise compliance enforcement is a candidate Relution compliance "
                    "surface."
                ),
            ),
        ),
    ),
    SemanticConceptRule(
        "secure_boot_hardware",
        "Secure Boot und Hardware-Schutz",
        "Secure boot and hardware protection",
        (
            "secureboot",
            "secure boot",
            "tpm",
            "uefi",
            "firmware",
            "boot-schutz",
            "bootschutz",
            "bootvorgang",
            "startup security",
        ),
        (
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_BITLOCKER",
                ("tpmStartup", "tpmStartupPin", "minimumPinLength"),
                "Windows BitLocker policy covers TPM-backed startup constraints.",
            ),
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_CUSTOM_CSP",
                ("installSyncML",),
                (
                    "Relution Windows CSP evidence includes VSM, Secure Boot, and TPM-adjacent "
                    "baseline nodes."
                ),
            ),
            semantic_target(
                ("MACOS",),
                "relution-native",
                "MACOS_SYSTEM_POLICY_CONTROL",
                ("allowIdentifiedDevelopers", "enableAssessment"),
                "macOS system policy control is adjacent to startup and platform trust.",
            ),
            semantic_target(
                ("MACOS",),
                "apple-schema-profile",
                "profile:com.apple.preference.security",
                ("DisableFDEAutoLogin",),
                (
                    "Apple security preferences are a candidate surface for platform security "
                    "controls."
                ),
            ),
        ),
        ("KONF.3.2", "ASST.4.2"),
    ),
)
