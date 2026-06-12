"""Curated Android Enterprise analog rules for recommendation matching."""

from .mapping_types_and_constants import (
    ANDROID_ADVANCED_SECURITY,
    ANDROID_KEYGUARD,
    ANDROID_LOCATION,
    ANDROID_PLAY_STORE,
    ANDROID_RESTRICTION,
    AndroidAnalogRule,
)


ANDROID_ANALOG_RULES: tuple[AndroidAnalogRule, ...] = (
    AndroidAnalogRule(
        ANDROID_ADVANCED_SECURITY,
        (("developerSettings", "DEVELOPER_SETTINGS_DISABLED"),),
        (
            ("developer options", "developer mode", "entwicklermodus"),
            ("disabled", "deaktiviert", "deaktivieren"),
        ),
    ),
    AndroidAnalogRule(
        ANDROID_ADVANCED_SECURITY,
        (("untrustedAppsPolicy", "DISALLOW_INSTALL"),),
        (
            (
                "install unknown apps",
                "unknown sources",
                "unbekannte quellen",
                "untrusted apps",
            ),
            ("disabled", "block", "disallow", "deaktiviert"),
        ),
    ),
    AndroidAnalogRule(
        ANDROID_ADVANCED_SECURITY,
        (("googlePlayProtectVerifyApps", "VERIFY_APPS_ENFORCED"),),
        (
            ("scan device for security threats", "google play protect", "verify apps"),
            ("enabled", "enforced", "erzwingen"),
        ),
    ),
    AndroidAnalogRule(
        ANDROID_ADVANCED_SECURITY,
        (("googlePlayProtectVerifyApps", "VERIFY_APPS_ENFORCED"),),
        (("play protect", "verify apps"), ("turn on", "enabled", "enforced")),
    ),
    AndroidAnalogRule(
        "ANDROID_ENTERPRISE_DISABLE_CAMERAS",
        (("cameraDisabled", True),),
        (("camera", "kamera"), ("disabled", "deaktiviert", "block")),
        excluded=("microphone", "mikrofon"),
    ),
    AndroidAnalogRule(
        ANDROID_RESTRICTION,
        (("safeBootDisabled", True),),
        (("safe boot", "sicherer start"), ("disabled", "block", "deaktiviert")),
    ),
    AndroidAnalogRule(
        ANDROID_RESTRICTION,
        (("androidAutoDateAndTimeZoneSetting", "AUTO_DATE_AND_TIME_ZONE_ENFORCED"),),
        (
            (
                "network-provided time",
                "network provided time",
                "automatic date",
                "auto date",
                "automatische uhrzeit",
            ),
            ("enabled", "enforced", "aktiviert"),
        ),
    ),
    AndroidAnalogRule(
        ANDROID_PLAY_STORE,
        (("appAutoUpdatePolicy", "ALWAYS"),),
        (
            (
                "keep device apps up to date",
                "apps up to date",
                "app updates",
                "install app updates",
            ),
            ("update apps", "always", "immediately"),
        ),
    ),
    AndroidAnalogRule(
        ANDROID_LOCATION,
        (("locationMode", "LOCATION_ENFORCED"),),
        (("location is set to enabled", "location"), ("enabled", "enforced")),
        excluded=(
            "location history",
            "remotely locate",
            "find my device",
            "geofencing",
        ),
    ),
    AndroidAnalogRule(
        ANDROID_RESTRICTION,
        (("microphoneAccessPermission", "MICROPHONE_ACCESS_ENFORCED"),),
        (("microphone", "mikrofon"), ("enabled", "enforced", "aktiviert")),
    ),
    AndroidAnalogRule(
        ANDROID_KEYGUARD,
        (("keyguardDisabledFeatures", ["TRUST_AGENTS"]),),
        (("smart lock", "trust agent", "trust agents"), ("disabled", "deaktiviert")),
        constraints=(("keyguardDisabledFeatures", "containsAll", ["TRUST_AGENTS"]),),
    ),
    AndroidAnalogRule(
        ANDROID_KEYGUARD,
        (("keyguardDisabledFeatures", ["NOTIFICATIONS"]),),
        (
            ("lock screen", "sperrbildschirm"),
            ("notifications", "benachrichtigungen"),
            (
                "don t show notifications at all",
                "do not show notifications",
                "disabled",
            ),
        ),
        constraints=(("keyguardDisabledFeatures", "containsAll", ["NOTIFICATIONS"]),),
    ),
)

ANDROID_CANDIDATE_RULES: tuple[
    tuple[str, tuple[str, ...], tuple[tuple[str, ...], ...], str], ...
] = (
    (
        "ANDROID_ENTERPRISE_DEVICE_PASSCODE",
        ("quality", "minLength", "maxFailedPasswordsForWipe"),
        (
            (
                "geraetesperrcode",
                "gerätesperrcode",
                "zugriffsschutz",
                "passcode",
                "screen lock",
            ),
        ),
        (
            "Relution can enforce Android Enterprise passcode requirements, but the "
            "recommendation needs concrete complexity values before it is exact."
        ),
    ),
    (
        "ANDROID_ENTERPRISE_WORK_PROFILE_PASSCODE",
        ("quality", "minLength", "unifiedLockSettings"),
        (("work profile", "arbeitsumgebung", "arbeitsumgebungen", "container"),),
        (
            "Relution can enforce a separate Android work-profile challenge, but "
            "organization scope determines the exact value."
        ),
    ),
    (
        "ANDROID_ENTERPRISE_DEVICE_CONNECTIVITY",
        (
            "usbDataAccess",
            "configureWifi",
            "wifiDirectSettings",
            "tetheringSettings",
            "bluetoothSharing",
        ),
        (
            (
                "kommunikationsschnittstellen",
                "schnittstellen",
                "connectivity",
                "bluetooth",
                "wifi",
                "wlan",
                "usb",
                "tethering",
            ),
        ),
        (
            "Relution exposes Android Enterprise connectivity controls; disabling only "
            "unused interfaces remains organization-specific."
        ),
    ),
    (
        "ANDROID_ENTERPRISE_DEVICE_CONNECTIVITY",
        ("apnPolicy", "apnPolicy.overrideApns", "apnPolicy.apnSettings"),
        (("apn", "zugangspunkt", "mobilfunknetz"),),
        (
            "Relution can configure Android Enterprise APN policy, but APN values are "
            "organization-specific."
        ),
    ),
    (
        "ANDROID_ENTERPRISE_ALWAYS_ON_VPN",
        ("lockdownEnabled", "alwaysOnVpnApp.packageName"),
        (("vpn",),),
        (
            "Relution can enforce always-on VPN and lockdown behavior, but the VPN app and "
            "gateway values are organization-specific."
        ),
    ),
    (
        "ANDROID_ENTERPRISE_RECOMMENDED_GLOBAL_PROXY",
        ("proxyType", "host", "port", "pacUri"),
        (("proxy", "web filter", "webseiten", "reputationsdienst"),),
        (
            "Relution exposes a global proxy recommendation, but proxy hosts and bypass "
            "policy are organization-specific."
        ),
    ),
    (
        "ANDROID_ENTERPRISE_WIFI_MANAGEMENT",
        ("ssid", "securityType", "passphrase"),
        (("wifi", "wlan", "wi-fi"),),
        (
            "Relution can configure Android Enterprise Wi-Fi profiles, but SSID and "
            "credential values are organization-specific."
        ),
    ),
    (
        "ANDROID_ENTERPRISE_LOCK_SCREEN_MESSAGES",
        (
            "deviceOwnerLockScreenInfo.defaultMessage",
            "shortSupportMessage.defaultMessage",
            "longSupportMessage.defaultMessage",
        ),
        (("lock screen message", "if lost return", "support message"),),
        (
            "Relution can configure Android Enterprise lock-screen/support messages, but "
            "the visible message text is organization-specific."
        ),
    ),
    (
        "ANDROID_ENTERPRISE_SYSTEM_CLOCK_MANAGEMENT",
        ("autoTimeRequired",),
        (
            (
                "time service",
                "network-provided time",
                "automatic date",
                "auto date",
                "automatische uhrzeit",
            ),
        ),
        (
            "Relution can require Android Enterprise automatic time, but timezone and "
            "exception policy remain organization-specific."
        ),
    ),
    (
        "ANDROID_ENTERPRISE_PLAY_STORE_MANAGEMENT",
        ("restrictedPlayStoreMode", "appAutoUpdatePolicy"),
        (
            (
                "app installation",
                "installation von apps",
                "allowlist",
                "freigegebene apps",
                "apps",
            ),
        ),
        (
            "Relution can restrict managed Play and app updates, but app allowlists are "
            "organization-specific."
        ),
    ),
    (
        "ANDROID_ENTERPRISE_PERMISSION_MANAGEMENT",
        ("defaultPermissionPolicy", "wellKnownPermissions", "customPermissions"),
        (("permission", "permissions", "berechtigungen", "datenschutz"),),
        (
            "Relution can set Android Enterprise permission policy, but per-app permissions "
            "are organization-specific."
        ),
    ),
    (
        "ANDROID_ENTERPRISE_ADVANCED_SECURITY_OVERRIDES",
        ("googlePlayProtectVerifyApps",),
        (
            (
                "schadprogramme",
                "schadprogrammen",
                "malware",
                "play protect",
                "security threats",
            ),
        ),
        "Relution can enforce Google Play Protect verification for Android Enterprise devices.",
    ),
    (
        "ANDROID_ENTERPRISE_COMPLIANCE_ENFORCEMENT",
        ("configurationEnforcementRules",),
        (("compliance", "manipulation", "regelungen", "policy violation"),),
        (
            "Relution exposes compliance enforcement rules, but concrete actions and "
            "thresholds are organization-specific."
        ),
    ),
    (
        "ANDROID_ENTERPRISE_CERTIFICATE",
        ("certificate", "certificateTemplate", "certificateUsage"),
        (("certificate", "certificates", "zertifikat", "zertifikate"),),
        (
            "Relution can distribute Android Enterprise certificates, but certificate "
            "material and trust choices are organization-specific."
        ),
    ),
    (
        "ANDROID_ENTERPRISE_PERSONAL_USAGE",
        (
            "cameraDisabled",
            "screenCaptureDisabled",
            "personalPlayStoreMode",
            "allowBluetoothSharing",
        ),
        (
            (
                "personal",
                "private",
                "privat",
                "screen capture",
                "screensharing",
                "casting",
            ),
        ),
        (
            "Relution exposes personal-usage controls for company-owned work-profile "
            "devices, but policy scope is organization-specific."
        ),
    ),
    (
        "ANDROID_ENTERPRISE_SYSTEM_UPDATE",
        ("systemUpdateType", "startMinutes", "endMinutes", "freezePeriods"),
        (("system update", "betriebssystem", "updates", "aktualisierung"),),
        (
            "Relution can manage Android Enterprise system-update policy, but cadence and "
            "maintenance windows are organization-specific."
        ),
    ),
)
