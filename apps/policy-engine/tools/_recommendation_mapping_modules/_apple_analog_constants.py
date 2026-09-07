"""Curated Apple analog rules and mobileconfig candidate metadata."""

from ._mapping_models import AppleAnalogRule

APPLE_APPLICATION_ACCESS = "profile:com.apple.applicationaccess"
APPLE_PASSCODE = "profile:com.apple.mobiledevice.passwordpolicy"
APPLE_SOFTWARE_UPDATE = "profile:com.apple.SoftwareUpdate"
APPLE_SCREEN_SAVER = "profile:com.apple.screensaver"
APPLE_MCX_ACCOUNTS = "profile:com.apple.MCX:mdm-profiles-com-apple-mcx-accounts"

APPLE_ANALOG_RULES: tuple[AppleAnalogRule, ...] = (
    AppleAnalogRule(
        frozenset({"IOS"}),
        APPLE_APPLICATION_ACCESS,
        (("allowAssistantWhileLocked", False),),
        (
            ("siri while device is locked", "siri while locked", "sprachassistent"),
            ("locked", "gesperrt"),
        ),
    ),
    AppleAnalogRule(
        frozenset({"IOS", "MACOS"}),
        APPLE_APPLICATION_ACCESS,
        (("allowAssistant", False),),
        (
            ("siri is disabled", "siri disabled", "sprachassistenten"),
            ("disabled", "deaktiviert"),
        ),
    ),
    AppleAnalogRule(
        frozenset({"IOS"}),
        APPLE_APPLICATION_ACCESS,
        (("allowEnterpriseBookBackup", False),),
        (("backup of enterprise books",), ("block", "disabled")),
    ),
    AppleAnalogRule(
        frozenset({"IOS"}),
        APPLE_APPLICATION_ACCESS,
        (("allowEnterpriseBookMetadataSync", False),),
        (("notes and highlights sync for enterprise books",), ("block", "disabled")),
    ),
    AppleAnalogRule(
        frozenset({"IOS", "MACOS"}),
        APPLE_APPLICATION_ACCESS,
        (("allowCloudPhotoLibrary", False),),
        (("icloud photo library",), ("block", "disabled", "deaktiv")),
    ),
    AppleAnalogRule(
        frozenset({"IOS"}),
        APPLE_APPLICATION_ACCESS,
        (("allowPhotoStream", False),),
        (("my photo stream",), ("block", "disabled")),
    ),
    AppleAnalogRule(
        frozenset({"IOS", "MACOS"}),
        APPLE_APPLICATION_ACCESS,
        (("allowActivityContinuation", False),),
        (("handoff", "continuity"), ("block", "disabled", "deaktiv")),
    ),
    AppleAnalogRule(
        frozenset({"IOS", "MACOS"}),
        APPLE_APPLICATION_ACCESS,
        (("allowAirDrop", False),),
        (("airdrop",), ("block", "disabled", "deaktiv")),
    ),
    AppleAnalogRule(
        frozenset({"IOS"}),
        APPLE_APPLICATION_ACCESS,
        (("allowAutoUnlock", False),),
        (("apple watch auto unlock",), ("block", "disabled")),
    ),
    AppleAnalogRule(
        frozenset({"IOS", "MACOS"}),
        APPLE_APPLICATION_ACCESS,
        (("allowDiagnosticSubmission", False),),
        (("diagnostic and usage data", "share mac analytics"), ("block", "disabled")),
    ),
    AppleAnalogRule(
        frozenset({"IOS"}),
        APPLE_APPLICATION_ACCESS,
        (("allowScreenShot", False),),
        (("screenshots", "screen recording"), ("block", "disabled")),
    ),
    AppleAnalogRule(
        frozenset({"IOS"}),
        APPLE_APPLICATION_ACCESS,
        (("allowUntrustedTLSPrompt", False),),
        (("untrusted tls certificates",), ("block", "disabled")),
    ),
    AppleAnalogRule(
        frozenset({"IOS", "MACOS"}),
        APPLE_APPLICATION_ACCESS,
        (("forceLimitAdTracking", True),),
        (("limited ad tracking", "limit ad tracking"), ("force", "enabled", "yes")),
    ),
    AppleAnalogRule(
        frozenset({"IOS"}),
        APPLE_APPLICATION_ACCESS,
        (("allowApplePersonalizedAdvertising", False),),
        (("personalized ads delivered by apple",), ("disabled", "limit")),
    ),
    AppleAnalogRule(
        frozenset({"IOS"}),
        APPLE_APPLICATION_ACCESS,
        (("allowEnterpriseAppTrust", False),),
        (("trusting new enterprise app authors",), ("block", "disabled")),
    ),
    AppleAnalogRule(
        frozenset({"IOS"}),
        APPLE_APPLICATION_ACCESS,
        (("allowLockScreenControlCenter", False),),
        (("control center",), ("lock screen",), ("block", "disabled")),
    ),
    AppleAnalogRule(
        frozenset({"IOS"}),
        APPLE_APPLICATION_ACCESS,
        (("allowLockScreenNotificationsView", False),),
        (
            ("notification center", "notifications center"),
            ("lock screen",),
            ("block", "disabled"),
        ),
    ),
    AppleAnalogRule(
        frozenset({"IOS"}),
        APPLE_APPLICATION_ACCESS,
        (("allowLockScreenTodayView", False),),
        (("today view",), ("lock screen",), ("block", "disabled")),
    ),
    AppleAnalogRule(
        frozenset({"IOS"}),
        APPLE_APPLICATION_ACCESS,
        (("allowPassbookWhileLocked", False),),
        (("wallet",), ("lock screen",), ("block", "disabled")),
    ),
    AppleAnalogRule(
        frozenset({"IOS"}),
        APPLE_APPLICATION_ACCESS,
        (("allowVoiceDialing", False),),
        (("voice dialing",), ("locked", "lock screen"), ("block", "disabled")),
    ),
    AppleAnalogRule(
        frozenset({"IOS"}),
        APPLE_APPLICATION_ACCESS,
        (("allowUIAppInstallation", False),),
        (("app store",), ("block", "disabled")),
    ),
    AppleAnalogRule(
        frozenset({"IOS"}),
        APPLE_APPLICATION_ACCESS,
        (("allowFilesNetworkDriveAccess", False),),
        (("network drive",), ("files app",), ("block", "disabled")),
    ),
    AppleAnalogRule(
        frozenset({"IOS"}),
        APPLE_APPLICATION_ACCESS,
        (("allowFilesUSBDriveAccess", False),),
        (("usb drive",), ("files app",), ("block", "disabled")),
    ),
    AppleAnalogRule(
        frozenset({"IOS"}),
        APPLE_APPLICATION_ACCESS,
        (("allowEraseContentAndSettings", False),),
        (("erase all content and settings",), ("block", "disabled")),
    ),
    AppleAnalogRule(
        frozenset({"IOS"}),
        APPLE_APPLICATION_ACCESS,
        (("allowDeviceNameModification", False),),
        (
            ("modification of device name", "modifying device name"),
            ("block", "disabled"),
        ),
    ),
    AppleAnalogRule(
        frozenset({"IOS"}),
        APPLE_APPLICATION_ACCESS,
        (("allowUIConfigurationProfileInstallation", False),),
        (
            ("configuration profile", "installing configuration profiles"),
            ("changes", "installing", "installation"),
            ("block", "disabled"),
        ),
    ),
    AppleAnalogRule(
        frozenset({"IOS"}),
        APPLE_APPLICATION_ACCESS,
        (("allowVPNCreation", False),),
        (("vpn",), ("creation", "configurations"), ("block", "disabled")),
    ),
    AppleAnalogRule(
        frozenset({"IOS"}),
        APPLE_APPLICATION_ACCESS,
        (("allowHostPairing", False),),
        (
            ("pairing with non-configurator hosts", "sync with computers"),
            ("block", "disabled"),
        ),
    ),
    AppleAnalogRule(
        frozenset({"IOS"}),
        APPLE_APPLICATION_ACCESS,
        (("allowProximitySetupToNewDevice", False),),
        (("setting up new nearby devices",), ("disabled", "block")),
    ),
    AppleAnalogRule(
        frozenset({"IOS"}),
        APPLE_APPLICATION_ACCESS,
        (("forceAuthenticationBeforeAutoFill", True),),
        (("authentication before autofill", "before autofill"), ("enabled", "require")),
    ),
    AppleAnalogRule(
        frozenset({"IOS"}),
        APPLE_APPLICATION_ACCESS,
        (("requireManagedPasteboard", True),),
        (("copy/paste", "pasteboard"), ("managed open",), ("yes", "enabled")),
    ),
    AppleAnalogRule(
        frozenset({"IOS"}),
        APPLE_APPLICATION_ACCESS,
        (("allowOpenFromManagedToUnmanaged", False),),
        (
            (
                "corporate documents in unmanaged apps",
                "managed sources in unmanaged destinations",
            ),
            ("block", "disabled"),
        ),
    ),
    AppleAnalogRule(
        frozenset({"IOS"}),
        APPLE_APPLICATION_ACCESS,
        (("allowOpenFromUnmanagedToManaged", False),),
        (("unmanaged sources in managed destinations",), ("disabled", "block")),
    ),
    AppleAnalogRule(
        frozenset({"IOS"}),
        APPLE_APPLICATION_ACCESS,
        (("allowAirPrintiBeaconDiscovery", False),),
        (("ibeacon discovery of airprint printers",), ("block", "disabled")),
    ),
    AppleAnalogRule(
        frozenset({"IOS", "MACOS"}),
        APPLE_APPLICATION_ACCESS,
        (("forceAutomaticDateAndTime", True),),
        (("set time and date automatically",), ("enabled",)),
    ),
    AppleAnalogRule(
        frozenset({"MACOS"}),
        APPLE_APPLICATION_ACCESS,
        (("allowCloudDesktopAndDocuments", False),),
        (("icloud drive document and desktop sync",), ("disabled",)),
    ),
    AppleAnalogRule(
        frozenset({"MACOS"}),
        APPLE_APPLICATION_ACCESS,
        (("allowAirPlayIncomingRequests", False),),
        (("airplay receiver",), ("disabled",)),
    ),
    AppleAnalogRule(
        frozenset({"MACOS"}),
        APPLE_APPLICATION_ACCESS,
        (("allowExternalIntelligenceIntegrations", False),),
        (("external intelligence extensions",), ("disabled",)),
    ),
    AppleAnalogRule(
        frozenset({"IOS", "MACOS"}),
        APPLE_APPLICATION_ACCESS,
        (("allowWritingTools", False),),
        (("writing tools",), ("disabled",)),
    ),
    AppleAnalogRule(
        frozenset({"IOS", "MACOS"}),
        APPLE_APPLICATION_ACCESS,
        (("allowMailSummary", False),),
        (("mail summarization",), ("disabled",)),
    ),
    AppleAnalogRule(
        frozenset({"IOS", "MACOS"}),
        APPLE_APPLICATION_ACCESS,
        (("allowNotesTranscriptionSummary", False),),
        (("notes summarization",), ("disabled",)),
    ),
    AppleAnalogRule(
        frozenset({"IOS", "MACOS"}),
        APPLE_APPLICATION_ACCESS,
        (("forceOnDeviceOnlyDictation", True),),
        (("on-device dictation",), ("enabled",)),
    ),
    AppleAnalogRule(
        frozenset({"MACOS"}),
        APPLE_APPLICATION_ACCESS,
        (("safariForceFraudWarning", True),),
        (("warn when visiting a fraudulent website",), ("enabled",)),
    ),
    AppleAnalogRule(
        frozenset({"MACOS"}),
        APPLE_MCX_ACCOUNTS,
        (("DisableGuestAccount", True),),
        (("guest account",), ("disabled",)),
    ),
    AppleAnalogRule(
        frozenset({"MACOS"}),
        APPLE_SOFTWARE_UPDATE,
        (
            ("AutomaticCheckEnabled", True),
            ("AutomaticDownload", True),
            ("AutomaticallyInstallMacOSUpdates", True),
            ("AutomaticallyInstallAppUpdates", True),
            ("CriticalUpdateInstall", True),
            ("ConfigDataInstall", True),
        ),
        (
            ("autoupdate", "automatic update", "automatische update"),
            ("aktiviert", "enabled"),
        ),
    ),
)

APPLE_MOBILECONFIG_CANDIDATE_RULES: tuple[
    tuple[frozenset[str], str, tuple[str, ...], tuple[tuple[str, ...], ...], str], ...
] = (
    (
        frozenset({"IOS"}),
        "com.apple.shareddeviceconfiguration",
        ("ifLostReturnToMessage", "lockScreenFootnote"),
        (("lock screen message", "if lost return", "consent message"),),
        (
            "Relution can import the Lock Screen Message .mobileconfig payload, but the "
            "message text is organization-specific."
        ),
    ),
    (
        frozenset({"MACOS"}),
        "com.apple.TCC.configuration-profile-policy",
        ("service", "authorization"),
        (("full disk access", "privacy preferences policy control", "pppc"),),
        (
            "Relution can import PPPC .mobileconfig payloads, but exact app identifiers and "
            "code requirements are organization-specific."
        ),
    ),
    (
        frozenset({"MACOS"}),
        "com.apple.servicemanagement",
        ("teamIdentifier", "bundleIdentifier"),
        (("login item", "background services"),),
        (
            "Relution can import Managed Login Items .mobileconfig payloads, but exact team "
            "and bundle identifiers are organization-specific."
        ),
    ),
    (
        frozenset({"MACOS"}),
        "com.apple.security.smartcard",
        ("enforceSmartCard", "allowSmartCard"),
        (("smart card",),),
        (
            "Relution can import Smart Card .mobileconfig payloads, but site authentication "
            "policy determines the exact keys."
        ),
    ),
    (
        frozenset({"IOS", "MACOS"}),
        "com.apple.security.certificatetransparency",
        ("disabledForDomains",),
        (("certificate transparency",),),
        (
            "Relution can import Certificate Transparency .mobileconfig payloads, but "
            "domain or certificate exceptions are organization-specific."
        ),
    ),
    (
        frozenset({"IOS"}),
        "com.apple.networkusagerules",
        ("applicationRules",),
        (("network usage rules", "cellular data", "roaming cellular"),),
        (
            "Relution can import Network Usage Rules .mobileconfig payloads, but managed "
            "app identifiers are organization-specific."
        ),
    ),
    (
        frozenset({"IOS"}),
        "com.apple.ews.account",
        ("allowMailDrop",),
        (("allow mail drop",),),
        (
            "Relution can import Exchange Web Services .mobileconfig payloads, but account "
            "configuration is organization-specific."
        ),
    ),
)
