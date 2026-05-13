#!/usr/bin/env python3
from __future__ import annotations

import argparse
from html.parser import HTMLParser
import hashlib
import ipaddress
import json
import re
import shutil
import socket
import sys
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from urllib.request import Request, urlopen

sys.dont_write_bytecode = True

from build_relution_import_artifacts import build_source_artifacts, normalize_recommendations  # noqa: E402
from recommendation_mapping import (  # noqa: E402
    android_relution_analog_mappings_for,
    android_relution_candidates_for,
    build_setting_index,
    infer_exact_boolean_mapping,
    load_windows_custom_csp_evidence,
    mapping_candidates as shared_mapping_candidates,
    semantic_candidates_for,
    semantic_concepts_for,
    semantic_no_concept_reason,
    windows_custom_csp_mapping_for,
)


REPO_ROOT = Path(__file__).resolve().parents[1]
VENDOR_DIR = REPO_ROOT / "example" / "vendor-references"
TEMPLATE_BUNDLE_PATH = REPO_ROOT / "data" / "relution-26.1.1" / "template-bundle.json"
WINDOWS_BASELINE_PATH = VENDOR_DIR / "downloads" / "derived" / "windows-25h2-intune-baseline.json"
WINDOWS_WORKBOOK_PATH = VENDOR_DIR / "downloads" / "derived" / "windows-24h2-workbook.json"
WINDOWS_POLICY_RULES_PATH = VENDOR_DIR / "downloads" / "derived" / "windows-24h2-policy-rules.json"
WINDOWS_REXP_EVIDENCE_PATH = VENDOR_DIR / "downloads" / "derived" / "windows-relution-csp-evidence.json"

VENDOR_VERIFIED_AS_OF = "2026-04-23"
WINDOWS_BASELINE_NAME = "Windows 11 version 25H2 Intune MDM security baseline"
PUBLIC_TOKEN_REDACTIONS: tuple[tuple[bytes, bytes], ...] = (
    (rb"AIza[0-9A-Za-z_-]{30,45}", b"[REDACTED_GOOGLE_API_KEY]"),
    (rb"pk_live_[0-9A-Za-z]{40,120}", b"[REDACTED_STRIPE_PUBLISHABLE_KEY]"),
)
MAX_VENDOR_DOWNLOAD_BYTES = 25 * 1024 * 1024
SAFE_SOURCE_ID_RE = re.compile(r"^[a-z0-9][a-z0-9._-]*$")

CURATED_PLATFORM_GUIDANCE: list[dict[str, Any]] = [
    {
        "platform": "ANDROID",
        "sourceIds": ["google-play-protect-managed-devices"],
        "title": "Enforce Google Play Protect on managed devices",
        "section": "Malware protection",
        "recommendedValue": "VERIFY_APPS_ENFORCED",
        "reason": "Google documents managed enforcement of Google Play Protect and harmful-app detection.",
        "reasonSource": "google-play-protect-managed-devices",
        "mapping": ("ANDROID_ENTERPRISE_ADVANCED_SECURITY_OVERRIDES", {"googlePlayProtectVerifyApps": "VERIFY_APPS_ENFORCED"}),
    },
    {
        "platform": "ANDROID",
        "sourceIds": ["google-android-enterprise-feature-list"],
        "title": "Block installation from unknown sources by default",
        "section": "Default security policies",
        "recommendedValue": "DISALLOW_INSTALL",
        "reason": "Google lists blocking installation from unknown sources as a default Android Enterprise security policy.",
        "reasonSource": "google-android-enterprise-feature-list",
        "mapping": ("ANDROID_ENTERPRISE_ADVANCED_SECURITY_OVERRIDES", {"untrustedAppsPolicy": "DISALLOW_INSTALL"}),
    },
    {
        "platform": "ANDROID",
        "sourceIds": ["google-android-enterprise-feature-list"],
        "title": "Block debugging features by default",
        "section": "Default security policies",
        "recommendedValue": "DEVELOPER_SETTINGS_DISABLED",
        "reason": "Google lists blocked debugging features as a default Android Enterprise security policy.",
        "reasonSource": "google-android-enterprise-feature-list",
        "mapping": ("ANDROID_ENTERPRISE_ADVANCED_SECURITY_OVERRIDES", {"developerSettings": "DEVELOPER_SETTINGS_DISABLED"}),
    },
    {
        "platform": "ANDROID",
        "sourceIds": ["google-android-enterprise-feature-list"],
        "title": "Disable safe boot by default",
        "section": "Default security policies",
        "recommendedValue": True,
        "reason": "Google lists safe-boot blocking as a default managed-device policy.",
        "reasonSource": "google-android-enterprise-feature-list",
        "mapping": ("ANDROID_ENTERPRISE_RESTRICTION", {"safeBootDisabled": True}),
    },
    {
        "platform": "ANDROID",
        "sourceIds": ["google-android-enterprise-feature-list"],
        "title": "Turn on Verify Apps by default",
        "section": "Verify Apps enforcement",
        "recommendedValue": "VERIFY_APPS_ENFORCED",
        "reason": "Google lists Verify Apps enforcement as a default managed-device policy.",
        "reasonSource": "google-android-enterprise-feature-list",
        "mapping": ("ANDROID_ENTERPRISE_ADVANCED_SECURITY_OVERRIDES", {"googlePlayProtectVerifyApps": "VERIFY_APPS_ENFORCED"}),
    },
    {
        "platform": "ANDROID",
        "sourceIds": ["google-android-enterprise-feature-list"],
        "title": "Use compliance enforcement when devices fall out of policy",
        "section": "Compliance enforcement",
        "recommendedValue": "ENFORCE_COMPLIANCE_ACTIONS",
        "reason": "Google describes compliance rules that restrict work-resource access when managed devices fall out of policy.",
        "reasonSource": "google-android-enterprise-feature-list",
    },
    {
        "platform": "ANDROID",
        "sourceIds": ["google-android-enterprise-system-updates"],
        "title": "Use compliance policies to keep devices current",
        "section": "System updates",
        "recommendedValue": "COMPLIANCE_POLICIES",
        "reason": "Google recommends compliance policies for keeping managed devices current in common knowledge-worker deployments.",
        "reasonSource": "google-android-enterprise-system-updates",
    },
    {
        "platform": "ANDROID",
        "sourceIds": ["google-android-enterprise-system-updates", "google-android-enterprise-feature-list"],
        "title": "Offer automatic OTA system updates",
        "section": "System update policy",
        "recommendedValue": "AUTOMATIC",
        "reason": "Google documents AUTOMATIC as installing system updates as soon as they are available.",
        "reasonSource": "google-android-enterprise-system-updates",
        "mapping": ("ANDROID_ENTERPRISE_SYSTEM_UPDATE", {"systemUpdateType": "AUTOMATIC"}),
    },
    {
        "platform": "ANDROID",
        "sourceIds": ["google-android-enterprise-system-updates", "google-android-enterprise-feature-list"],
        "title": "Use a maintenance window for OTA system updates",
        "section": "System update policy",
        "recommendedValue": "WINDOWED",
        "reason": "Google documents WINDOWED as installing system updates during a daily maintenance window.",
        "reasonSource": "google-android-enterprise-system-updates",
        "mapping": ("ANDROID_ENTERPRISE_SYSTEM_UPDATE", {"systemUpdateType": "WINDOWED"}),
    },
    {
        "platform": "ANDROID",
        "sourceIds": ["google-android-enterprise-system-updates", "google-android-enterprise-feature-list"],
        "title": "Postpone OTA system updates for up to 30 days",
        "section": "System update policy",
        "recommendedValue": "POSTPONE",
        "reason": "Google documents POSTPONE as delaying system updates for up to 30 days.",
        "reasonSource": "google-android-enterprise-system-updates",
        "mapping": ("ANDROID_ENTERPRISE_SYSTEM_UPDATE", {"systemUpdateType": "POSTPONE"}),
    },
    {
        "platform": "ANDROID",
        "sourceIds": ["google-android-enterprise-system-updates", "google-android-enterprise-feature-list"],
        "title": "Configure annual freeze periods for update blackout windows",
        "section": "Advanced system update policy",
        "recommendedValue": "FREEZE_PERIODS",
        "reason": "Google documents annual system-update freeze periods for planned blackout windows.",
        "reasonSource": "google-android-enterprise-system-updates",
    },
    {
        "platform": "ANDROID",
        "sourceIds": ["google-android-enterprise-feature-list"],
        "title": "Enforce automatic date and time settings",
        "section": "System clock management",
        "recommendedValue": "AUTO_DATE_AND_TIME_ZONE_ENFORCED",
        "reason": "Google documents policy enforcement for automatic date, time, and time-zone settings.",
        "reasonSource": "google-android-enterprise-feature-list",
        "mapping": ("ANDROID_ENTERPRISE_RESTRICTION", {"androidAutoDateAndTimeZoneSetting": "AUTO_DATE_AND_TIME_ZONE_ENFORCED"}),
    },
    {
        "platform": "ANDROID",
        "sourceIds": ["google-android-enterprise-feature-list"],
        "title": "Require a separate work profile security challenge",
        "section": "Work security challenge",
        "recommendedValue": "REQUIRE_SEPARATE_WORK_LOCK",
        "reason": "Google documents a separate work-profile security challenge for work data isolation.",
        "reasonSource": "google-android-enterprise-feature-list",
        "mapping": ("ANDROID_ENTERPRISE_WORK_PROFILE_PASSCODE", {"unifiedLockSettings": "REQUIRE_SEPARATE_WORK_LOCK"}),
    },
    {
        "platform": "ANDROID",
        "sourceIds": ["google-android-enterprise-feature-list"],
        "title": "Use a managed device security challenge",
        "section": "Device security challenge",
        "recommendedValue": "PASSWORD_COMPLEXITY_POLICY",
        "reason": "Google documents managed password-complexity policy for device security challenges.",
        "reasonSource": "google-android-enterprise-feature-list",
    },
    {
        "platform": "ANDROID",
        "sourceIds": ["google-android-management-security-posture"],
        "title": "Wait for HBKA reissuance when posture is unspecified",
        "section": "Security posture",
        "recommendedValue": "RETRY_HBKA",
        "reason": "Google's posture guidance treats unspecified hardware-backed key attestation as a retryable state.",
        "reasonSource": "google-android-management-security-posture",
    },
    {
        "platform": "ANDROID",
        "sourceIds": ["google-android-management-security-posture"],
        "title": "Lock the bootloader when unknown OS is reported",
        "section": "Security posture",
        "recommendedValue": "LOCK_BOOTLOADER",
        "reason": "Google's posture guidance calls out locked bootloader state as a security signal.",
        "reasonSource": "google-android-management-security-posture",
    },
    {
        "platform": "ANDROID",
        "sourceIds": ["google-android-enterprise-feature-drop-2025"],
        "title": "Enable Advanced Protection for high-risk users when available",
        "section": "Advanced protection",
        "recommendedValue": "ADVANCED_PROTECTION",
        "reason": "Google documents Android Enterprise Advanced Protection controls for high-risk users.",
        "reasonSource": "google-android-enterprise-feature-drop-2025",
    },
    {
        "platform": "ANDROID",
        "sourceIds": ["google-android-enterprise-feature-drop-2025"],
        "title": "Use APN overrides to restrict traffic to approved networks",
        "section": "Cellular connectivity",
        "recommendedValue": "APN_OVERRIDES",
        "reason": "Google documents APN override management for approved cellular connectivity.",
        "reasonSource": "google-android-enterprise-feature-drop-2025",
    },
    {
        "platform": "ANDROID",
        "sourceIds": ["google-android-enterprise-feature-list"],
        "title": "Install app updates immediately when approved",
        "section": "App update management",
        "recommendedValue": "ALWAYS",
        "reason": "Google documents immediate app auto-update behavior through managed Play policy.",
        "reasonSource": "google-android-enterprise-feature-list",
        "mapping": ("ANDROID_ENTERPRISE_PLAY_STORE_MANAGEMENT", {"appAutoUpdatePolicy": "ALWAYS"}),
    },
    {
        "platform": "MACOS",
        "sourceIds": ["apple-managing-filevault-macos", "apple-manage-filevault-device-management"],
        "title": "Enable FileVault on managed Macs",
        "section": "FileVault",
        "recommendedValue": "ON",
        "reason": "Apple documents FileVault as built-in full-volume encryption for managed Mac computers.",
        "reasonSource": "apple-managing-filevault-macos",
        "mapping": ("MACOS_FILE_VAULT", {"fdeFileVault": {"enable": "ON"}}),
    },
    {
        "platform": "MACOS",
        "sourceIds": ["apple-managing-filevault-macos", "apple-manage-filevault-device-management"],
        "title": "Escrow a personal recovery key for FileVault",
        "section": "FileVault",
        "recommendedValue": "PERSONAL_RECOVERY_KEY_ESCROW",
        "reason": "Apple documents device-management escrow of FileVault personal recovery keys.",
        "reasonSource": "apple-managing-filevault-macos",
        "mapping": ("MACOS_FILE_VAULT", {"enableRecoveryKeyEscrow": True, "fdeFileVault": {"useRecoveryKey": True}}),
    },
    {
        "platform": "MACOS",
        "sourceIds": ["apple-managing-filevault-macos"],
        "title": "Prefer a personal recovery key over an institutional recovery key",
        "section": "FileVault",
        "recommendedValue": "USE_PRK_NOT_IRK",
        "reason": "Apple positions personal recovery keys as the current managed FileVault recovery-key workflow.",
        "reasonSource": "apple-managing-filevault-macos",
        "mapping": ("MACOS_FILE_VAULT", {"enableRecoveryKeyEscrow": True, "fdeFileVault": {"useRecoveryKey": True}}),
    },
    {
        "platform": "MACOS",
        "sourceIds": ["apple-managing-filevault-macos", "apple-manage-filevault-device-management"],
        "title": "Use bootstrap tokens for managed FileVault workflows",
        "section": "FileVault",
        "recommendedValue": "BOOTSTRAP_TOKEN",
        "reason": "Apple documents Bootstrap Token as support for Secure Token and managed FileVault workflows.",
        "reasonSource": "apple-managing-filevault-macos",
    },
    {
        "platform": "MACOS",
        "sourceIds": ["apple-manage-filevault-device-management"],
        "title": "Require FileVault during Setup Assistant",
        "section": "FileVault",
        "recommendedValue": "FORCE_ENABLE_IN_SETUP_ASSISTANT",
        "reason": "Apple documents FileVault enablement during Setup Assistant for managed Mac enrollment.",
        "reasonSource": "apple-manage-filevault-device-management",
    },
    {
        "platform": "MACOS",
        "sourceIds": ["apple-gatekeeper-runtime-protection-macos"],
        "title": "Keep Gatekeeper assessment enabled",
        "section": "Gatekeeper",
        "recommendedValue": True,
        "reason": "Apple documents Gatekeeper assessment as a macOS runtime protection.",
        "reasonSource": "apple-gatekeeper-runtime-protection-macos",
        "mapping": ("MACOS_SYSTEM_POLICY_CONTROL", {"enableAssessment": True}),
    },
    {
        "platform": "MACOS",
        "sourceIds": ["apple-gatekeeper-runtime-protection-macos"],
        "title": "Allow only identified developers and notarized apps",
        "section": "Gatekeeper",
        "recommendedValue": True,
        "reason": "Apple documents identified-developer and notarization checks as Gatekeeper protections.",
        "reasonSource": "apple-gatekeeper-runtime-protection-macos",
        "mapping": ("MACOS_SYSTEM_POLICY_CONTROL", {"allowIdentifiedDevelopers": True}),
    },
    {
        "platform": "MACOS",
        "sourceIds": ["apple-startup-security-macos"],
        "title": "Prefer full security on Apple silicon Macs",
        "section": "Startup security",
        "recommendedValue": "FULL_SECURITY",
        "reason": "Apple documents Full Security as the default startup-security mode for Apple silicon Macs.",
        "reasonSource": "apple-startup-security-macos",
    },
    {
        "platform": "MACOS",
        "sourceIds": ["apple-startup-security-macos"],
        "title": "Set a Recovery OS password to restrict recovery access",
        "section": "Startup security",
        "recommendedValue": "RECOVERY_LOCK",
        "reason": "Apple documents Recovery Lock for restricting Recovery OS access on Apple silicon Macs.",
        "reasonSource": "apple-startup-security-macos",
    },
    {
        "platform": "MACOS",
        "sourceIds": ["apple-startup-security-macos"],
        "title": "Use a firmware password on Intel Macs without Apple silicon",
        "section": "Startup security",
        "recommendedValue": "FIRMWARE_PASSWORD",
        "reason": "Apple documents firmware passwords for supported Intel Mac alternate-boot protection.",
        "reasonSource": "apple-startup-security-macos",
    },
    {
        "platform": "MACOS",
        "sourceIds": ["apple-device-management-deploy-software-updates"],
        "title": "Use software update declarations whenever possible",
        "section": "Software updates",
        "recommendedValue": "DECLARATIVE_DEVICE_MANAGEMENT",
        "reason": "Apple documents software-update declarations as the preferred resilient update-management model.",
        "reasonSource": "apple-device-management-deploy-software-updates",
    },
    {
        "platform": "MACOS",
        "sourceIds": ["apple-install-enforce-software-updates"],
        "title": "Require a minimum macOS version during Automated Device Enrollment",
        "section": "Software updates",
        "recommendedValue": "MINIMUM_ENROLLMENT_VERSION",
        "reason": "Apple documents minimum OS enforcement during Automated Device Enrollment.",
        "reasonSource": "apple-install-enforce-software-updates",
    },
    {
        "platform": "MACOS",
        "sourceIds": ["apple-install-enforce-software-updates"],
        "title": "Use time-based software update deferrals to phase rollout",
        "section": "Software updates",
        "recommendedValue": "DEFERRALS",
        "reason": "Apple documents time-based software-update deferrals for phased rollout.",
        "reasonSource": "apple-install-enforce-software-updates",
    },
    {
        "platform": "MACOS",
        "sourceIds": ["apple-install-enforce-software-updates"],
        "title": "Turn on automatic software update downloads",
        "section": "Software updates",
        "recommendedValue": "ALWAYS_ON",
        "reason": "Apple documents managed automatic software-update downloads.",
        "reasonSource": "apple-install-enforce-software-updates",
        "mapping": ("APPLE_SOFTWARE_UPDATE_SETTINGS", {"automaticActions": {"download": "ALWAYS_ON"}}),
    },
    {
        "platform": "MACOS",
        "sourceIds": ["apple-install-enforce-software-updates"],
        "title": "Turn on automatic macOS update installation",
        "section": "Software updates",
        "recommendedValue": "ALWAYS_ON",
        "reason": "Apple documents managed automatic macOS update installation.",
        "reasonSource": "apple-install-enforce-software-updates",
        "mapping": ("APPLE_SOFTWARE_UPDATE_SETTINGS", {"automaticActions": {"installOSUpdates": "ALWAYS_ON"}}),
    },
    {
        "platform": "MACOS",
        "sourceIds": ["apple-install-enforce-software-updates"],
        "title": "Turn on automatic security update installation",
        "section": "Software updates",
        "recommendedValue": "ALWAYS_ON",
        "reason": "Apple documents automatic security-update installation for XProtect, Gatekeeper, and system data files.",
        "reasonSource": "apple-install-enforce-software-updates",
        "mapping": ("APPLE_SOFTWARE_UPDATE_SETTINGS", {"automaticActions": {"installSecurityUpdate": "ALWAYS_ON"}}),
    },
    {
        "platform": "MACOS",
        "sourceIds": ["apple-activation-lock"],
        "title": "Enable Activation Lock for organization-owned Macs",
        "section": "Activation Lock",
        "recommendedValue": True,
        "reason": "Apple documents organization-linked Activation Lock for Apple School Manager and Apple Business Manager deployments.",
        "reasonSource": "apple-activation-lock",
        "mapping": ("APPLE_DEVICE_SETTINGS", {"allowActivationLock": True}),
    },
    {
        "platform": "MACOS",
        "sourceIds": ["apple-enforce-password-policies"],
        "title": "Enforce password policies through device management",
        "section": "Password policies",
        "recommendedValue": "MANAGED_PASSWORD_POLICIES",
        "reason": "Apple documents password policies enforced remotely through device management.",
        "reasonSource": "apple-enforce-password-policies",
    },
    {
        "platform": "MACOS",
        "sourceIds": ["apple-managed-device-attestation"],
        "title": "Use Managed Device Attestation for trust evaluation",
        "section": "Managed Device Attestation",
        "recommendedValue": "MANAGED_DEVICE_ATTESTATION",
        "reason": "Apple documents Managed Device Attestation as evidence for device trust evaluation.",
        "reasonSource": "apple-managed-device-attestation",
    },
]

WINDOWS_EXACT_BY_ID: dict[str, dict[str, Any]] = {
    "windows-0329-allowarchivescanning": {"type": "WINDOWS_ANTIVIRUS", "values": {"allowArchiveScanning": True}},
    "windows-0330-allowbehaviormonitoring": {"type": "WINDOWS_ANTIVIRUS", "values": {"allowBehaviorMonitoring": True}},
    "windows-0331-allowcloudprotection": {"type": "WINDOWS_ANTIVIRUS", "values": {"allowCloudProtection": True}},
    "windows-0334-allowrealtimemonitoring": {"type": "WINDOWS_ANTIVIRUS", "values": {"allowRealtimeMonitoring": True}},
    "windows-0336-allowscriptscanning": {"type": "WINDOWS_ANTIVIRUS", "values": {"allowScriptScanning": True}},
    "windows-0348-cloudblocklevel": {"type": "WINDOWS_ANTIVIRUS", "values": {"cloudBlockLevel": "HIGH"}},
    "windows-0353-enablenetworkprotection": {"type": "WINDOWS_ANTIVIRUS", "values": {"enableNetworkProtection": "ON"}},
    "windows-0357-puaprotection": {"type": "WINDOWS_ANTIVIRUS", "values": {"puaProtection": "ON"}},
    "windows-0359-realtimescandirection": {"type": "WINDOWS_ANTIVIRUS", "values": {"realTimeScanDirection": "ALL"}},
    "windows-0360-submitsamplesconsent": {"type": "WINDOWS_ANTIVIRUS", "values": {"submitSamplesConsent": "ALL"}},
    "windows-0373-enabledomainnetworkfirewall": {"type": "WINDOWS_FIREWALL", "values": {"domainProfile": {"profileType": "DOMAIN_PROFILE", "configureProfileProperties": True, "enableFirewall": True}}},
    "windows-0375-defaultoutboundaction": {"type": "WINDOWS_FIREWALL", "values": {"domainProfile": {"profileType": "DOMAIN_PROFILE", "configureProfileProperties": True, "allowDefaultOutboundAction": True}}},
    "windows-0377-disableinboundnotifications": {"type": "WINDOWS_FIREWALL", "values": {"domainProfile": {"profileType": "DOMAIN_PROFILE", "configureProfileProperties": True, "disableInboundNotifications": True}}},
    "windows-0379-defaultinboundactionfordomainprofile": {"type": "WINDOWS_FIREWALL", "values": {"domainProfile": {"profileType": "DOMAIN_PROFILE", "configureProfileProperties": True, "allowDefaultInboundAction": False}}},
    "windows-0380-enableprivatenetworkfirewall": {"type": "WINDOWS_FIREWALL", "values": {"privateProfile": {"profileType": "PRIVATE_PROFILE", "configureProfileProperties": True, "enableFirewall": True}}},
    "windows-0382-defaultinboundactionforprivateprofile": {"type": "WINDOWS_FIREWALL", "values": {"privateProfile": {"profileType": "PRIVATE_PROFILE", "configureProfileProperties": True, "allowDefaultInboundAction": False}}},
    "windows-0385-defaultoutboundaction": {"type": "WINDOWS_FIREWALL", "values": {"privateProfile": {"profileType": "PRIVATE_PROFILE", "configureProfileProperties": True, "allowDefaultOutboundAction": True}}},
    "windows-0386-disableinboundnotifications": {"type": "WINDOWS_FIREWALL", "values": {"privateProfile": {"profileType": "PRIVATE_PROFILE", "configureProfileProperties": True, "disableInboundNotifications": True}}},
    "windows-0387-enablepublicnetworkfirewall": {"type": "WINDOWS_FIREWALL", "values": {"publicProfile": {"profileType": "PUBLIC_PROFILE", "configureProfileProperties": True, "enableFirewall": True}}},
    "windows-0390-defaultoutboundaction": {"type": "WINDOWS_FIREWALL", "values": {"publicProfile": {"profileType": "PUBLIC_PROFILE", "configureProfileProperties": True, "allowDefaultOutboundAction": True}}},
    "windows-0391-disableinboundnotifications": {"type": "WINDOWS_FIREWALL", "values": {"publicProfile": {"profileType": "PUBLIC_PROFILE", "configureProfileProperties": True, "disableInboundNotifications": True}}},
    "windows-0392-defaultinboundactionforpublicprofile": {"type": "WINDOWS_FIREWALL", "values": {"publicProfile": {"profileType": "PUBLIC_PROFILE", "configureProfileProperties": True, "allowDefaultInboundAction": False}}},
    "windows-0418-accountslimitlocalaccountuseofblankpasswordstoco": {"type": "WINDOWS_LOCAL_DEVICE_SECURITY", "values": {"allowRemoteLogonWithoutPassword": False}},
    "windows-0420-interactivelogonsmartcardremovalbehavior": {"type": "WINDOWS_LOCAL_DEVICE_SECURITY", "values": {"smartCardRemovalBehavior": "LOCK_WORKSTATION"}},
    "windows-0432-useraccountcontrolbehavioroftheelevationpromptfo": {"type": "WINDOWS_LOCAL_DEVICE_SECURITY", "values": {"elevationPromptForAdmins": "PROMPT_CONSENT_SECURE_DESKTOP"}},
    "windows-0436-useraccountcontrolrunalladministratorsinadminapp": {"type": "WINDOWS_LOCAL_DEVICE_SECURITY", "values": {"runAllAdminsInAdminApprovalMode": True}},
    "windows-0437-useraccountcontroluseadminapprovalmode": {"type": "WINDOWS_LOCAL_DEVICE_SECURITY", "values": {"useAdminApprovalModeForAdminAcc": True}},
    "windows-0438-useraccountcontrolvirtualizefileandregistrywrite": {"type": "WINDOWS_LOCAL_DEVICE_SECURITY", "values": {"virtualizeFileRegistry": True}},
    "windows-0440-allowgamedvr": {"type": "WINDOWS_RESTRICTION", "values": {"allowGameDVR": False}},
}


class TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        text = " ".join(data.split())
        if text:
            self.parts.append(text)

    def text(self) -> str:
        return "\n".join(self.parts)


def main() -> None:
    parser = argparse.ArgumentParser(description="Harvest vendor guidance into the repo's normalized recommendation catalog.")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--offline", action="store_true", help="Use the checked-in downloads and derived artifacts.")
    mode.add_argument("--refresh", action="store_true", help="Download source bodies before rebuilding derived artifacts.")
    parser.add_argument("--output-root", type=Path, default=REPO_ROOT, help="Output repository root. Defaults to the current checkout.")
    args = parser.parse_args()

    output_root = args.output_root.resolve()
    output_vendor_dir = output_root / "example" / "vendor-references"
    if args.refresh:
        refresh_downloads(output_vendor_dir)
    elif output_root != REPO_ROOT:
        copy_downloads(output_vendor_dir)

    sources = read_json(VENDOR_DIR / "sources.json")
    field_index = build_setting_index()
    recommendations = normalize_recommendations("vendor", build_recommendations(field_index))
    write_json(output_vendor_dir / "sources.json", sources)
    write_json(output_vendor_dir / "downloads" / "derived" / "windows-25h2-intune-baseline.json", read_json(WINDOWS_BASELINE_PATH))
    write_json(output_vendor_dir / "downloads" / "derived" / "windows-24h2-policy-rules.json", read_json(WINDOWS_POLICY_RULES_PATH))
    write_json(output_vendor_dir / "downloads" / "derived" / "windows-24h2-workbook.json", read_json(WINDOWS_WORKBOOK_PATH))
    write_json(output_vendor_dir / "vendor-recommendations.json", recommendations)
    write_json(output_vendor_dir / "vendor-relution-baseline.json", build_baseline_summary(sources, recommendations))
    if output_root == REPO_ROOT:
        build_source_artifacts("vendor")
    update_readme(output_vendor_dir, sources, recommendations)


def copy_downloads(output_vendor_dir: Path) -> None:
    source_downloads = VENDOR_DIR / "downloads"
    target_downloads = output_vendor_dir / "downloads"
    if target_downloads.exists():
        shutil.rmtree(target_downloads)
    shutil.copytree(source_downloads, target_downloads)


def refresh_downloads(output_vendor_dir: Path) -> None:
    sources = read_json(VENDOR_DIR / "sources.json")
    output_vendor_dir.mkdir(parents=True, exist_ok=True)
    manifest = []
    for source in sources:
        source_id = safe_vendor_source_id(str(source["id"]))
        url = str(source["url"])
        validate_vendor_source_url(url)
        raw_suffix = ".zip" if url.lower().endswith(".zip") else ".html"
        raw_path = vendor_download_path(output_vendor_dir, "raw", f"{source_id}{raw_suffix}")
        headers_path = vendor_download_path(output_vendor_dir, "headers", f"{source_id}.headers.txt")
        text_path = vendor_download_path(output_vendor_dir, "text", f"{source_id}.txt")
        raw_path.parent.mkdir(parents=True, exist_ok=True)
        headers_path.parent.mkdir(parents=True, exist_ok=True)
        text_path.parent.mkdir(parents=True, exist_ok=True)

        request = Request(url, headers={"User-Agent": "relution-policy-workbench-vendor-harvester/1.0"})
        with urlopen(request, timeout=60) as response:
            validate_vendor_source_url(response.url)
            body = response.read(MAX_VENDOR_DOWNLOAD_BYTES + 1)
            if len(body) > MAX_VENDOR_DOWNLOAD_BYTES:
                raise ValueError(f"Vendor source {source_id} exceeds {MAX_VENDOR_DOWNLOAD_BYTES} bytes")
            headers = dict(response.headers.items())
            final_url = response.url
        if raw_suffix == ".html":
            body = redact_public_tokens(body)
        raw_path.write_bytes(body)
        headers_path.write_text("".join(f"{key}: {value}\n" for key, value in sorted(headers.items())), encoding="utf8")
        text_path.write_text(extract_text(raw_path, body), encoding="utf8")
        manifest.append(
            {
                "id": source_id,
                "url": url,
                "finalUrl": final_url,
                "localPath": relative_output_path(raw_path, output_vendor_dir),
                "headersPath": relative_output_path(headers_path, output_vendor_dir),
                "textPath": relative_output_path(text_path, output_vendor_dir),
                "contentType": headers.get("Content-Type", "application/octet-stream").split(";")[0],
                "sizeBytes": len(body),
                "sha256": hashlib.sha256(body).hexdigest(),
            }
        )
    write_json(output_vendor_dir / "downloads" / "manifest.json", manifest)


def safe_vendor_source_id(source_id: str) -> str:
    if not SAFE_SOURCE_ID_RE.fullmatch(source_id):
        raise ValueError(f"Unsafe vendor source id: {source_id}")
    return source_id


def vendor_download_path(output_vendor_dir: Path, subdir: str, file_name: str) -> Path:
    root = (output_vendor_dir / "downloads").resolve()
    target = (root / subdir / file_name).resolve()
    if target == root or root not in target.parents:
        raise ValueError(f"Vendor download path escapes output directory: {target}")
    return target


def validate_vendor_source_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError(f"Unsupported vendor source URL scheme: {parsed.scheme}")
    if parsed.hostname is None:
        raise ValueError(f"Vendor source URL is missing a hostname: {url}")
    for resolved_ip in resolved_vendor_url_ips(parsed.hostname):
        if resolved_ip.is_private or resolved_ip.is_loopback or resolved_ip.is_link_local or resolved_ip.is_multicast or resolved_ip.is_unspecified:
            raise ValueError(f"Vendor source URL resolves to a local or private address: {url}")


def resolved_vendor_url_ips(hostname: str) -> list[ipaddress.IPv4Address | ipaddress.IPv6Address]:
    try:
        return [ipaddress.ip_address(hostname)]
    except ValueError:
        pass
    addresses: list[ipaddress.IPv4Address | ipaddress.IPv6Address] = []
    for result in socket.getaddrinfo(hostname, None, type=socket.SOCK_STREAM):
        addresses.append(ipaddress.ip_address(result[4][0]))
    return addresses


def redact_public_tokens(body: bytes) -> bytes:
    redacted = body
    for pattern, replacement in PUBLIC_TOKEN_REDACTIONS:
        redacted = re.sub(pattern, replacement, redacted)
    return redacted


def extract_text(path: Path, body: bytes) -> str:
    if path.suffix == ".zip":
        return f"Binary ZIP archive saved at {path.name}."
    parser = TextExtractor()
    parser.feed(body.decode("utf8", errors="ignore"))
    return parser.text()


def build_recommendations(field_index: dict[str, list[dict[str, Any]]]) -> list[dict[str, Any]]:
    recommendations: list[dict[str, Any]] = []
    platform_counters = {"ANDROID": 0, "MACOS": 0}
    for guidance in CURATED_PLATFORM_GUIDANCE:
        platform = str(guidance["platform"])
        platform_counters[platform] += 1
        recommendations.append(build_curated_recommendation(guidance, platform_counters[platform], field_index))

    help_by_title = workbook_help_by_title()
    windows_rexp_evidence = load_windows_custom_csp_evidence(WINDOWS_REXP_EVIDENCE_PATH)
    for index, row in enumerate(read_json(WINDOWS_BASELINE_PATH), start=1):
        recommendations.append(build_windows_recommendation(index, row, help_by_title, field_index, windows_rexp_evidence))
    return recommendations


def build_curated_recommendation(guidance: dict[str, Any], index: int, field_index: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    platform = str(guidance["platform"])
    recommendation_id = f"{platform.lower()}-{index:03d}-{compact_slug(str(guidance['title']))}"
    semantic_evidence_sources = vendor_semantic_evidence_sources_for(
        recommendation_id,
        platform,
        str(guidance["title"]),
        str(guidance["section"]),
        str(guidance["reason"]),
        guidance["recommendedValue"],
    )
    semantic_concepts = semantic_concepts_for(platform, semantic_evidence_sources)
    semantic_candidates = semantic_candidates_for(platform, semantic_concepts)
    mapping = guidance.get("mapping")
    analog_mappings = []
    if not isinstance(mapping, tuple):
        analog_mappings = android_relution_analog_mappings_for(
            platform,
            str(guidance["title"]),
            guidance["recommendedValue"],
        )
    exact_mapping = mapping
    if not isinstance(exact_mapping, tuple) and analog_mappings and isinstance(analog_mappings[0].get("type"), str):
        exact_mapping = (analog_mappings[0]["type"], analog_mappings[0]["values"])
    candidates = shared_mapping_candidates(
        platform,
        str(guidance["title"]),
        str(guidance["section"]),
        field_index,
        exact_mapping,
        recommended_value=guidance["recommendedValue"],
        extra_texts=(str(guidance["reason"]),),
        allowed_kinds={"relution-native"},
    )
    matched_candidates = merge_candidate_lists(
        [candidate_from_native_mapping(entry) for entry in analog_mappings],
        [
            *candidates,
            *android_relution_candidates_for(platform, str(guidance["title"]), extra_texts=(str(guidance["reason"]),)),
        ],
    )
    candidates = merge_candidate_lists(matched_candidates, semantic_candidates)
    ruleset_mappings = []
    if isinstance(mapping, tuple):
        target_type, values = mapping
        ruleset_mappings.append({"kind": "relution-native", "type": target_type, "values": values})
    else:
        ruleset_mappings.extend(analog_mappings)
    semantic_metadata = semantic_metadata_for(semantic_evidence_sources, semantic_concepts)
    return {
        "id": recommendation_id,
        "platform": platform,
        "sourceIds": list(guidance["sourceIds"]),
        "title": guidance["title"],
        "section": guidance["section"],
        "recommendedValue": guidance["recommendedValue"],
        "reason": guidance["reason"],
        "reasonSource": guidance["reasonSource"],
        "vendor": {"guidanceModel": "equivalent-vendor-guidance-stack"},
        "relutionMapping": {
            "status": vendor_mapping_status(ruleset_mappings, matched_candidates, semantic_candidates),
            "mergeableInImportableRuleset": bool(ruleset_mappings),
            "candidates": candidates,
            "rulesetMappings": ruleset_mappings,
            "notes": [],
        },
        **semantic_metadata,
    }


def candidate_from_native_mapping(mapping: dict[str, Any]) -> dict[str, Any]:
    return {
        "kind": "relution-native",
        "target": str(mapping.get("type", "")),
        "fieldPaths": flatten_value_paths(mapping.get("values", {})),
        **({"match": mapping["match"]} if isinstance(mapping.get("match"), dict) else {}),
    }


def merge_candidate_lists(*candidate_groups: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    seen: set[tuple[str, str, tuple[str, ...]]] = set()
    for candidate in [candidate for group in candidate_groups for candidate in group]:
        key = (
            str(candidate.get("kind", "")),
            str(candidate.get("target", "")),
            tuple(str(path) for path in candidate.get("fieldPaths", [])),
        )
        if key in seen:
            continue
        seen.add(key)
        merged.append(candidate)
    return merged[:8]
