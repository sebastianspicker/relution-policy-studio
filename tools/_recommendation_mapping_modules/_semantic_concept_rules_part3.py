"""Semantic concept rules for privacy, connectivity, and diagnostics controls."""

from .mapping_types_and_constants import (
    ANDROID_LOCATION,
    APPLE_APPLICATION_ACCESS,
    SemanticConceptRule,
    semantic_target,
)


SEMANTIC_CONCEPT_RULES_PART_3: tuple[SemanticConceptRule, ...] = (
    SemanticConceptRule(
        "camera_microphone",
        "Kamera und Mikrofon",
        "Camera and microphone",
        (
            "kamera",
            "camera",
            "mikrofon",
            "microphone",
            "sprachassistent",
            "siri",
            "cortana",
            "assistant",
        ),
        (
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_RESTRICTION",
                ("allowCamera", "allowCortana"),
                (
                    "Windows restrictions can disable camera and assistant surfaces; microphone "
                    "needs separate local validation."
                ),
            ),
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_CUSTOM_CSP",
                ("installSyncML",),
                (
                    "Relution Windows CSP evidence includes lock-screen camera and "
                    "assistant-related policies."
                ),
            ),
            semantic_target(
                ("MACOS",),
                "relution-native",
                "MACOS_RESTRICTION",
                ("allowCamera",),
                (
                    "macOS restrictions can disable camera; microphone requires PPPC or local "
                    "policy scope."
                ),
            ),
            semantic_target(
                ("MACOS",),
                "apple-mobileconfig",
                "com.apple.TCC.configuration-profile-policy",
                ("service", "authorization"),
                "Apple PPPC can govern microphone/camera permissions for specific apps.",
            ),
            semantic_target(
                ("IOS",),
                "relution-native",
                "IOS_RESTRICTION",
                ("allowCamera", "allowAssistant", "allowAssistantWhileLocked"),
                "iOS restrictions can disable camera and assistant surfaces.",
            ),
            semantic_target(
                ("IOS", "MACOS"),
                "apple-schema-profile",
                APPLE_APPLICATION_ACCESS,
                ("allowCamera", "allowAssistant", "allowAssistantWhileLocked"),
                "Apple restrictions schema includes camera and assistant controls.",
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                "ANDROID_ENTERPRISE_DISABLE_CAMERAS",
                ("cameraDisabled",),
                (
                    "Android Enterprise can disable cameras; microphone access is a separate "
                    "permission-management decision."
                ),
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                "ANDROID_ENTERPRISE_SYSTEM_AUDIO_MANAGEMENT",
                ("unmuteMicrophoneDisabled",),
                "Android Enterprise system audio management can affect microphone state.",
            ),
        ),
        ("KONF.3.7", "SENS.7.18"),
    ),
    SemanticConceptRule(
        "location",
        "Standort und Ortung",
        "Location",
        (
            "standort",
            "ortung",
            "location service",
            "location services",
            "location sharing",
            "location is set to enabled",
            "find my",
            "geofencing",
            "gps",
        ),
        (
            semantic_target(
                ("IOS",),
                "relution-native",
                "IOS_RESTRICTION",
                ("allowFindMyFriendsModification",),
                "iOS restrictions can limit Find My modification surfaces.",
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                ANDROID_LOCATION,
                ("locationMode",),
                "Android Enterprise location sharing management covers location state.",
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                "ANDROID_ENTERPRISE_PERSONAL_USAGE",
                ("personalPlayStoreMode",),
                "Personal-usage controls can scope personal location-related services.",
            ),
        ),
        ("SENS.7.18",),
    ),
    SemanticConceptRule(
        "security_critical_functions",
        "Sicherheitskritische Funktionen",
        "Security-critical functions",
        (
            "sicherheitskritische funktionen",
            "security-critical functions",
            "ortungsdienste",
            "automatisch geoeffnet",
            "automatisch geöffnet",
            "automatisch ausgefuehrt",
            "automatisch ausgeführt",
            "remote apple events",
            "screen sharing",
            "bildschirmfreigabe",
        ),
        (
            semantic_target(
                ("MACOS",),
                "relution-native",
                "MACOS_RESTRICTION",
                (
                    "allowRemoteScreenObservation",
                    "allowARDRemoteManagementModification",
                    "allowRemoteAppleEventsModification",
                ),
                (
                    "macOS restrictions can disable selected security-critical remote-observation "
                    "and remote-control surfaces."
                ),
            ),
            semantic_target(
                ("MACOS",),
                "relution-native",
                "MACOS_SECURITY_PREFERENCES",
                ("dontAllowFireWallUI", "dontAllowLockMessageUI"),
                "macOS security preferences can protect user-facing security controls.",
            ),
            semantic_target(
                ("MACOS",),
                "relution-native",
                "MACOS_SYSTEM_POLICY_CONTROL",
                ("allowIdentifiedDevelopers", "enableAssessment"),
                (
                    "macOS system policy control supports platform trust and execution-control "
                    "decisions."
                ),
            ),
        ),
    ),
    SemanticConceptRule(
        "remote_lock_wipe",
        "Fernlöschung und Sperre",
        "Remote lock and wipe",
        (
            "fernlöschung",
            "fernloeschung",
            "remote wipe",
            "remote lock",
            "außerbetriebnahme",
            "ausserbetriebnahme",
            "verlust",
            "abhandenkommen",
            "erase content",
        ),
        (
            semantic_target(
                ("IOS",),
                "apple-schema-profile",
                APPLE_APPLICATION_ACCESS,
                ("allowEraseContentAndSettings",),
                (
                    "Apple restrictions schema can restrict local erase actions; remote wipe "
                    "remains an MDM operation."
                ),
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                "ANDROID_ENTERPRISE_COMPLIANCE_ENFORCEMENT",
                ("configurationEnforcementRules",),
                (
                    "Android Enterprise compliance enforcement can trigger actions after policy "
                    "violations."
                ),
            ),
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_COMPANION",
                ("actionTimeout", "pollInterval"),
                (
                    "Windows companion behavior is adjacent to remote management timing, not exact "
                    "wipe semantics."
                ),
            ),
        ),
        ("KONF.3.6", "ASST.6.1"),
    ),
    SemanticConceptRule(
        "logging_compliance",
        "Protokollierung und Compliance",
        "Logging and compliance",
        (
            "protokoll",
            "protokollierung",
            "logging",
            "audit policy",
            "auditpol",
            "event log",
            "überwachung",
            "ueberwachung",
            "monitoring",
            "compliance",
            "gerätestatus",
            "geraetestatus",
            "policy violation",
            "sicherheitsereignis",
        ),
        (
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_CUSTOM_CSP",
                ("installSyncML",),
                (
                    "Relution Windows CSP evidence includes audit, event-log, and PowerShell "
                    "logging policy nodes."
                ),
            ),
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_COMPANION",
                ("logLevel", "pollInterval"),
                "Windows companion settings expose device-management polling and logging knobs.",
            ),
            semantic_target(
                ("MACOS",),
                "relution-native",
                "MACOS_APP_COMPLIANCE",
                ("requiredApps",),
                "macOS app compliance is a candidate compliance surface.",
            ),
            semantic_target(
                ("IOS",),
                "relution-native",
                "IOS_APP_COMPLIANCE",
                ("requiredApps", "uninstallForbiddenApps"),
                "iOS app compliance is a candidate compliance surface.",
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                "ANDROID_ENTERPRISE_COMPLIANCE_ENFORCEMENT",
                ("configurationEnforcementRules",),
                "Android Enterprise compliance enforcement can react to policy violations.",
            ),
        ),
        ("DET.3.4", "DET.4.4", "KONF.2.5"),
    ),
    SemanticConceptRule(
        "inventory",
        "Inventarisierung",
        "Inventory",
        (
            "inventar",
            "inventarisierung",
            "asset",
            "geräteinventar",
            "geraeteinventar",
            "systeminventar",
            "anwendungsinventar",
        ),
        (
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_COMPANION",
                ("pollInterval", "manageWingetDependencies"),
                "Relution companion policy is adjacent to inventory and dependency management.",
            ),
            semantic_target(
                ("MACOS",),
                "relution-native",
                "MACOS_APP_COMPLIANCE",
                ("requiredApps",),
                "macOS app compliance can support application inventory checks.",
            ),
            semantic_target(
                ("IOS",),
                "relution-native",
                "IOS_APP_COMPLIANCE",
                ("requiredApps",),
                "iOS app compliance can support application inventory checks.",
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                "ANDROID_ENTERPRISE_COMPLIANCE_ENFORCEMENT",
                ("configurationEnforcementRules",),
                "Android Enterprise compliance can act on inventory-derived state.",
            ),
        ),
        ("ASST.2.2", "ASST.2.3"),
    ),
    SemanticConceptRule(
        "browser_restrictions",
        "Browser- und Webeinschränkungen",
        "Browser and web restrictions",
        (
            "browser",
            "webbrowser",
            "safari",
            "edge",
            "smartscreen",
            "webseiten",
            "webseitenfilter",
            "web filter",
            "cookie",
            "history",
            "web content",
        ),
        (
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_CUSTOM_CSP",
                ("installSyncML",),
                (
                    "Relution Windows CSP evidence includes Edge, Browser, InternetExplorer, and "
                    "SmartScreen policies."
                ),
            ),
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_NETWORK_PROXY",
                ("useProxyServer", "proxyServer"),
                "Windows proxy policy can support web access controls.",
            ),
            semantic_target(
                ("MACOS",),
                "relution-native",
                "MACOS_PARENTAL_CONTROLS",
                ("contentFilter", "contentFilter.restrictWeb"),
                "macOS parental controls can restrict web content.",
            ),
            semantic_target(
                ("IOS",),
                "relution-native",
                "IOS_WEB_CONTENT_FILTER",
                ("filterType", "autoFilterEnabled", "blacklistedUrls", "permittedUrls"),
                "iOS web content filter can enforce managed web restrictions.",
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                "ANDROID_ENTERPRISE_RECOMMENDED_GLOBAL_PROXY",
                ("proxyType", "host", "port", "pacUri"),
                "Android Enterprise global proxy is a candidate for web filtering architecture.",
            ),
        ),
        ("KONF.6.14", "KONF.12.3", "KONF.12.6"),
    ),
    SemanticConceptRule(
        "external_media",
        "Externe Medien und Schnittstellen",
        "External media and peripherals",
        (
            "externe medien",
            "wechseldatenträger",
            "wechseldatentraeger",
            "usb",
            "peripherie",
            "removable",
            "removable media",
            "external drive",
            "host-system",
            "host system",
            "pairing",
        ),
        (
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_BITLOCKER",
                ("removableDrivesEncryptionType", "removableDrivesConfigureRecovery"),
                "BitLocker can enforce removable-drive encryption choices.",
            ),
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_RESTRICTION",
                ("allowBluetooth", "allowVPNOverCellular"),
                "Windows restrictions expose selected peripheral and connectivity controls.",
            ),
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_CUSTOM_CSP",
                ("installSyncML",),
                (
                    "Relution Windows CSP evidence includes removable-storage audit and encryption "
                    "nodes."
                ),
            ),
            semantic_target(
                ("MACOS",),
                "relution-native",
                "MACOS_FINDER",
                ("showExternalHardDrivesOnDesktop", "showRemovableMediaOnDesktop"),
                "macOS Finder policy is adjacent to removable media behavior.",
            ),
            semantic_target(
                ("IOS", "MACOS"),
                "apple-schema-profile",
                APPLE_APPLICATION_ACCESS,
                ("allowFilesUSBDriveAccess", "allowHostPairing"),
                (
                    "Apple restrictions schema can disable USB drive access and host pairing where "
                    "supported."
                ),
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                "ANDROID_ENTERPRISE_DEVICE_CONNECTIVITY",
                ("usbDataAccess", "bluetoothSharing"),
                (
                    "Android Enterprise connectivity policy can restrict USB data and Bluetooth "
                    "sharing."
                ),
            ),
        ),
        ("ASST.4.1", "KONF.3.7", "KONF.11.8"),
    ),
    SemanticConceptRule(
        "kiosk",
        "Kiosk und App Lock",
        "Kiosk and app lock",
        (
            "kiosk",
            "app lock",
            "single app",
            "einzel-app",
            "supervised",
            "shared device",
            "gesicherter shared device",
        ),
        (
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_KIOSK_MODE",
                ("kioskModeType", "kioskAppType", "edgeKioskURL"),
                "Windows kiosk mode can restrict device interaction to approved apps or URLs.",
            ),
            semantic_target(
                ("IOS",),
                "relution-native",
                "IOS_APP_LOCK",
                ("identifier", "disableTouch", "disableAutoLock"),
                "iOS App Lock can enforce single-app behavior.",
            ),
            semantic_target(
                ("IOS",),
                "relution-native",
                "IOS_SECURED_SHARED_DEVICE",
                ("relutionClientAppIdentifier", "disableTouch"),
                "iOS secured shared-device settings can restrict shared devices.",
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                "ANDROID_ENTERPRISE_KIOSK_MODE",
                ("kioskCustomLauncher", "systemNavigation", "statusBar"),
                "Android Enterprise kiosk mode can restrict device interaction.",
            ),
        ),
    ),
)
