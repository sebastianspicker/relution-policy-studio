#!/usr/bin/env python3
"""Harvest vendor guidance into normalized recommendation source catalogs."""

from __future__ import annotations

import argparse
from html.parser import HTMLParser
import hashlib
import ipaddress
import re
import shutil
import socket
import sys
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from urllib.request import Request, build_opener

from build_relution_import_artifacts import (
    build_source_artifacts,
    manual_promotions_by_recommendation,
    normalize_recommendations,
)
from recommendation_mapping import (
    android_relution_analog_mappings_for,
    android_relution_candidates_for,
    build_setting_index,
    candidate_from_mapping,
    load_windows_custom_csp_evidence,
    mapping_candidates as shared_mapping_candidates,
    semantic_candidates_for,
    semantic_concepts_for,
)
from _harvest_vendor_guidance_modules.common import (
    REPO_ROOT,
    SAFE_SOURCE_ID_RE,
    VENDOR_DIR,
    WINDOWS_WORKBOOK_PATH,
    merge_candidate_lists,
)
from _harvest_vendor_guidance_modules.vendor_mapping_rules import (
    build_baseline_summary,
    build_windows_recommendation,
    compact_slug,
    read_json,
    relative_output_path,
    semantic_metadata_for,
    update_readme,
    vendor_relution_mapping,
    vendor_semantic_evidence_sources_for,
    workbook_help_by_title,
    write_json,
)

sys.dont_write_bytecode = True


WINDOWS_BASELINE_PATH = (
    VENDOR_DIR / "downloads" / "derived" / "windows-25h2-intune-baseline.json"
)
WINDOWS_POLICY_RULES_PATH = (
    VENDOR_DIR / "downloads" / "derived" / "windows-24h2-policy-rules.json"
)
WINDOWS_REXP_EVIDENCE_PATH = (
    VENDOR_DIR / "downloads" / "derived" / "windows-relution-csp-evidence.json"
)

PUBLIC_TOKEN_REDACTIONS: tuple[tuple[bytes, bytes], ...] = (
    (rb"AIza[0-9A-Za-z_-]{30,45}", b"[REDACTED_GOOGLE_API_KEY]"),
    (rb"pk_live_[0-9A-Za-z]{40,120}", b"[REDACTED_STRIPE_PUBLISHABLE_KEY]"),
)
MAX_VENDOR_DOWNLOAD_BYTES = 25 * 1024 * 1024

CURATED_PLATFORM_GUIDANCE: list[dict[str, Any]] = [
    {
        "platform": "ANDROID",
        "sourceIds": ["google-play-protect-managed-devices"],
        "title": "Enforce Google Play Protect on managed devices",
        "section": "Malware protection",
        "recommendedValue": "VERIFY_APPS_ENFORCED",
        "reason": (
            "Google documents managed enforcement of Google Play Protect and harmful-app "
            "detection."
        ),
        "reasonSource": "google-play-protect-managed-devices",
        "mapping": (
            "ANDROID_ENTERPRISE_ADVANCED_SECURITY_OVERRIDES",
            {"googlePlayProtectVerifyApps": "VERIFY_APPS_ENFORCED"},
        ),
    },
    {
        "platform": "ANDROID",
        "sourceIds": ["google-android-enterprise-feature-list"],
        "title": "Block installation from unknown sources by default",
        "section": "Default security policies",
        "recommendedValue": "DISALLOW_INSTALL",
        "reason": (
            "Google lists blocking installation from unknown sources as a default Android "
            "Enterprise security policy."
        ),
        "reasonSource": "google-android-enterprise-feature-list",
        "mapping": (
            "ANDROID_ENTERPRISE_ADVANCED_SECURITY_OVERRIDES",
            {"untrustedAppsPolicy": "DISALLOW_INSTALL"},
        ),
    },
    {
        "platform": "ANDROID",
        "sourceIds": ["google-android-enterprise-feature-list"],
        "title": "Block debugging features by default",
        "section": "Default security policies",
        "recommendedValue": "DEVELOPER_SETTINGS_DISABLED",
        "reason": (
            "Google lists blocked debugging features as a default Android Enterprise "
            "security policy."
        ),
        "reasonSource": "google-android-enterprise-feature-list",
        "mapping": (
            "ANDROID_ENTERPRISE_ADVANCED_SECURITY_OVERRIDES",
            {"developerSettings": "DEVELOPER_SETTINGS_DISABLED"},
        ),
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
        "mapping": (
            "ANDROID_ENTERPRISE_ADVANCED_SECURITY_OVERRIDES",
            {"googlePlayProtectVerifyApps": "VERIFY_APPS_ENFORCED"},
        ),
    },
    {
        "platform": "ANDROID",
        "sourceIds": ["google-android-enterprise-feature-list"],
        "title": "Use compliance enforcement when devices fall out of policy",
        "section": "Compliance enforcement",
        "recommendedValue": "ENFORCE_COMPLIANCE_ACTIONS",
        "reason": (
            "Google describes compliance rules that restrict work-resource access when "
            "managed devices fall out of policy."
        ),
        "reasonSource": "google-android-enterprise-feature-list",
    },
    {
        "platform": "ANDROID",
        "sourceIds": ["google-android-enterprise-system-updates"],
        "title": "Use compliance policies to keep devices current",
        "section": "System updates",
        "recommendedValue": "COMPLIANCE_POLICIES",
        "reason": (
            "Google recommends compliance policies for keeping managed devices current in "
            "common knowledge-worker deployments."
        ),
        "reasonSource": "google-android-enterprise-system-updates",
    },
    {
        "platform": "ANDROID",
        "sourceIds": [
            "google-android-enterprise-system-updates",
            "google-android-enterprise-feature-list",
        ],
        "title": "Offer automatic OTA system updates",
        "section": "System update policy",
        "recommendedValue": "AUTOMATIC",
        "reason": (
            "Google documents AUTOMATIC as installing system updates as soon as they are "
            "available."
        ),
        "reasonSource": "google-android-enterprise-system-updates",
        "mapping": (
            "ANDROID_ENTERPRISE_SYSTEM_UPDATE",
            {"systemUpdateType": "AUTOMATIC"},
        ),
    },
    {
        "platform": "ANDROID",
        "sourceIds": [
            "google-android-enterprise-system-updates",
            "google-android-enterprise-feature-list",
        ],
        "title": "Use a maintenance window for OTA system updates",
        "section": "System update policy",
        "recommendedValue": "WINDOWED",
        "reason": (
            "Google documents WINDOWED as installing system updates during a daily "
            "maintenance window."
        ),
        "reasonSource": "google-android-enterprise-system-updates",
        "mapping": (
            "ANDROID_ENTERPRISE_SYSTEM_UPDATE",
            {"systemUpdateType": "WINDOWED"},
        ),
    },
    {
        "platform": "ANDROID",
        "sourceIds": [
            "google-android-enterprise-system-updates",
            "google-android-enterprise-feature-list",
        ],
        "title": "Postpone OTA system updates for up to 30 days",
        "section": "System update policy",
        "recommendedValue": "POSTPONE",
        "reason": "Google documents POSTPONE as delaying system updates for up to 30 days.",
        "reasonSource": "google-android-enterprise-system-updates",
        "mapping": (
            "ANDROID_ENTERPRISE_SYSTEM_UPDATE",
            {"systemUpdateType": "POSTPONE"},
        ),
    },
    {
        "platform": "ANDROID",
        "sourceIds": [
            "google-android-enterprise-system-updates",
            "google-android-enterprise-feature-list",
        ],
        "title": "Configure annual freeze periods for update blackout windows",
        "section": "Advanced system update policy",
        "recommendedValue": "FREEZE_PERIODS",
        "reason": (
            "Google documents annual system-update freeze periods for planned blackout "
            "windows."
        ),
        "reasonSource": "google-android-enterprise-system-updates",
    },
    {
        "platform": "ANDROID",
        "sourceIds": ["google-android-enterprise-feature-list"],
        "title": "Enforce automatic date and time settings",
        "section": "System clock management",
        "recommendedValue": "AUTO_DATE_AND_TIME_ZONE_ENFORCED",
        "reason": (
            "Google documents policy enforcement for automatic date, time, and time-zone "
            "settings."
        ),
        "reasonSource": "google-android-enterprise-feature-list",
        "mapping": (
            "ANDROID_ENTERPRISE_RESTRICTION",
            {"androidAutoDateAndTimeZoneSetting": "AUTO_DATE_AND_TIME_ZONE_ENFORCED"},
        ),
    },
    {
        "platform": "ANDROID",
        "sourceIds": ["google-android-enterprise-feature-list"],
        "title": "Require a separate work profile security challenge",
        "section": "Work security challenge",
        "recommendedValue": "REQUIRE_SEPARATE_WORK_LOCK",
        "reason": (
            "Google documents a separate work-profile security challenge for work data "
            "isolation."
        ),
        "reasonSource": "google-android-enterprise-feature-list",
        "mapping": (
            "ANDROID_ENTERPRISE_WORK_PROFILE_PASSCODE",
            {"unifiedLockSettings": "REQUIRE_SEPARATE_WORK_LOCK"},
        ),
    },
    {
        "platform": "ANDROID",
        "sourceIds": ["google-android-enterprise-feature-list"],
        "title": "Use a managed device security challenge",
        "section": "Device security challenge",
        "recommendedValue": "PASSWORD_COMPLEXITY_POLICY",
        "reason": (
            "Google documents managed password-complexity policy for device security "
            "challenges."
        ),
        "reasonSource": "google-android-enterprise-feature-list",
    },
    {
        "platform": "ANDROID",
        "sourceIds": ["google-android-management-security-posture"],
        "title": "Wait for HBKA reissuance when posture is unspecified",
        "section": "Security posture",
        "recommendedValue": "RETRY_HBKA",
        "reason": (
            "Google's posture guidance treats unspecified hardware-backed key attestation "
            "as a retryable state."
        ),
        "reasonSource": "google-android-management-security-posture",
    },
    {
        "platform": "ANDROID",
        "sourceIds": ["google-android-management-security-posture"],
        "title": "Lock the bootloader when unknown OS is reported",
        "section": "Security posture",
        "recommendedValue": "LOCK_BOOTLOADER",
        "reason": (
            "Google's posture guidance calls out locked bootloader state as a security "
            "signal."
        ),
        "reasonSource": "google-android-management-security-posture",
    },
    {
        "platform": "ANDROID",
        "sourceIds": ["google-android-enterprise-feature-drop-2025"],
        "title": "Enable Advanced Protection for high-risk users when available",
        "section": "Advanced protection",
        "recommendedValue": "ADVANCED_PROTECTION",
        "reason": (
            "Google documents Android Enterprise Advanced Protection controls for high-risk "
            "users."
        ),
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
        "reason": (
            "Google documents immediate app auto-update behavior through managed Play "
            "policy."
        ),
        "reasonSource": "google-android-enterprise-feature-list",
        "mapping": (
            "ANDROID_ENTERPRISE_PLAY_STORE_MANAGEMENT",
            {"appAutoUpdatePolicy": "ALWAYS"},
        ),
    },
    {
        "platform": "MACOS",
        "sourceIds": [
            "apple-managing-filevault-macos",
            "apple-manage-filevault-device-management",
        ],
        "title": "Enable FileVault on managed Macs",
        "section": "FileVault",
        "recommendedValue": "ON",
        "reason": (
            "Apple documents FileVault as built-in full-volume encryption for managed Mac "
            "computers."
        ),
        "reasonSource": "apple-managing-filevault-macos",
        "mapping": ("MACOS_FILE_VAULT", {"fdeFileVault": {"enable": "ON"}}),
    },
    {
        "platform": "MACOS",
        "sourceIds": [
            "apple-managing-filevault-macos",
            "apple-manage-filevault-device-management",
        ],
        "title": "Escrow a personal recovery key for FileVault",
        "section": "FileVault",
        "recommendedValue": "PERSONAL_RECOVERY_KEY_ESCROW",
        "reason": "Apple documents device-management escrow of FileVault personal recovery keys.",
        "reasonSource": "apple-managing-filevault-macos",
        "mapping": (
            "MACOS_FILE_VAULT",
            {"enableRecoveryKeyEscrow": True, "fdeFileVault": {"useRecoveryKey": True}},
        ),
    },
    {
        "platform": "MACOS",
        "sourceIds": ["apple-managing-filevault-macos"],
        "title": "Prefer a personal recovery key over an institutional recovery key",
        "section": "FileVault",
        "recommendedValue": "USE_PRK_NOT_IRK",
        "reason": (
            "Apple positions personal recovery keys as the current managed FileVault "
            "recovery-key workflow."
        ),
        "reasonSource": "apple-managing-filevault-macos",
        "mapping": (
            "MACOS_FILE_VAULT",
            {"enableRecoveryKeyEscrow": True, "fdeFileVault": {"useRecoveryKey": True}},
        ),
    },
    {
        "platform": "MACOS",
        "sourceIds": [
            "apple-managing-filevault-macos",
            "apple-manage-filevault-device-management",
        ],
        "title": "Use bootstrap tokens for managed FileVault workflows",
        "section": "FileVault",
        "recommendedValue": "BOOTSTRAP_TOKEN",
        "reason": (
            "Apple documents Bootstrap Token as support for Secure Token and managed "
            "FileVault workflows."
        ),
        "reasonSource": "apple-managing-filevault-macos",
    },
    {
        "platform": "MACOS",
        "sourceIds": ["apple-manage-filevault-device-management"],
        "title": "Require FileVault during Setup Assistant",
        "section": "FileVault",
        "recommendedValue": "FORCE_ENABLE_IN_SETUP_ASSISTANT",
        "reason": (
            "Apple documents FileVault enablement during Setup Assistant for managed Mac "
            "enrollment."
        ),
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
        "reason": (
            "Apple documents identified-developer and notarization checks as Gatekeeper "
            "protections."
        ),
        "reasonSource": "apple-gatekeeper-runtime-protection-macos",
        "mapping": ("MACOS_SYSTEM_POLICY_CONTROL", {"allowIdentifiedDevelopers": True}),
    },
    {
        "platform": "MACOS",
        "sourceIds": ["apple-startup-security-macos"],
        "title": "Prefer full security on Apple silicon Macs",
        "section": "Startup security",
        "recommendedValue": "FULL_SECURITY",
        "reason": (
            "Apple documents Full Security as the default startup-security mode for Apple "
            "silicon Macs."
        ),
        "reasonSource": "apple-startup-security-macos",
    },
    {
        "platform": "MACOS",
        "sourceIds": ["apple-startup-security-macos"],
        "title": "Set a Recovery OS password to restrict recovery access",
        "section": "Startup security",
        "recommendedValue": "RECOVERY_LOCK",
        "reason": (
            "Apple documents Recovery Lock for restricting Recovery OS access on Apple "
            "silicon Macs."
        ),
        "reasonSource": "apple-startup-security-macos",
    },
    {
        "platform": "MACOS",
        "sourceIds": ["apple-startup-security-macos"],
        "title": "Use a firmware password on Intel Macs without Apple silicon",
        "section": "Startup security",
        "recommendedValue": "FIRMWARE_PASSWORD",
        "reason": (
            "Apple documents firmware passwords for supported Intel Mac alternate-boot "
            "protection."
        ),
        "reasonSource": "apple-startup-security-macos",
    },
    {
        "platform": "MACOS",
        "sourceIds": ["apple-device-management-deploy-software-updates"],
        "title": "Use software update declarations whenever possible",
        "section": "Software updates",
        "recommendedValue": "DECLARATIVE_DEVICE_MANAGEMENT",
        "reason": (
            "Apple documents software-update declarations as the preferred resilient "
            "update-management model."
        ),
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
        "mapping": (
            "APPLE_SOFTWARE_UPDATE_SETTINGS",
            {"automaticActions": {"download": "ALWAYS_ON"}},
        ),
    },
    {
        "platform": "MACOS",
        "sourceIds": ["apple-install-enforce-software-updates"],
        "title": "Turn on automatic macOS update installation",
        "section": "Software updates",
        "recommendedValue": "ALWAYS_ON",
        "reason": "Apple documents managed automatic macOS update installation.",
        "reasonSource": "apple-install-enforce-software-updates",
        "mapping": (
            "APPLE_SOFTWARE_UPDATE_SETTINGS",
            {"automaticActions": {"installOSUpdates": "ALWAYS_ON"}},
        ),
    },
    {
        "platform": "MACOS",
        "sourceIds": ["apple-install-enforce-software-updates"],
        "title": "Turn on automatic security update installation",
        "section": "Software updates",
        "recommendedValue": "ALWAYS_ON",
        "reason": (
            "Apple documents automatic security-update installation for XProtect, "
            "Gatekeeper, and system data files."
        ),
        "reasonSource": "apple-install-enforce-software-updates",
        "mapping": (
            "APPLE_SOFTWARE_UPDATE_SETTINGS",
            {"automaticActions": {"installSecurityUpdate": "ALWAYS_ON"}},
        ),
    },
    {
        "platform": "MACOS",
        "sourceIds": ["apple-activation-lock"],
        "title": "Enable Activation Lock for organization-owned Macs",
        "section": "Activation Lock",
        "recommendedValue": True,
        "reason": (
            "Apple documents organization-linked Activation Lock for Apple School Manager "
            "and Apple Business Manager deployments."
        ),
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
        "reason": (
            "Apple documents Managed Device Attestation as evidence for device trust "
            "evaluation."
        ),
        "reasonSource": "apple-managed-device-attestation",
    },
]


class TextExtractor(HTMLParser):
    """Collect normalized text content from downloaded vendor HTML."""

    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        text = " ".join(data.split())
        if text:
            self.parts.append(text)

    def text(self) -> str:
        """Return the collected HTML text as newline-separated normalized chunks."""
        return "\n".join(self.parts)


def main() -> None:
    """Run the vendor guidance harvester in offline or refresh mode."""
    parser = argparse.ArgumentParser(
        description="Harvest vendor guidance into the repo's normalized recommendation catalog."
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--offline",
        action="store_true",
        help="Use the checked-in downloads and derived artifacts.",
    )
    mode.add_argument(
        "--refresh",
        action="store_true",
        help="Download source bodies before rebuilding derived artifacts.",
    )
    parser.add_argument(
        "--output-root",
        type=Path,
        default=REPO_ROOT,
        help="Output repository root. Defaults to the current checkout.",
    )
    args = parser.parse_args()

    output_root = args.output_root.resolve()
    output_vendor_dir = output_root / "example" / "vendor-references"
    if args.refresh:
        refresh_downloads(output_vendor_dir)
    elif output_root != REPO_ROOT:
        copy_downloads(output_vendor_dir)

    sources = read_json(VENDOR_DIR / "sources.json")
    field_index = build_setting_index()
    recommendations = normalize_recommendations(
        "vendor",
        build_recommendations(field_index),
        get_promotions=manual_promotions_by_recommendation,
    )
    write_json(output_vendor_dir / "sources.json", sources)
    write_json(
        output_vendor_dir
        / "downloads"
        / "derived"
        / "windows-25h2-intune-baseline.json",
        read_json(WINDOWS_BASELINE_PATH),
    )
    write_json(
        output_vendor_dir / "downloads" / "derived" / "windows-24h2-policy-rules.json",
        read_json(WINDOWS_POLICY_RULES_PATH),
    )
    write_json(
        output_vendor_dir / "downloads" / "derived" / "windows-24h2-workbook.json",
        read_json(WINDOWS_WORKBOOK_PATH),
    )
    write_json(output_vendor_dir / "vendor-recommendations.json", recommendations)
    write_json(
        output_vendor_dir / "vendor-relution-baseline.json",
        build_baseline_summary(sources, recommendations),
    )
    if output_root == REPO_ROOT:
        build_source_artifacts("vendor")
    update_readme(output_vendor_dir, sources, recommendations)


def copy_downloads(output_vendor_dir: Path) -> None:
    """Copy checked-in vendor downloads into an alternate output tree."""
    source_downloads = VENDOR_DIR / "downloads"
    target_downloads = output_vendor_dir / "downloads"
    if target_downloads.exists():
        shutil.rmtree(target_downloads)
    shutil.copytree(source_downloads, target_downloads)


def refresh_downloads(output_vendor_dir: Path) -> None:
    """Refresh all configured vendor source downloads and write a manifest."""
    sources = read_json(VENDOR_DIR / "sources.json")
    output_vendor_dir.mkdir(parents=True, exist_ok=True)
    manifest = []
    for source in sources:
        manifest.append(refresh_vendor_source(source, output_vendor_dir))
    write_json(output_vendor_dir / "downloads" / "manifest.json", manifest)


def refresh_vendor_source(
    source: dict[str, Any], output_vendor_dir: Path
) -> dict[str, Any]:
    """Download one vendor source and return its manifest entry."""
    source_id = safe_vendor_source_id(str(source["id"]))
    url = str(source["url"])
    raw_path, headers_path, text_path = vendor_source_output_paths(
        output_vendor_dir, source_id, url
    )
    body, headers, final_url = download_vendor_source(source_id, url)
    if raw_path.suffix == ".html":
        body = redact_public_tokens(body)
    raw_path.write_bytes(body)
    headers_path.write_text(
        "".join(f"{key}: {value}\n" for key, value in sorted(headers.items())),
        encoding="utf8",
    )
    text_path.write_text(extract_text(raw_path, body), encoding="utf8")
    return {
        "id": source_id,
        "url": url,
        "finalUrl": final_url,
        "localPath": relative_output_path(raw_path, output_vendor_dir),
        "headersPath": relative_output_path(headers_path, output_vendor_dir),
        "textPath": relative_output_path(text_path, output_vendor_dir),
        "contentType": headers.get("Content-Type", "application/octet-stream").split(
            ";"
        )[0],
        "sizeBytes": len(body),
        "sha256": hashlib.sha256(body).hexdigest(),
    }


def vendor_source_output_paths(
    output_vendor_dir: Path, source_id: str, url: str
) -> tuple[Path, Path, Path]:
    """Return confined raw, header, and text paths for a vendor source."""
    validate_vendor_source_url(url)
    raw_suffix = ".zip" if url.lower().endswith(".zip") else ".html"
    paths = (
        vendor_download_path(output_vendor_dir, "raw", f"{source_id}{raw_suffix}"),
        vendor_download_path(output_vendor_dir, "headers", f"{source_id}.headers.txt"),
        vendor_download_path(output_vendor_dir, "text", f"{source_id}.txt"),
    )
    for path in paths:
        path.parent.mkdir(parents=True, exist_ok=True)
    return paths


def download_vendor_source(
    source_id: str, url: str
) -> tuple[bytes, dict[str, str], str]:
    """Download a trusted vendor URL with size and final-URL validation."""
    request = trusted_vendor_source_request(url)
    with build_opener().open(request, timeout=60) as response:
        validate_vendor_source_url(response.url)
        body = response.read(MAX_VENDOR_DOWNLOAD_BYTES + 1)
        if len(body) > MAX_VENDOR_DOWNLOAD_BYTES:
            raise ValueError(
                f"Vendor source {source_id} exceeds {MAX_VENDOR_DOWNLOAD_BYTES} bytes"
            )
        return body, dict(response.headers.items()), response.url


def safe_vendor_source_id(source_id: str) -> str:
    """Validate a source id before using it in output file names."""
    if not SAFE_SOURCE_ID_RE.fullmatch(source_id):
        raise ValueError(f"Unsafe vendor source id: {source_id}")
    return source_id


def vendor_download_path(output_vendor_dir: Path, subdir: str, file_name: str) -> Path:
    """Build a download output path that cannot escape the downloads root."""
    root = (output_vendor_dir / "downloads").resolve()
    target = (root / subdir / file_name).resolve()
    if target == root or root not in target.parents:
        raise ValueError(f"Vendor download path escapes output directory: {target}")
    return target


def validate_vendor_source_url(url: str) -> None:
    """Reject unsupported, hostless, local, or private vendor source URLs."""
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError(f"Unsupported vendor source URL scheme: {parsed.scheme}")
    if parsed.hostname is None:
        raise ValueError(f"Vendor source URL is missing a hostname: {url}")
    for resolved_ip in resolved_vendor_url_ips(parsed.hostname):
        if (
            resolved_ip.is_private
            or resolved_ip.is_loopback
            or resolved_ip.is_link_local
            or resolved_ip.is_multicast
            or resolved_ip.is_unspecified
        ):
            raise ValueError(
                f"Vendor source URL resolves to a local or private address: {url}"
            )


def trusted_vendor_source_request(url: str) -> Request:
    """Build a request for a validated vendor source URL."""
    validate_vendor_source_url(url)
    return Request(
        url, headers={"User-Agent": "relution-policy-workbench-vendor-harvester/1.0"}
    )


def resolved_vendor_url_ips(
    hostname: str,
) -> list[ipaddress.IPv4Address | ipaddress.IPv6Address]:
    """Resolve a hostname or literal IP for outbound vendor URL safety checks."""
    try:
        return [ipaddress.ip_address(hostname)]
    except ValueError:
        pass
    addresses: list[ipaddress.IPv4Address | ipaddress.IPv6Address] = []
    for result in socket.getaddrinfo(hostname, None, type=socket.SOCK_STREAM):
        addresses.append(ipaddress.ip_address(result[4][0]))
    return addresses


def redact_public_tokens(body: bytes) -> bytes:
    """Replace public token-shaped values in downloaded HTML before committing it."""
    redacted = body
    for pattern, replacement in PUBLIC_TOKEN_REDACTIONS:
        redacted = re.sub(pattern, replacement, redacted)
    return redacted


def extract_text(path: Path, body: bytes) -> str:
    """Extract searchable text from a downloaded source body."""
    if path.suffix == ".zip":
        return f"Binary ZIP archive saved at {path.name}."
    parser = TextExtractor()
    parser.feed(body.decode("utf8", errors="ignore"))
    return parser.text()


def build_recommendations(
    field_index: dict[str, list[dict[str, Any]]],
) -> list[dict[str, Any]]:
    """Build curated Android/macOS and Windows vendor recommendations."""
    recommendations: list[dict[str, Any]] = []
    platform_counters = {"ANDROID": 0, "MACOS": 0}
    for guidance in CURATED_PLATFORM_GUIDANCE:
        platform = str(guidance["platform"])
        platform_counters[platform] += 1
        recommendations.append(
            build_curated_recommendation(
                guidance, platform_counters[platform], field_index
            )
        )

    help_by_title = workbook_help_by_title()
    windows_rexp_evidence = load_windows_custom_csp_evidence(WINDOWS_REXP_EVIDENCE_PATH)
    for index, row in enumerate(read_json(WINDOWS_BASELINE_PATH), start=1):
        recommendations.append(
            build_windows_recommendation(
                index, row, help_by_title, field_index, windows_rexp_evidence
            )
        )
    return recommendations


def build_curated_recommendation(
    guidance: dict[str, Any], index: int, field_index: dict[str, list[dict[str, Any]]]
) -> dict[str, Any]:
    """Convert one curated vendor guidance row into a normalized recommendation."""
    platform = str(guidance["platform"])
    recommendation_id = (
        f"{platform.lower()}-{index:03d}-{compact_slug(str(guidance['title']))}"
    )
    semantic_context = vendor_semantic_context(recommendation_id, platform, guidance)
    mapping_context = curated_mapping_context(
        platform, guidance, field_index, semantic_context["semanticCandidates"]
    )
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
        "relutionMapping": vendor_relution_mapping(
            mapping_context["rulesetMappings"],
            mapping_context["matchedCandidates"],
            semantic_context["semanticCandidates"],
            mapping_context["candidates"],
        ),
        **semantic_context["semanticMetadata"],
    }


def vendor_semantic_context(
    recommendation_id: str, platform: str, guidance: dict[str, Any]
) -> dict[str, Any]:
    """Build semantic candidates and metadata for a curated vendor row."""
    semantic_evidence_sources = vendor_semantic_evidence_sources_for(
        recommendation_id,
        {
            "platform": platform,
            "title": str(guidance["title"]),
            "section": str(guidance["section"]),
            "reason": str(guidance["reason"]),
            "recommendedValue": guidance["recommendedValue"],
        },
    )
    semantic_concepts = semantic_concepts_for(platform, semantic_evidence_sources)
    return {
        "semanticCandidates": semantic_candidates_for(platform, semantic_concepts),
        "semanticMetadata": semantic_metadata_for(
            semantic_evidence_sources, semantic_concepts
        ),
    }


def curated_mapping_context(
    platform: str,
    guidance: dict[str, Any],
    field_index: dict[str, list[dict[str, Any]]],
    semantic_candidates: list[dict[str, Any]],
) -> dict[str, Any]:
    """Resolve exact, analog, and semantic mapping candidates for guidance."""
    mapping = guidance.get("mapping")
    analog_mappings = vendor_analog_mappings(platform, guidance, mapping)
    exact_mapping = vendor_exact_mapping(mapping, analog_mappings)
    candidates = shared_mapping_candidates(
        platform,
        str(guidance["title"]),
        str(guidance["section"]),
        field_index,
        {
            "exactMapping": exact_mapping,
            "recommendedValue": guidance["recommendedValue"],
            "extraTexts": (str(guidance["reason"]),),
            "allowedKinds": {"relution-native"},
        },
    )
    matched_candidates = merge_candidate_lists(
        [candidate_from_mapping(entry) for entry in analog_mappings],
        [
            *candidates,
            *android_relution_candidates_for(
                platform, str(guidance["title"]), extra_texts=(str(guidance["reason"]),)
            ),
        ],
    )
    return {
        "matchedCandidates": matched_candidates,
        "candidates": merge_candidate_lists(matched_candidates, semantic_candidates),
        "rulesetMappings": vendor_ruleset_mappings(mapping, analog_mappings),
    }


def vendor_analog_mappings(
    platform: str, guidance: dict[str, Any], mapping: Any
) -> list[dict[str, Any]]:
    """Return Android analog mappings when no exact curated tuple is present."""
    if isinstance(mapping, tuple):
        return []
    return android_relution_analog_mappings_for(
        platform,
        str(guidance["title"]),
        guidance["recommendedValue"],
    )


def vendor_exact_mapping(mapping: Any, analog_mappings: list[dict[str, Any]]) -> Any:
    """Select the exact mapping tuple from curated or analog evidence."""
    if isinstance(mapping, tuple):
        return mapping
    if analog_mappings and isinstance(analog_mappings[0].get("type"), str):
        return analog_mappings[0]["type"], analog_mappings[0]["values"]
    return mapping


def vendor_ruleset_mappings(
    mapping: Any, analog_mappings: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Return ruleset-ready mapping rows for curated or analog vendor mappings."""
    if isinstance(mapping, tuple):
        target_type, values = mapping
        return [{"kind": "relution-native", "type": target_type, "values": values}]
    return list(analog_mappings)
