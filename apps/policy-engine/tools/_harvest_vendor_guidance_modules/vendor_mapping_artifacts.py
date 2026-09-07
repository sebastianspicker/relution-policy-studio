"""Vendor baseline and README artifact builders."""

from __future__ import annotations

import re
import shutil
from pathlib import Path
from typing import Any

from _harvest_vendor_guidance_modules.common import VENDOR_DIR, VENDOR_VERIFIED_AS_OF


def build_baseline_summary(
    sources: list[dict[str, Any]], recommendations: list[dict[str, Any]]
) -> dict[str, Any]:
    """Build the vendor baseline summary artifact."""

    counts: dict[str, int] = {}
    for recommendation in recommendations:
        platform = str(recommendation["platform"])
        counts[platform] = counts.get(platform, 0) + 1
    return {
        "verifiedAsOf": VENDOR_VERIFIED_AS_OF,
        "sourceIndexPath": "example/vendor-references/sources.json",
        "downloadManifestPath": "example/vendor-references/downloads/manifest.json",
        "guidanceModel": {
            "windows": {
                "model": "named-security-baseline",
                "currentPrimarySourceId": "microsoft-windows-11-25h2-security-baseline",
                "currentPrimaryVersion": "Windows 11 version 25H2",
                "currentPrimaryPublishedDate": "2025-09-30",
                "toolkitSourceId": "microsoft-security-compliance-toolkit-guide",
                "baselineLagContext": {
                    "currentWindowsReleaseSourceId": "microsoft-windows-11-release-information",
                    "currentWindowsRelease": "Windows 11 26H1",
                    "currentWindowsReleaseAvailableDate": "2026-02-10",
                    "note": (
                        "As verified on 2026-04-23, Microsoft's current Windows release "
                        "tracking page lists 26H1 as available, but the latest named "
                        "Windows client security baseline I verified remains the 25H2 "
                        "baseline package."
                    ),
                },
            },
            "android": {
                "model": "equivalent-vendor-guidance-stack",
                "currentPrimarySourceId": "google-android-enterprise-feature-list",
                "currentPrimaryVersion": "Android Enterprise feature list",
                "currentPrimaryPublishedDate": "2026-04-21",
                "supportingSourceIds": [
                    "google-android-management-security-posture",
                    "google-android-enterprise-system-updates",
                    "google-play-protect-managed-devices",
                    "google-android-enterprise-feature-drop-2025",
                    "google-android-security-best-practices",
                ],
                "note": (
                    "Google does not publish a single Microsoft-style Android enterprise baseline "
                    "package. This catalog uses an equivalent stack of official Android Enterprise "
                    "guidance."
                ),
            },
            "macos": {
                "model": "equivalent-vendor-guidance-stack",
                "currentPrimarySourceId": "apple-platform-deployment",
                "currentPrimaryVersion": "Apple Platform Deployment February 2026",
                "currentPrimaryPublishedDate": "2026-02",
                "supportingSourceIds": [
                    "apple-platform-deployment-whats-new",
                    "apple-platform-security",
                    "apple-startup-security-macos",
                    "apple-managing-filevault-macos",
                    "apple-gatekeeper-runtime-protection-macos",
                ],
                "note": (
                    "Apple does not publish a single Microsoft-style macOS security baseline "
                    "package. This catalog uses an equivalent stack of Apple Platform Deployment "
                    "and Apple Platform Security guidance."
                ),
            },
        },
        "platforms": {
            "windows": {
                "relutionPlatforms": ["WINDOWS"],
                "recommendationCount": counts.get("WINDOWS", 0),
                "vendorGuidance": source_roles(sources, "windows"),
            },
            "android": {
                "relutionPlatforms": ["ANDROID_ENTERPRISE"],
                "recommendationCount": counts.get("ANDROID", 0),
                "vendorGuidance": source_roles(sources, "android"),
            },
            "macos": {
                "relutionPlatforms": ["MACOS"],
                "recommendationCount": counts.get("MACOS", 0),
                "vendorGuidance": source_roles(sources, "macos"),
            },
        },
        "recommendationCatalogPath": "example/vendor-references/vendor-recommendations.json",
        "importableRulesetPath": "example/vendor-references/vendor-relution-ruleset.json",
        "settingBundleCatalogPath": (
            "example/vendor-references/vendor-relution-settings-catalog.json"
        ),
    }


def source_roles(sources: list[dict[str, Any]], scope: str) -> list[dict[str, str]]:
    """Return source ids and roles that apply to one guidance scope."""

    roles = []
    for source in sources:
        if scope in source.get("scope", []):
            roles.append(
                {
                    "sourceId": str(source["id"]),
                    "role": str(source.get("type", "reference")),
                }
            )
    return roles


def update_readme(
    output_vendor_dir: Path,
    sources: list[dict[str, Any]],
    recommendations: list[dict[str, Any]],
) -> None:
    """Refresh vendor README counts and harvester documentation bullets."""

    readme_path = output_vendor_dir / "README.md"
    source_readme_path = VENDOR_DIR / "README.md"
    if (
        not readme_path.exists()
        and output_vendor_dir != VENDOR_DIR
        and source_readme_path.exists()
    ):
        shutil.copy2(source_readme_path, readme_path)
    if not readme_path.exists():
        return
    counts: dict[str, int] = {}
    for recommendation in recommendations:
        platform = str(recommendation["platform"])
        counts[platform] = counts.get(platform, 0) + 1
    readme = readme_path.read_text(encoding="utf8")
    readme = re.sub(
        r"Sources harvested: `\d+`", f"Sources harvested: `{len(sources)}`", readme
    )
    readme = re.sub(
        r"Recommendations extracted: `\d+`",
        f"Recommendations extracted: `{len(recommendations)}`",
        readme,
    )
    for platform in ("WINDOWS", "ANDROID", "MACOS"):
        readme = re.sub(
            rf"`{platform}`: `\d+`",
            f"`{platform}`: `{counts.get(platform, 0)}`",
            readme,
        )
    if "tools/harvest_vendor_guidance.py" not in readme:
        readme = readme.replace(
            "This folder contains the current vendor-specific OS guidance corpus",
            "This folder contains the current vendor-specific OS guidance corpus",
        )
        readme = readme.replace(
            (
                "- `vendor-recommendations.json`: normalized recommendation catalog with reason "
                "text and Relution mapping metadata for every harvested recommendation."
            ),
            (
                "- `vendor-recommendations.json`: normalized recommendation catalog with reason "
                "text and Relution mapping metadata for every harvested recommendation.\n"
                "- `tools/harvest_vendor_guidance.py`: repo-local stdlib harvester that can "
                "regenerate vendor source artifacts offline from saved downloads and derived "
                "baseline rows."
            ),
        )
    readme_path.write_text(readme, encoding="utf8")
