from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
TEMPLATE_BUNDLE_PATH = REPO_ROOT / "data" / "relution-26.1.1" / "template-bundle.json"
APPLE_SCHEMA_CATALOG_PATH = REPO_ROOT / "data" / "apple-device-management" / "catalog.json"
APPLE_MOBILECONFIG_EVIDENCE_PATH = REPO_ROOT / "example" / "vendor-references" / "downloads" / "derived" / "apple-mobileconfig-evidence.json"

STOP_WORDS = {
    "a",
    "all",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "bei",
    "by",
    "com",
    "configuration",
    "das",
    "dem",
    "den",
    "der",
    "des",
    "device",
    "die",
    "ein",
    "eine",
    "einer",
    "eines",
    "for",
    "from",
    "fuer",
    "für",
    "in",
    "into",
    "ios",
    "is",
    "ist",
    "it",
    "its",
    "macos",
    "management",
    "mdm",
    "mit",
    "must",
    "of",
    "on",
    "or",
    "os",
    "payload",
    "profile",
    "setting",
    "settings",
    "should",
    "sind",
    "soll",
    "sollen",
    "sollte",
    "sollten",
    "that",
    "the",
    "this",
    "to",
    "und",
    "under",
    "while",
    "von",
    "werden",
    "with",
    "without",
    "zu",
    "zum",
    "zur",
}

LOW_SIGNAL_TOKENS = {
    "allow",
    "apple",
    "config",
    "enable",
    "enabled",
    "force",
    "google",
    "microsoft",
    "name",
    "organization",
    "policy",
    "required",
    "security",
    "system",
    "use",
    "using",
    "user",
    "windows",
}

EXACT_IGNORABLE_TOKENS = {"setting", "settings", "usage"}

SYNONYMS = {
    "aktualisierung": "update",
    "aktualisierungen": "update",
    "anwendung": "app",
    "anwendungen": "app",
    "benutzer": "user",
    "benutzende": "user",
    "berechtigung": "permission",
    "berechtigungen": "permission",
    "bildschirm": "screen",
    "bildschirmsperre": "lock",
    "biometrie": "biometric",
    "benachrichtigung": "notification",
    "benachrichtigungen": "notification",
    "datenschutz": "privacy",
    "datenschutzeinstellungen": "privacy",
    "entwickler": "developer",
    "entwicklermodus": "developer",
    "fingerabdruck": "biometric",
    "fotos": "photos",
    "geraet": "device",
    "geraete": "device",
    "gerat": "device",
    "gerate": "device",
    "geraetesperrcode": "passcode",
    "gerätesperrcode": "passcode",
    "kennwort": "passcode",
    "kommunikationsschnittstellen": "connectivity",
    "konto": "account",
    "konten": "account",
    "mobilfunknetz": "mobile",
    "mikrofon": "microphone",
    "nutzer": "user",
    "ortung": "location",
    "passwort": "passcode",
    "protokollierung": "logging",
    "schadprogramme": "malware",
    "schadprogrammen": "malware",
    "schluesselbund": "keychain",
    "schnittstellen": "connectivity",
    "sicherung": "backup",
    "sperre": "lock",
    "sperrbildschirm": "lock",
    "standort": "location",
    "telemetrie": "telemetry",
    "verschluesselung": "encryption",
    "wlan": "wifi",
    "zertifikat": "certificate",
    "zertifikate": "certificate",
    "accounts": "account",
    "apps": "app",
    "applications": "app",
    "cameras": "camera",
    "certificates": "certificate",
    "disabled": "disable",
    "disallow": "deny",
    "encrypted": "encryption",
    "fingerprint": "biometric",
    "locked": "lock",
    "modification": "modify",
    "modifying": "modify",
    "password": "passcode",
    "passwords": "passcode",
    "users": "user",
}

WINDOWS_POLICY_SIGNATURE_STOP_WORDS = STOP_WORDS | {
    "configured",
    "configuration",
    "device",
    "following",
    "option",
    "options",
    "pick",
    "policies",
    "policy",
    "setting",
    "settings",
}
WINDOWS_POLICY_SIGNATURE_SYNONYMS = {
    **SYNONYMS,
    "accounts": "account",
    "administrators": "admin",
    "apps": "app",
    "behaviors": "behavior",
    "clients": "client",
    "communications": "communication",
    "directories": "directory",
    "drivers": "driver",
    "events": "event",
    "features": "feature",
    "files": "file",
    "locations": "location",
    "logons": "logon",
    "policies": "policy",
    "processes": "process",
    "programs": "program",
    "protocols": "protocol",
    "requests": "request",
    "servers": "server",
    "services": "service",
    "shares": "share",
    "users": "user",
    "zones": "zone",
}

NEGATIVE_TERMS = {"block", "deny", "disable", "disabled", "disallow", "prevent", "verbieten", "verhindern"}
ALLOW_TERMS = {"allow", "zulassen", "erlauben"}
POSITIVE_STATES = {"enable", "enabled", "on", "true", "yes"}
NEGATIVE_STATES = {"disable", "disabled", "off", "false", "no"}
BLOCK_STATES = {"block", "blocked", "deny", "denied", "force deny", "force denied"}
CONFIGURED_STATES = {"configured"}


@dataclass(frozen=True)
class FieldEntry:
    kind: str
    target: str
    field_path: str
    label: str
    field_kind: str
    platforms: frozenset[str]
    tokens: frozenset[str]
    label_tokens: frozenset[str]
    enum_values: tuple[str, ...]


@dataclass(frozen=True)
class ScoredField:
    score: int
    matched_terms: tuple[str, ...]
    value_compatibility: str
    field: FieldEntry


@dataclass(frozen=True)
class AppleAnalogRule:
    platforms: frozenset[str]
    schema_id: str
    values: tuple[tuple[str, Any], ...]
    required: tuple[tuple[str, ...], ...]
    excluded: tuple[str, ...] = ()
    constraints: tuple[tuple[str, str, Any], ...] = ()
    reason: str = "Curated Apple schema analog matched managed-device recommendation wording."


@dataclass(frozen=True)
class AndroidAnalogRule:
    target: str
    values: tuple[tuple[str, Any], ...]
    required: tuple[tuple[str, ...], ...]
    excluded: tuple[str, ...] = ()
    constraints: tuple[tuple[str, str, Any], ...] = ()
    reason: str = "Curated Android Enterprise analog matched managed-device recommendation wording."


@dataclass(frozen=True)
class SemanticConceptTarget:
    platforms: frozenset[str]
    kind: str
    target: str
    field_paths: tuple[str, ...]
    note: str


@dataclass(frozen=True)
class SemanticConceptRule:
    concept_id: str
    label_de: str
    label_en: str
    terms: tuple[str, ...]
    targets: tuple[SemanticConceptTarget, ...]
    gs_controls: tuple[str, ...] = ()
    exclusions: tuple[str, ...] = ()


APPLE_APPLICATION_ACCESS = "profile:com.apple.applicationaccess"
APPLE_PASSCODE = "profile:com.apple.mobiledevice.passwordpolicy"
APPLE_SOFTWARE_UPDATE = "profile:com.apple.SoftwareUpdate"
APPLE_SCREEN_SAVER = "profile:com.apple.screensaver"
APPLE_MCX_ACCOUNTS = "profile:com.apple.MCX:mdm-profiles-com-apple-mcx-accounts"

APPLE_ANALOG_RULES: tuple[AppleAnalogRule, ...] = (
    AppleAnalogRule(frozenset({"IOS"}), APPLE_APPLICATION_ACCESS, (("allowAssistantWhileLocked", False),), (("siri while device is locked", "siri while locked", "sprachassistent"), ("locked", "gesperrt"))),
    AppleAnalogRule(frozenset({"IOS", "MACOS"}), APPLE_APPLICATION_ACCESS, (("allowAssistant", False),), (("siri is disabled", "siri disabled", "sprachassistenten"), ("disabled", "deaktiviert"))),
    AppleAnalogRule(frozenset({"IOS"}), APPLE_APPLICATION_ACCESS, (("allowEnterpriseBookBackup", False),), (("backup of enterprise books",), ("block", "disabled"))),
    AppleAnalogRule(frozenset({"IOS"}), APPLE_APPLICATION_ACCESS, (("allowEnterpriseBookMetadataSync", False),), (("notes and highlights sync for enterprise books",), ("block", "disabled"))),
    AppleAnalogRule(frozenset({"IOS", "MACOS"}), APPLE_APPLICATION_ACCESS, (("allowCloudPhotoLibrary", False),), (("icloud photo library",), ("block", "disabled", "deaktiv"))),
    AppleAnalogRule(frozenset({"IOS"}), APPLE_APPLICATION_ACCESS, (("allowPhotoStream", False),), (("my photo stream",), ("block", "disabled"))),
    AppleAnalogRule(frozenset({"IOS", "MACOS"}), APPLE_APPLICATION_ACCESS, (("allowActivityContinuation", False),), (("handoff", "continuity"), ("block", "disabled", "deaktiv"))),
    AppleAnalogRule(frozenset({"IOS", "MACOS"}), APPLE_APPLICATION_ACCESS, (("allowAirDrop", False),), (("airdrop",), ("block", "disabled", "deaktiv"))),
    AppleAnalogRule(frozenset({"IOS"}), APPLE_APPLICATION_ACCESS, (("allowAutoUnlock", False),), (("apple watch auto unlock",), ("block", "disabled"))),
    AppleAnalogRule(frozenset({"IOS", "MACOS"}), APPLE_APPLICATION_ACCESS, (("allowDiagnosticSubmission", False),), (("diagnostic and usage data", "share mac analytics"), ("block", "disabled"))),
    AppleAnalogRule(frozenset({"IOS"}), APPLE_APPLICATION_ACCESS, (("allowScreenShot", False),), (("screenshots", "screen recording"), ("block", "disabled"))),
    AppleAnalogRule(frozenset({"IOS"}), APPLE_APPLICATION_ACCESS, (("allowUntrustedTLSPrompt", False),), (("untrusted tls certificates",), ("block", "disabled"))),
    AppleAnalogRule(frozenset({"IOS", "MACOS"}), APPLE_APPLICATION_ACCESS, (("forceLimitAdTracking", True),), (("limited ad tracking", "limit ad tracking"), ("force", "enabled", "yes"))),
    AppleAnalogRule(frozenset({"IOS"}), APPLE_APPLICATION_ACCESS, (("allowApplePersonalizedAdvertising", False),), (("personalized ads delivered by apple",), ("disabled", "limit"))),
    AppleAnalogRule(frozenset({"IOS"}), APPLE_APPLICATION_ACCESS, (("allowEnterpriseAppTrust", False),), (("trusting new enterprise app authors",), ("block", "disabled"))),
    AppleAnalogRule(frozenset({"IOS"}), APPLE_APPLICATION_ACCESS, (("allowLockScreenControlCenter", False),), (("control center",), ("lock screen",), ("block", "disabled"))),
    AppleAnalogRule(frozenset({"IOS"}), APPLE_APPLICATION_ACCESS, (("allowLockScreenNotificationsView", False),), (("notification center", "notifications center"), ("lock screen",), ("block", "disabled"))),
    AppleAnalogRule(frozenset({"IOS"}), APPLE_APPLICATION_ACCESS, (("allowLockScreenTodayView", False),), (("today view",), ("lock screen",), ("block", "disabled"))),
    AppleAnalogRule(frozenset({"IOS"}), APPLE_APPLICATION_ACCESS, (("allowPassbookWhileLocked", False),), (("wallet",), ("lock screen",), ("block", "disabled"))),
    AppleAnalogRule(frozenset({"IOS"}), APPLE_APPLICATION_ACCESS, (("allowVoiceDialing", False),), (("voice dialing",), ("locked", "lock screen"), ("block", "disabled"))),
    AppleAnalogRule(frozenset({"IOS"}), APPLE_APPLICATION_ACCESS, (("allowUIAppInstallation", False),), (("app store",), ("block", "disabled"))),
    AppleAnalogRule(frozenset({"IOS"}), APPLE_APPLICATION_ACCESS, (("allowFilesNetworkDriveAccess", False),), (("network drive",), ("files app",), ("block", "disabled"))),
    AppleAnalogRule(frozenset({"IOS"}), APPLE_APPLICATION_ACCESS, (("allowFilesUSBDriveAccess", False),), (("usb drive",), ("files app",), ("block", "disabled"))),
    AppleAnalogRule(frozenset({"IOS"}), APPLE_APPLICATION_ACCESS, (("allowEraseContentAndSettings", False),), (("erase all content and settings",), ("block", "disabled"))),
    AppleAnalogRule(frozenset({"IOS"}), APPLE_APPLICATION_ACCESS, (("allowDeviceNameModification", False),), (("modification of device name", "modifying device name"), ("block", "disabled"))),
    AppleAnalogRule(frozenset({"IOS"}), APPLE_APPLICATION_ACCESS, (("allowUIConfigurationProfileInstallation", False),), (("configuration profile", "installing configuration profiles"), ("changes", "installing", "installation"), ("block", "disabled"))),
    AppleAnalogRule(frozenset({"IOS"}), APPLE_APPLICATION_ACCESS, (("allowVPNCreation", False),), (("vpn",), ("creation", "configurations"), ("block", "disabled"))),
    AppleAnalogRule(frozenset({"IOS"}), APPLE_APPLICATION_ACCESS, (("allowHostPairing", False),), (("pairing with non-configurator hosts", "sync with computers"), ("block", "disabled"))),
    AppleAnalogRule(frozenset({"IOS"}), APPLE_APPLICATION_ACCESS, (("allowProximitySetupToNewDevice", False),), (("setting up new nearby devices",), ("disabled", "block"))),
    AppleAnalogRule(frozenset({"IOS"}), APPLE_APPLICATION_ACCESS, (("forceAuthenticationBeforeAutoFill", True),), (("authentication before autofill", "before autofill"), ("enabled", "require"))),
    AppleAnalogRule(frozenset({"IOS"}), APPLE_APPLICATION_ACCESS, (("requireManagedPasteboard", True),), (("copy/paste", "pasteboard"), ("managed open",), ("yes", "enabled"))),
    AppleAnalogRule(frozenset({"IOS"}), APPLE_APPLICATION_ACCESS, (("allowOpenFromManagedToUnmanaged", False),), (("corporate documents in unmanaged apps", "managed sources in unmanaged destinations"), ("block", "disabled"))),
    AppleAnalogRule(frozenset({"IOS"}), APPLE_APPLICATION_ACCESS, (("allowOpenFromUnmanagedToManaged", False),), (("unmanaged sources in managed destinations",), ("disabled", "block"))),
    AppleAnalogRule(frozenset({"IOS"}), APPLE_APPLICATION_ACCESS, (("allowAirPrintiBeaconDiscovery", False),), (("ibeacon discovery of airprint printers",), ("block", "disabled"))),
    AppleAnalogRule(frozenset({"IOS", "MACOS"}), APPLE_APPLICATION_ACCESS, (("forceAutomaticDateAndTime", True),), (("set time and date automatically",), ("enabled",))),
    AppleAnalogRule(frozenset({"MACOS"}), APPLE_APPLICATION_ACCESS, (("allowCloudDesktopAndDocuments", False),), (("icloud drive document and desktop sync",), ("disabled",))),
    AppleAnalogRule(frozenset({"MACOS"}), APPLE_APPLICATION_ACCESS, (("allowAirPlayIncomingRequests", False),), (("airplay receiver",), ("disabled",))),
    AppleAnalogRule(frozenset({"MACOS"}), APPLE_APPLICATION_ACCESS, (("allowExternalIntelligenceIntegrations", False),), (("external intelligence extensions",), ("disabled",))),
    AppleAnalogRule(frozenset({"IOS", "MACOS"}), APPLE_APPLICATION_ACCESS, (("allowWritingTools", False),), (("writing tools",), ("disabled",))),
    AppleAnalogRule(frozenset({"IOS", "MACOS"}), APPLE_APPLICATION_ACCESS, (("allowMailSummary", False),), (("mail summarization",), ("disabled",))),
    AppleAnalogRule(frozenset({"IOS", "MACOS"}), APPLE_APPLICATION_ACCESS, (("allowNotesTranscriptionSummary", False),), (("notes summarization",), ("disabled",))),
    AppleAnalogRule(frozenset({"IOS", "MACOS"}), APPLE_APPLICATION_ACCESS, (("forceOnDeviceOnlyDictation", True),), (("on-device dictation",), ("enabled",))),
    AppleAnalogRule(frozenset({"MACOS"}), APPLE_APPLICATION_ACCESS, (("safariForceFraudWarning", True),), (("warn when visiting a fraudulent website",), ("enabled",))),
    AppleAnalogRule(frozenset({"MACOS"}), APPLE_MCX_ACCOUNTS, (("DisableGuestAccount", True),), (("guest account",), ("disabled",))),
    AppleAnalogRule(frozenset({"MACOS"}), APPLE_SOFTWARE_UPDATE, (("AutomaticCheckEnabled", True), ("AutomaticDownload", True), ("AutomaticallyInstallMacOSUpdates", True), ("AutomaticallyInstallAppUpdates", True), ("CriticalUpdateInstall", True), ("ConfigDataInstall", True)), (("autoupdate", "automatic update", "automatische update"), ("aktiviert", "enabled"))),
)

APPLE_MOBILECONFIG_CANDIDATE_RULES: tuple[tuple[frozenset[str], str, tuple[str, ...], tuple[tuple[str, ...], ...], str], ...] = (
    (frozenset({"IOS"}), "com.apple.shareddeviceconfiguration", ("ifLostReturnToMessage", "lockScreenFootnote"), (("lock screen message", "if lost return", "consent message"),), "Relution can import the Lock Screen Message .mobileconfig payload, but the message text is organization-specific."),
    (frozenset({"MACOS"}), "com.apple.TCC.configuration-profile-policy", ("service", "authorization"), (("full disk access", "privacy preferences policy control", "pppc"),), "Relution can import PPPC .mobileconfig payloads, but exact app identifiers and code requirements are organization-specific."),
    (frozenset({"MACOS"}), "com.apple.servicemanagement", ("teamIdentifier", "bundleIdentifier"), (("login item", "background services"),), "Relution can import Managed Login Items .mobileconfig payloads, but exact team and bundle identifiers are organization-specific."),
    (frozenset({"MACOS"}), "com.apple.security.smartcard", ("enforceSmartCard", "allowSmartCard"), (("smart card",),), "Relution can import Smart Card .mobileconfig payloads, but site authentication policy determines the exact keys."),
    (frozenset({"IOS", "MACOS"}), "com.apple.security.certificatetransparency", ("disabledForDomains",), (("certificate transparency",),), "Relution can import Certificate Transparency .mobileconfig payloads, but domain or certificate exceptions are organization-specific."),
    (frozenset({"IOS"}), "com.apple.networkusagerules", ("applicationRules",), (("network usage rules", "cellular data", "roaming cellular"),), "Relution can import Network Usage Rules .mobileconfig payloads, but managed app identifiers are organization-specific."),
    (frozenset({"IOS"}), "com.apple.ews.account", ("allowMailDrop",), (("allow mail drop",),), "Relution can import Exchange Web Services .mobileconfig payloads, but account configuration is organization-specific."),
)

ANDROID_ADVANCED_SECURITY = "ANDROID_ENTERPRISE_ADVANCED_SECURITY_OVERRIDES"
ANDROID_DISPLAY = "ANDROID_ENTERPRISE_DISPLAY"
ANDROID_KEYGUARD = "ANDROID_ENTERPRISE_KEYGUARD_FEATURE_MANAGEMENT"
ANDROID_LOCATION = "ANDROID_ENTERPRISE_LOCATION_SHARING_MANAGEMENT"
ANDROID_PLAY_STORE = "ANDROID_ENTERPRISE_PLAY_STORE_MANAGEMENT"
ANDROID_RESTRICTION = "ANDROID_ENTERPRISE_RESTRICTION"
ANDROID_SYSTEM_UPDATE = "ANDROID_ENTERPRISE_SYSTEM_UPDATE"

BSI_CONCEPT_MATCH_REASON = "BSI/GS++ concept match"
MANAGEMENT_SUPPORT_CONCEPT_IDS = frozenset(
    {
        "policy_governance",
        "mdm_strategy_selection",
        "device_onboarding",
        "reference_configuration_rollout",
        "administration_procedures",
        "hardened_device_procurement",
    }
)
DIRECT_SEMANTIC_SOURCES = frozenset({
    "bsi-title",
    "bsi-requirement",
    "kompendium-checklist",
    "cis-title",
    "cis-description",
    "vendor-title",
    "vendor-section",
    "relution-field",
    "apple-schema-field",
})
RELATED_SEMANTIC_SOURCES = frozenset({"related-kompendium-checklist"})
GS_PLUSPLUS_SEMANTIC_SOURCES = frozenset({"grundschutz-plusplus-control"})
PROCESS_ONLY_TITLE_TERMS = (
    "notfallplanung",
    "notfallmanagement",
    "stromversorgung",
    "unterbrechungsfreie",
    "usv",
    "power supply",
    "emergency planning",
)


def semantic_target(platforms: tuple[str, ...], kind: str, target: str, field_paths: tuple[str, ...], note: str) -> SemanticConceptTarget:
    return SemanticConceptTarget(frozenset(platforms), kind, target, field_paths, note)
