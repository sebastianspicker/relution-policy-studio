"""Write CIS benchmark mapping summaries and README sections."""

from __future__ import annotations

from typing import Any

from _harvest_cis_benchmarks_modules.common import BENCHMARKS, README_PATH


def build_baseline_summary(
    sources: dict[str, dict[str, Any]], recommendations: list[dict[str, Any]]
) -> dict[str, Any]:
    """Build the CIS baseline summary from source metadata and recommendations."""

    current_families = {
        "windows": {
            "familySourceId": "cis-windows-desktop-family",
            "currentVersions": sources["cis-windows-desktop-family"][
                "current_versions"
            ],
        },
        "android": {
            "familySourceId": "cis-google-android-family",
            "currentVersions": sources["cis-google-android-family"]["current_versions"],
        },
        "ios": {
            "familySourceId": "cis-apple-ios-family",
            "currentVersions": sources["cis-apple-ios-family"]["current_versions"],
        },
        "macos": {
            "familySourceId": "cis-apple-macos-family",
            "currentVersions": sources["cis-apple-macos-family"]["current_versions"],
        },
    }
    recommendation_counts: dict[str, int] = {}
    helper_fallback_counts: dict[str, Any] = {
        "total": 0,
        "byPlatform": {},
        "byMethod": {},
    }
    for recommendation in recommendations:
        recommendation_counts[recommendation["platform"]] = (
            recommendation_counts.get(recommendation["platform"], 0) + 1
        )
        for fallback in recommendation.get("fallbackTranslations", []):
            helper_fallback_counts["total"] += 1
            helper_fallback_counts["byPlatform"][recommendation["platform"]] = (
                helper_fallback_counts["byPlatform"].get(recommendation["platform"], 0)
                + 1
            )
            helper_fallback_counts["byMethod"][fallback["method"]] = (
                helper_fallback_counts["byMethod"].get(fallback["method"], 0) + 1
            )
    return {
        "verifiedAsOf": "2026-04-23",
        "sourceIndexPath": "example/cis-references/sources.json",
        "downloadManifestPath": "example/cis-references/downloads/manifest.json",
        "harvestedBenchmarkPdfs": [
            {
                "benchmarkId": benchmark.benchmark_id,
                "benchmarkTitle": benchmark.benchmark_title,
                "sourcePdfPath": benchmark.source_pdf_path,
                "version": benchmark.version,
                "documentDate": benchmark.document_date,
                "platform": benchmark.platform,
                "managementSurface": benchmark.management_surface,
            }
            for benchmark in BENCHMARKS
        ],
        "currentFamilies": current_families,
        "recommendationCatalogPath": "example/cis-references/cis-recommendations.json",
        "importableRulesetPath": "example/cis-references/cis-relution-ruleset.json",
        "recommendationCounts": {
            "total": len(recommendations),
            "byPlatform": recommendation_counts,
        },
        "helperFallbackCounts": helper_fallback_counts,
    }


def update_readme() -> None:
    """Update the CIS README text for current generated artifact coverage."""

    readme = README_PATH.read_text(encoding="utf8")
    readme = readme.replace(
        (
            "- `cis-relution-baseline.json`: machine-readable CIS family summary plus "
            "harvested PDF coverage and recommendation counts."
        ),
        (
            "- `cis-relution-baseline.json`: machine-readable CIS family summary plus "
            "harvested PDF coverage, recommendation counts, and helper fallback counts."
        ),
    )
    readme = readme.replace(
        (
            "- `cis-recommendations.json`: full recommendation catalog harvested from the "
            "saved benchmark PDFs, including profile applicability, "
            "description/rationale/audit/remediation text, and Relution mapping metadata."
        ),
        (
            "- `cis-recommendations.json`: full recommendation catalog harvested from the "
            "saved benchmark PDFs, including profile applicability, "
            "description/rationale/audit/remediation text, helper fallback methods for "
            "Windows/macOS, and Relution mapping metadata."
        ),
    )
    README_PATH.write_text(readme, encoding="utf8")
