"""Semantic concept rules for authentication, updates, and network controls."""

from ._semantic_matching_metadata import ANDROID_ADVANCED_SECURITY
from ._semantic_matching_metadata import ANDROID_PLAY_STORE
from ._semantic_matching_metadata import ANDROID_SYSTEM_UPDATE
from ._apple_analog_constants import APPLE_PASSCODE
from ._apple_analog_constants import APPLE_SOFTWARE_UPDATE
from ._mapping_models import SemanticConceptRule
from ._mapping_models import semantic_target


SEMANTIC_CONCEPT_RULES_IDENTITY_AND_ENCRYPTION: tuple[SemanticConceptRule, ...] = (
    SemanticConceptRule(
        "passcode_authentication",
        "Authentisierung und Passcode",
        "Authentication and passcode",
        (
            "authentisierung",
            "anmeldung",
            "passwort",
            "kennwort",
            "passcode",
            "geraetecode",
            "gerätecode",
            "bildschirmsperre",
            "screen lock",
            "device lock",
            "password",
        ),
        (
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_PASSCODE",
                ("minLength", "quality", "history", "maxInactivityTime"),
                "Windows passcode policy can enforce concrete local sign-in values.",
            ),
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_HELLO",
                ("minimumPinLength", "allowBiometricAuthentication", "useTpm"),
                "Windows Hello covers PIN, biometric, and TPM-backed sign-in controls.",
            ),
            semantic_target(
                ("MACOS",),
                "relution-native",
                "MACOS_SCREENSAVER",
                ("askForPassword", "askForPasswordDelay", "loginWindowIdleTime"),
                "macOS screen saver policy can require re-authentication after idle.",
            ),
            semantic_target(
                ("IOS",),
                "relution-native",
                "IOS_PASSCODE",
                ("forcePIN", "minLength", "maxInactivityMinutes", "maxFailedAttempts"),
                "iOS passcode policy can enforce concrete device-code values.",
            ),
            semantic_target(
                ("IOS", "MACOS"),
                "apple-schema-profile",
                APPLE_PASSCODE,
                ("minLength", "maxInactivity", "maxFailedAttempts"),
                "Apple passcode schema covers passcode and auto-lock constraints.",
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                "ANDROID_ENTERPRISE_DEVICE_PASSCODE",
                ("quality", "minLength", "maxFailedPasswordsForWipe"),
                "Android Enterprise passcode policy can enforce concrete device-code values.",
            ),
        ),
        ("BER.6.8", "BER.6.7", "BER.3.9", "BER.3.11"),
    ),
    SemanticConceptRule(
        "mfa",
        "Mehr-Faktor-Authentisierung",
        "Multi-factor authentication",
        (
            "mehr-faktor",
            "mehr faktor",
            "mfa",
            "multi factor",
            "two-factor",
            "2fa",
            "chipkarte",
            "smart card",
            "token",
        ),
        (
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_HELLO",
                (
                    "useTpm",
                    "allowBiometricAuthentication",
                    "certificateForOnPremiseResources",
                ),
                "Windows Hello can participate in stronger local authentication.",
            ),
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_CERTIFICATE",
                ("certificate", "certificateTemplateForIdentityCertificate"),
                "Windows certificate payloads can support certificate-backed authentication.",
            ),
            semantic_target(
                ("MACOS",),
                "apple-mobileconfig",
                "com.apple.security.smartcard",
                ("enforceSmartCard", "allowSmartCard"),
                (
                    "Apple smart card payloads are relevant when the local policy requires smart "
                    "cards."
                ),
            ),
            semantic_target(
                ("IOS", "MACOS"),
                "relution-native",
                "IOS_CERTIFICATE",
                ("identityCertificateInfo",),
                "Apple certificate distribution can support certificate-backed authentication.",
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                "ANDROID_ENTERPRISE_CERTIFICATE",
                ("certificate", "certificateTemplate", "certificateUsage"),
                "Android Enterprise certificates can support certificate-backed authentication.",
            ),
        ),
        ("BER.7.10", "BER.7.14"),
    ),
    SemanticConceptRule(
        "lock_idle",
        "Sperre und Inaktivität",
        "Lock and idle timeout",
        (
            "inaktivität",
            "inaktivitaet",
            "idle",
            "sperrbildschirm",
            "bildschirmsperre",
            "auto lock",
            "autolock",
            "timeout",
        ),
        (
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_LOCAL_DEVICE_SECURITY",
                (
                    "inactivityTimeUntilScreenSaver",
                    "userInformationOnLockScreenConfiguration",
                ),
                "Windows local security policy covers lock-screen and idle behavior.",
            ),
            semantic_target(
                ("MACOS",),
                "relution-native",
                "MACOS_SCREENSAVER",
                ("askForPassword", "askForPasswordDelay", "loginWindowIdleTime"),
                "macOS screen saver settings can enforce idle lock behavior.",
            ),
            semantic_target(
                ("IOS",),
                "relution-native",
                "IOS_PASSCODE",
                ("maxInactivityMinutes", "maxGracePeriodMinutes"),
                "iOS passcode policy covers auto-lock and grace-period values.",
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                "ANDROID_ENTERPRISE_DISPLAY",
                ("screenTimeoutMode", "screenTimeout"),
                "Android Enterprise display policy covers concrete timeout values.",
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                "ANDROID_ENTERPRISE_KEYGUARD_FEATURE_MANAGEMENT",
                ("keyguardDisabledFeatures",),
                "Android Enterprise keyguard policy can restrict lock-screen surfaces.",
            ),
        ),
        ("BER.6.8", "BER.3.11"),
    ),
    SemanticConceptRule(
        "encryption",
        "Verschlüsselung",
        "Encryption",
        (
            "verschlüssel",
            "verschluessel",
            "encryption",
            "filevault",
            "bitlocker",
            "efs",
            "encrypting file system",
            "kryptografisch",
        ),
        (
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_BITLOCKER",
                (
                    "encryptionTypeForOsDrives",
                    "fixedDrivesEncryptionType",
                    "removableDrivesEncryptionType",
                ),
                "Windows BitLocker policy covers drive encryption values.",
            ),
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_CUSTOM_CSP",
                ("installSyncML",),
                (
                    "Relution Windows CSP evidence includes BitLocker and encryption-related "
                    "policy nodes."
                ),
            ),
            semantic_target(
                ("MACOS",),
                "relution-native",
                "MACOS_FILE_VAULT",
                ("fdeFileVault",),
                "macOS FileVault policy covers disk encryption enforcement.",
            ),
            semantic_target(
                ("MACOS",),
                "apple-schema-profile",
                "profile:com.apple.MCX.FileVault2",
                ("Enable", "Defer"),
                "Apple FileVault schema can express FileVault deployment settings.",
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                ANDROID_ADVANCED_SECURITY,
                ("encryptionPolicy",),
                "Android Enterprise advanced security can require encryption.",
            ),
        ),
        ("KONF.3.2", "ASST.4.2"),
    ),
    SemanticConceptRule(
        "updates",
        "Updates und Patches",
        "Updates and patching",
        (
            "update",
            "updates",
            "autoupdate",
            "patch",
            "patches",
            "aktualisierung",
            "aktualisierungen",
            "softwareupdate",
        ),
        (
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_UPDATE",
                (
                    "autoUpdateType",
                    "deadlineForFeatureUpdates",
                    "deadlineForQualityUpdates",
                ),
                "Windows Update policy can enforce update behavior once local cadence is known.",
            ),
            semantic_target(
                ("MACOS",),
                "relution-native",
                "MACOS_UPDATE",
                ("automaticCheckEnabled", "automaticDownload", "criticalUpdateInstall"),
                "macOS update policy can enforce update behavior once local cadence is known.",
            ),
            semantic_target(
                ("MACOS",),
                "apple-schema-profile",
                APPLE_SOFTWARE_UPDATE,
                ("AutomaticCheckEnabled", "CriticalUpdateInstall"),
                "Apple Software Update schema covers update enforcement settings.",
            ),
            semantic_target(
                ("IOS",),
                "relution-native",
                "IOS_UPDATE",
                ("updateMode", "updateDays", "updateTime", "targetOSVersionLimit"),
                "iOS update policy can manage update scheduling and target versions.",
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                ANDROID_SYSTEM_UPDATE,
                ("systemUpdateType", "startMinutes", "endMinutes", "freezePeriods"),
                "Android Enterprise system update policy covers cadence and maintenance windows.",
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                ANDROID_PLAY_STORE,
                ("appAutoUpdatePolicy",),
                "Managed Play settings can enforce app update behavior.",
            ),
        ),
        ("KONF.8.2", "DET.5.10"),
    ),
)
