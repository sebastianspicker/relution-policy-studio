"""Shared constants for institution policy baseline comparison."""

from __future__ import annotations

import re
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT_ROOT = REPO_ROOT / "example" / "institution-policy-comparison"
BASELINE_TEMPLATE_INDEX_PATH = (
    REPO_ROOT / "example" / "relution-baseline-templates" / "index.json"
)

PLATFORMS = ("WINDOWS", "MACOS", "IOS", "ANDROID_ENTERPRISE")
PLATFORM_SLUGS = {
    "WINDOWS": "windows",
    "MACOS": "macos",
    "IOS": "ios",
    "ANDROID_ENTERPRISE": "android-enterprise",
}
INSTITUTION_POLICY_FILES = {
    "WINDOWS": "docs/managed-devices/05-policies-catalog/windows-policies.md",
    "MACOS": "docs/managed-devices/05-policies-catalog/macos-policies.md",
    "IOS": "docs/managed-devices/05-policies-catalog/ios-ipados-policies.md",
    "ANDROID_ENTERPRISE": "docs/managed-devices/05-policies-catalog/android-policies.md",
}

POLICY_NAME_RE = re.compile(
    r"(?:Policy(?:-Name)?|Baseline|Overrides?|Policy)\s*:\s*`([^`]+)`", re.IGNORECASE
)
BACKTICK_POLICY_RE = re.compile(
    r"`((?:Institution|POL|Windows|MAC|IOS|AND)[^`]{2,120})`"
)

TARGET_KEYWORDS = {
    "ANDROID_ENTERPRISE_ADVANCED_SECURITY_OVERRIDES": (
        "advanced security",
        "entwickler",
        "developer",
        "unknown sources",
        "integrität",
    ),
    "ANDROID_ENTERPRISE_DEVICE_PASSCODE": (
        "passcode",
        "passwort",
        "geräteentsperrung",
        "gerätesperre",
    ),
    "ANDROID_ENTERPRISE_DISPLAY": ("display", "lockscreen", "bildschirm"),
    "ANDROID_ENTERPRISE_KEYGUARD_FEATURE_MANAGEMENT": (
        "keyguard",
        "trust agents",
        "smart lock",
        "lockscreen",
    ),
    "ANDROID_ENTERPRISE_PERMISSION_MANAGEMENT": (
        "permissions",
        "berechtigung",
        "runtime permission",
    ),
    "ANDROID_ENTERPRISE_PLAY_STORE_MANAGEMENT": (
        "managed play",
        "play store",
        "app-management",
        "app auto update",
    ),
    "ANDROID_ENTERPRISE_RESTRICTION": (
        "restriction",
        "restriktion",
        "dlp",
        "schnittstellen",
        "kamera",
        "microphone",
        "mikrofon",
    ),
    "ANDROID_ENTERPRISE_SYSTEM_UPDATE": ("update", "patch", "freeze"),
    "ANDROID_ENTERPRISE_WORK_PROFILE_PASSCODE": ("work profile", "cope"),
    "IOS_PASSCODE": ("passcode", "geräteentsperrung", "password"),
    "IOS_RESTRICTION": (
        "restriction",
        "restriktion",
        "icloud",
        "airdrop",
        "kamera",
        "siri",
        "managed",
    ),
    "IOS_UPDATE": ("update", "patch", "software update"),
    "IOS_WIFI": ("wi-fi", "wifi", "wlan", "ssid"),
    "APPLE_DEVICE_SETTINGS": (
        "activation lock",
        "branding",
        "lock screen",
        "lost mode",
    ),
    "MACOS_FILE_VAULT": ("filevault", "encryption", "verschlüsselung"),
    "MACOS_FIREWALL": ("firewall",),
    "MACOS_RESTRICTION": (
        "restriction",
        "restriktion",
        "icloud",
        "apple services",
        "siri",
    ),
    "MACOS_SYSTEM_POLICY_CONTROL": (
        "gatekeeper",
        "system policy",
        "security options",
        "extensions",
    ),
    "APPLE_SOFTWARE_UPDATE_SETTINGS": ("update", "patch", "software update"),
    "WINDOWS_ANTIVIRUS": (
        "defender",
        "antivirus",
        "malware",
        "asr",
        "network protection",
    ),
    "WINDOWS_BITLOCKER": ("bitlocker", "encryption", "verschlüsselung"),
    "WINDOWS_CUSTOM_CSP": (
        "custom csp",
        "policy csp",
        "csp",
        "mdmwinsovergpo",
        "vbs",
        "credential guard",
        "lsa",
        "audit",
    ),
    "WINDOWS_FIREWALL": ("firewall",),
    "WINDOWS_HELLO": ("hello", "biometric", "pin"),
    "WINDOWS_LOCAL_DEVICE_SECURITY": (
        "local device security",
        "vbs",
        "secure boot",
        "dma",
    ),
    "WINDOWS_PASSCODE": ("passcode", "password", "kennwort"),
    "WINDOWS_RESTRICTION": (
        "restriction",
        "restriktion",
        "smartscreen",
        "camera",
        "consumer features",
    ),
    "WINDOWS_UPDATE": ("update", "wufb", "windows update", "patch"),
}

CSP_GENERIC_TERMS = {
    "account",
    "accounts",
    "allow",
    "audit",
    "based",
    "client",
    "configure",
    "credential",
    "device",
    "disable",
    "disabled",
    "enable",
    "enabled",
    "local",
    "logoff",
    "logon",
    "management",
    "maximum",
    "microsoft",
    "minimum",
    "network",
    "password",
    "policy",
    "prevent",
    "require",
    "security",
    "server",
    "turn",
    "user",
    "users",
    "windows",
}
