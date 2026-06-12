"""Semantic concept rules for certificates, apps, and account controls."""

from .mapping_types_and_constants import (
    ANDROID_ADVANCED_SECURITY,
    ANDROID_PLAY_STORE,
    ANDROID_RESTRICTION,
    APPLE_APPLICATION_ACCESS,
    SemanticConceptRule,
    semantic_target,
)


SEMANTIC_CONCEPT_RULES_PART_2: tuple[SemanticConceptRule, ...] = (
    SemanticConceptRule(
        "certificates",
        "Zertifikate und Schlüssel",
        "Certificates and keys",
        (
            "zertifikat",
            "zertifikate",
            "certificate",
            "certificates",
            "wurzelzertifikat",
            "root certificate",
            "schlüssel",
            "schluessel",
            "keychain",
            "scep",
            "trust",
        ),
        (
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_CERTIFICATE",
                ("certificate", "certificateTemplateForIdentityCertificate", "store"),
                "Windows certificate payloads can distribute trust and identity material.",
            ),
            semantic_target(
                ("MACOS",),
                "apple-schema-profile",
                "profile:com.apple.security.root",
                ("PayloadContent",),
                "Apple certificate payloads can distribute trusted certificates.",
            ),
            semantic_target(
                ("MACOS",),
                "apple-schema-profile",
                "profile:com.apple.security.scep",
                ("URL", "Subject"),
                "Apple SCEP payloads can request managed certificates.",
            ),
            semantic_target(
                ("IOS",),
                "relution-native",
                "IOS_CERTIFICATE",
                ("identityCertificateInfo",),
                "iOS certificate payloads can distribute trust and identity material.",
            ),
            semantic_target(
                ("IOS",),
                "relution-native",
                "IOS_SCEP",
                ("url", "subject", "keysize"),
                "iOS SCEP payloads can request managed certificates.",
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                "ANDROID_ENTERPRISE_CERTIFICATE",
                ("certificate", "certificateTemplate", "certificateUsage"),
                "Android Enterprise certificate policy can distribute trust and identity material.",
            ),
        ),
        ("BER.7.10", "BER.7.14", "DEV.7.2"),
    ),
    SemanticConceptRule(
        "app_allowlist",
        "App-Allowlist und Ausführungskontrolle",
        "App allowlist and execution control",
        (
            "allowlist",
            "whitelist",
            "app-installation",
            "installation von apps",
            "app allow",
            "app block",
            "app control",
            "app installer",
            "ms-appinstaller",
            "active x",
            "activex",
            "vbscript",
            "scriptlets",
            "xaml",
            "mark of the web",
            "ausführungskontrolle",
            "ausfuehrungskontrolle",
            "skripte",
            "scripts",
            "powershell",
            "erlaubte programme",
        ),
        (
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_APP_COMPLIANCE",
                ("requiredApps",),
                "Windows app compliance can require managed applications.",
            ),
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_APP_CONTROL",
                ("appControlId", "fileBaseInfo"),
                "Windows App Control is relevant to execution-control requirements.",
            ),
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_CUSTOM_CSP",
                ("installSyncML",),
                (
                    "Relution Windows CSP evidence includes PowerShell and application-control "
                    "policy nodes."
                ),
            ),
            semantic_target(
                ("MACOS",),
                "relution-native",
                "MACOS_APP_COMPLIANCE",
                ("requiredApps",),
                "macOS app compliance can require managed applications.",
            ),
            semantic_target(
                ("MACOS",),
                "apple-schema-profile",
                "profile:com.apple.applicationaccess.new",
                ("familyControlsEnabled", "pathBlackList", "pathWhiteList"),
                "Apple application restrictions can represent app allow/deny decisions.",
            ),
            semantic_target(
                ("IOS",),
                "relution-native",
                "IOS_APP_COMPLIANCE",
                ("requiredApps", "whitelistedApps", "isBlacklist"),
                "iOS app compliance can require or restrict managed apps.",
            ),
            semantic_target(
                ("IOS",),
                "relution-native",
                "IOS_MANAGED_APP",
                ("bundleId", "content"),
                "iOS managed app configuration can scope app policy.",
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                ANDROID_PLAY_STORE,
                ("restrictedPlayStoreMode", "appAutoUpdatePolicy"),
                "Managed Play can restrict app availability and update policy.",
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                "ANDROID_ENTERPRISE_APP_POLICY",
                ("applications",),
                "Android Enterprise app policy can configure managed application scope.",
            ),
        ),
        ("KONF.6.1", "KONF.6.4", "BER.5.1"),
    ),
    SemanticConceptRule(
        "permissions_privacy",
        "Berechtigungen und Datenschutz",
        "Permissions and privacy",
        (
            "berechtigung",
            "berechtigungen",
            "permission",
            "permissions",
            "datenschutz",
            "privacy",
            "privileg",
            "zugriffsrecht",
            "zugriffsrechte",
            "tcc",
        ),
        (
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_RESTRICTION",
                ("allowPrivacy", "allowPrivacyExperience", "allowSyncMySettings"),
                "Windows restrictions expose privacy-related toggles.",
            ),
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_LOCAL_DEVICE_SECURITY",
                ("allowLocalAdminAccounts", "allowGuestAccounts"),
                "Windows local security policy can restrict local account privileges.",
            ),
            semantic_target(
                ("MACOS",),
                "apple-mobileconfig",
                "com.apple.TCC.configuration-profile-policy",
                ("service", "authorization"),
                "Apple PPPC profiles can govern macOS privacy permissions.",
            ),
            semantic_target(
                ("MACOS",),
                "relution-native",
                "MACOS_RESTRICTION",
                ("allowCamera", "allowCloudDocumentSync"),
                "macOS restrictions expose privacy-relevant toggles.",
            ),
            semantic_target(
                ("IOS",),
                "relution-native",
                "IOS_RESTRICTION",
                (
                    "allowCloudPrivateRelay",
                    "allowFindMyFriendsModification",
                    "allowCamera",
                ),
                "iOS restrictions expose privacy-relevant toggles.",
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                "ANDROID_ENTERPRISE_PERMISSION_MANAGEMENT",
                (
                    "defaultPermissionPolicy",
                    "wellKnownPermissions",
                    "customPermissions",
                ),
                "Android Enterprise permission policy can manage app permissions.",
            ),
        ),
        ("KONF.6.1", "KONF.6.4", "BER.5.1"),
    ),
    SemanticConceptRule(
        "cloud_sync",
        "Cloud- und Synchronisationsfunktionen",
        "Cloud and sync functions",
        (
            "cloud",
            "icloud",
            "online-funktionen",
            "online funktionen",
            "synchronisation",
            "synchronisierung",
            "sync",
            "handoff",
            "continuity",
            "onedrive",
            "microsoft cloud",
        ),
        (
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_RESTRICTION",
                (
                    "allowSyncMySettings",
                    "allowAddingForeignAccountsManually",
                    "allowAccounts",
                ),
                "Windows restrictions can reduce Microsoft account and sync surfaces.",
            ),
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_CUSTOM_CSP",
                ("installSyncML",),
                "Relution Windows CSP evidence includes Microsoft cloud and sync-related policies.",
            ),
            semantic_target(
                ("MACOS",),
                "relution-native",
                "MACOS_RESTRICTION",
                (
                    "allowCloudDocumentSync",
                    "allowCloudKeychainSync",
                    "allowCloudPhotoLibrary",
                ),
                "macOS restrictions can disable iCloud sync surfaces.",
            ),
            semantic_target(
                ("MACOS",),
                "apple-schema-profile",
                APPLE_APPLICATION_ACCESS,
                (
                    "allowCloudDocumentSync",
                    "allowCloudPhotoLibrary",
                    "allowCloudDesktopAndDocuments",
                ),
                "Apple restrictions schema covers iCloud sync controls.",
            ),
            semantic_target(
                ("IOS",),
                "relution-native",
                "IOS_RESTRICTION",
                (
                    "allowCloudBackup",
                    "allowCloudDocumentSync",
                    "allowCloudKeychainSync",
                    "allowCloudPhotoLibrary",
                ),
                "iOS restrictions can disable iCloud sync surfaces.",
            ),
            semantic_target(
                ("IOS", "MACOS"),
                "apple-schema-profile",
                APPLE_APPLICATION_ACCESS,
                ("allowCloudPhotoLibrary", "allowActivityContinuation"),
                "Apple restrictions schema covers iCloud and Continuity controls.",
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                "ANDROID_ENTERPRISE_PERSONAL_USAGE",
                ("accountTypesWithManagementDisabled", "personalPlayStoreMode"),
                (
                    "Android Enterprise personal-usage controls can reduce personal cloud account "
                    "surfaces."
                ),
            ),
        ),
        ("ASST.3.10", "KONF.11.8"),
    ),
    SemanticConceptRule(
        "telemetry",
        "Telemetrie und Diagnosedaten",
        "Telemetry and diagnostics",
        (
            "telemetrie",
            "telemetry",
            "diagnose",
            "diagnostic",
            "analytics",
            "connected user experience",
            "cuet",
            "usage data",
            "feedback notifications",
            "online tips",
            "search highlights",
            "news and interests",
            "suggested apps",
            "consumer experiences",
            "personalized recommendations",
        ),
        (
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_RESTRICTION",
                ("allowPrivacy", "allowPrivacyExperience"),
                "Windows restrictions expose privacy and telemetry-adjacent controls.",
            ),
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_CUSTOM_CSP",
                ("installSyncML",),
                "Relution Windows CSP evidence includes telemetry and diagnostic policy nodes.",
            ),
            semantic_target(
                ("MACOS", "IOS"),
                "apple-schema-profile",
                APPLE_APPLICATION_ACCESS,
                ("allowDiagnosticSubmission",),
                "Apple restrictions schema covers diagnostic submission.",
            ),
            semantic_target(
                ("MACOS",),
                "relution-native",
                "MACOS_RESTRICTION",
                ("allowAppleIntelligenceReport",),
                "macOS restrictions expose diagnostic and report-related toggles.",
            ),
            semantic_target(
                ("IOS",),
                "relution-native",
                "IOS_RESTRICTION",
                ("allowAppleIntelligenceReport",),
                "iOS restrictions expose diagnostic and report-related toggles.",
            ),
        ),
        ("DET.3.4", "DET.4.4"),
    ),
    SemanticConceptRule(
        "lock_screen_message",
        "Sperrbildschirm- und Anmeldemeldungen",
        "Lock-screen and login messages",
        (
            "lock screen message",
            "if lost return",
            "if lost return to",
            "lost return",
            "consent message",
            "login message",
            "logon message",
            "device owner lock screen",
            "support message",
            "sperrbildschirmmeldung",
            "anmeldemeldung",
            "hinweis auf dem sperrbildschirm",
        ),
        (
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_LOCAL_DEVICE_SECURITY",
                ("loginMessageTitle", "loginMessageText"),
                (
                    "Windows local security policy can publish a logon message once organization "
                    "text is supplied."
                ),
            ),
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_WALLPAPER",
                ("lockScreenText",),
                (
                    "Windows wallpaper policy can publish lock-screen text where that surface is "
                    "preferred."
                ),
            ),
            semantic_target(
                ("MACOS",),
                "relution-native",
                "MACOS_LOGIN_WINDOW",
                ("loginWindow.loginWindowText",),
                (
                    "macOS Login Window can publish a login message once organization text is "
                    "supplied."
                ),
            ),
            semantic_target(
                ("MACOS",),
                "relution-native",
                "MACOS_SECURITY_PREFERENCES",
                ("dontAllowLockMessageUI",),
                (
                    "macOS security preferences can protect lock-message modification, but not "
                    "supply the message text by itself."
                ),
            ),
            semantic_target(
                ("IOS",),
                "relution-native",
                "IOS_SHARED_DEVICE",
                ("lockScreenFootnote",),
                (
                    "iOS shared-device settings can display a lock-screen footnote once "
                    "organization text is supplied."
                ),
            ),
            semantic_target(
                ("IOS",),
                "apple-mobileconfig",
                "com.apple.shareddeviceconfiguration",
                ("ifLostReturnToMessage", "lockScreenFootnote"),
                (
                    "Relution can import shared-device lock-screen message payloads; exact text is "
                    "organization-specific."
                ),
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                "ANDROID_ENTERPRISE_LOCK_SCREEN_MESSAGES",
                (
                    "deviceOwnerLockScreenInfo.defaultMessage",
                    "shortSupportMessage.defaultMessage",
                    "longSupportMessage.defaultMessage",
                ),
                (
                    "Android Enterprise lock-screen messages can display owner and support text "
                    "once local wording is supplied."
                ),
            ),
        ),
        ("KONF.3.6", "ASST.6.1"),
    ),
    SemanticConceptRule(
        "time_sync",
        "Zeit- und Zeitsynchronisation",
        "Time and time synchronization",
        (
            "time service",
            "automatic date",
            "date and time automatically",
            "network-provided time",
            "auto date",
            "ntp",
            "zeitquelle",
            "zeitquellen",
            "zeitsynchronisation",
            "automatische uhrzeit",
            "datum und uhrzeit",
        ),
        (
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_RESTRICTION",
                ("allowTimeAndLanguage", "allowDateTime"),
                "Windows restrictions can limit user changes to time and language settings.",
            ),
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_CUSTOM_CSP",
                ("installSyncML",),
                "Relution Windows CSP evidence can carry Windows time-service policy nodes.",
            ),
            semantic_target(
                ("IOS", "MACOS"),
                "relution-native",
                "APPLE_TIME_ZONE",
                ("timeZone",),
                "Apple Time Zone can configure a managed time zone when local policy requires it.",
            ),
            semantic_target(
                ("IOS",),
                "relution-native",
                "IOS_RESTRICTION",
                ("forceAutomaticDateAndTime",),
                "iOS restrictions can force automatic date and time.",
            ),
            semantic_target(
                ("IOS", "MACOS"),
                "apple-schema-profile",
                APPLE_APPLICATION_ACCESS,
                ("forceAutomaticDateAndTime",),
                "Apple restrictions schema can force automatic date and time where supported.",
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                "ANDROID_ENTERPRISE_SYSTEM_CLOCK_MANAGEMENT",
                ("autoTimeRequired",),
                "Android Enterprise system clock management can require automatic time.",
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                ANDROID_RESTRICTION,
                ("androidAutoDateAndTimeZoneSetting", "autoTimeRequired"),
                "Android Enterprise restrictions can enforce automatic date/time behavior.",
            ),
        ),
        ("KONF.4.5",),
    ),
    SemanticConceptRule(
        "exploit_mitigation",
        "Exploit-Mitigation und Laufzeitschutz",
        "Exploit mitigation and runtime protection",
        (
            "ausnutzung von schwachstellen",
            "exploit",
            "exploit protection",
            "aslr",
            "dep",
            "nx",
            "sehop",
            "structured exception handling",
            "heap",
            "kernel",
            "runtime protection",
            "memory protection",
            "schutzmechanismen",
        ),
        (
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_CUSTOM_CSP",
                ("installSyncML",),
                (
                    "Relution Windows CSP evidence can carry Exploit Protection, SEHOP, Defender, "
                    "and runtime-hardening policy nodes."
                ),
            ),
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_ANTIVIRUS",
                ("enableNetworkProtection", "allowIOAVProtection", "puaProtection"),
                (
                    "Windows Antivirus settings are adjacent to exploit and runtime protection "
                    "when Defender controls are involved."
                ),
            ),
            semantic_target(
                ("MACOS",),
                "relution-native",
                "MACOS_SYSTEM_POLICY_CONTROL",
                ("enableAssessment", "allowIdentifiedDevelopers"),
                "macOS system policy controls support platform runtime trust decisions.",
            ),
            semantic_target(
                ("MACOS",),
                "relution-native",
                "MACOS_SECURITY_PREFERENCES",
                ("dontAllowPasswordResetUI", "dontAllowFireWallUI"),
                (
                    "macOS security preferences can protect selected security-control surfaces but "
                    "do not model ASLR/DEP directly."
                ),
            ),
            semantic_target(
                ("IOS",),
                "relution-native",
                "IOS_RESTRICTION",
                ("allowEnterpriseAppTrust", "allowUIConfigurationProfileInstallation"),
                (
                    "iOS restrictions can reduce unmanaged trust surfaces, but exploit mitigations "
                    "are mainly OS built-ins."
                ),
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                ANDROID_ADVANCED_SECURITY,
                ("developerSettings", "commonCriteriaMode", "untrustedAppsPolicy"),
                (
                    "Android Enterprise advanced security can reduce exploit-enabling surfaces "
                    "such as developer mode and untrusted app installation."
                ),
            ),
        ),
        ("KONF.7.6", "KONF.7.9", "KONF.7.10"),
    ),
    SemanticConceptRule(
        "device_attestation_posture",
        "Geräteintegrität und Attestation",
        "Device integrity and attestation",
        (
            "hardware-backed key attestation",
            "hbka",
            "security posture",
            "bootloader",
            "locked bootloader",
            "unknown os",
            "advanced protection",
            "high-risk users",
            "high risk users",
            "system integrity protection",
            "sip",
            "signed system volume",
            "ssv",
            "platform integrity",
            "device integrity",
            "attestation",
        ),
        (
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_BITLOCKER",
                ("requireDeviceEncryption", "tpmStartup"),
                (
                    "Windows BitLocker and TPM-backed startup settings are relevant "
                    "device-integrity surfaces."
                ),
            ),
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_CUSTOM_CSP",
                ("installSyncML",),
                (
                    "Relution Windows CSP evidence can carry Secure Boot, TPM, and "
                    "virtualization-based security posture nodes."
                ),
            ),
            semantic_target(
                ("MACOS",),
                "relution-native",
                "MACOS_SYSTEM_POLICY_CONTROL",
                ("enableAssessment", "allowIdentifiedDevelopers"),
                "macOS system policy control is adjacent to platform integrity checks.",
            ),
            semantic_target(
                ("MACOS",),
                "relution-native",
                "MACOS_LOGIN_WINDOW",
                ("loginWindow.disableFDEAutoLogin",),
                (
                    "macOS login-window controls can support secure startup behavior but do not "
                    "expose SIP/SSV toggles directly."
                ),
            ),
            semantic_target(
                ("IOS",),
                "relution-native",
                "IOS_RESTRICTION",
                ("allowUIConfigurationProfileInstallation",),
                (
                    "iOS restrictions can reduce unmanaged profile changes, while attestation "
                    "remains an MDM/device-state concern."
                ),
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                ANDROID_ADVANCED_SECURITY,
                ("commonCriteriaMode", "developerSettings", "untrustedAppsPolicy"),
                (
                    "Android Enterprise advanced security settings are relevant to posture, "
                    "bootloader, and high-risk user hardening."
                ),
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                "ANDROID_ENTERPRISE_COMPLIANCE_ENFORCEMENT",
                ("configurationEnforcementRules",),
                (
                    "Android Enterprise compliance enforcement can react to posture or integrity "
                    "failures once local rules are defined."
                ),
            ),
        ),
        ("ASST.4.2", "DET.5.10"),
    ),
)
