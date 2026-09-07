"""Semantic concept rules for certificates, apps, and account controls."""

from ._semantic_matching_metadata import ANDROID_ADVANCED_SECURITY
from ._semantic_matching_metadata import ANDROID_RESTRICTION
from ._apple_analog_constants import APPLE_APPLICATION_ACCESS
from ._mapping_models import SemanticConceptRule
from ._mapping_models import semantic_target


SEMANTIC_CONCEPT_RULES_ENDPOINT_HARDENING: tuple[SemanticConceptRule, ...] = (
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
