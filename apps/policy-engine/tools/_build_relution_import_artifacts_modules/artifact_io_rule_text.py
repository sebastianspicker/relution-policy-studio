"""Source-specific text and metadata for generated rules."""

from typing import Any

SOURCE_CONFIG: dict[str, dict[str, Any]] = {
    "bsi": {"policyNames": {"WINDOWS": "Windows BSI Grundschutz", "MACOS": "macOS BSI Grundschutz", "IOS": "iOS BSI Grundschutz", "ANDROID_ENTERPRISE": "Android BSI Grundschutz"}, "policyDescription": "Generated from the active BSI requirement catalog with exact Relution aggregates and preserved informational metadata.", "titleIdField": "requirementId", "reasonFields": ("reason", "requirementText", "title"), "recommendedValueField": "requirementText", "settingsCatalogReadmeLine": "- `bsi-relution-settings-catalog.json`: machine-readable catalog of exact Relution setting bundles, their provenance, and any explicit variant groups.", "rulesetReadmeAnchor": "- `bsi-relution-ruleset.json`: importable Relution ruleset built from the active BSI requirements. Only exact Relution mappings are actionable; the rest stay informational with preserved metadata."},
    "cis": {"policyNames": {"WINDOWS": "Windows CIS Benchmarks", "MACOS": "macOS CIS Benchmarks", "IOS": "iOS CIS Benchmarks", "ANDROID_ENTERPRISE": "Android CIS Benchmarks"}, "policyDescription": "Generated from the harvested CIS benchmark catalog with exact Relution aggregates and preserved informational metadata.", "titleIdField": "recommendationId", "reasonFields": ("rationale", "description", "title"), "recommendedValueField": "recommendedValue", "settingsCatalogReadmeLine": "- `cis-relution-settings-catalog.json`: machine-readable catalog of exact Relution setting bundles, their provenance, and any explicit variant groups.", "rulesetReadmeAnchor": "- `cis-relution-ruleset.json`: importable Relution ruleset that preserves every recommendation as informational metadata and adds only conflict-safe aggregate exact mappings."},
    "vendor": {"policyNames": {"WINDOWS": "Windows Vendor Guidance", "MACOS": "macOS Vendor Guidance", "IOS": "iOS Vendor Guidance", "ANDROID_ENTERPRISE": "Android Vendor Guidance"}, "policyDescription": "Generated from the harvested vendor recommendation catalog with exact Relution aggregates and preserved informational metadata.", "titleIdField": None, "reasonFields": ("reason", "title"), "recommendedValueField": "recommendedValue", "settingsCatalogReadmeLine": "- `vendor-relution-settings-catalog.json`: machine-readable catalog of exact Relution setting bundles, their provenance, and any explicit variant groups.", "rulesetReadmeAnchor": "- `vendor-relution-ruleset.json`: importable ruleset JSON for this repo’s ruleset importer. Recommendation-level rules are retained as informational metadata, and merge-safe exact mappings are emitted as actionable aggregate rules."},
}


def policy_name(source: str, platform: str, variant_ids: list[str] | None = None) -> str:
    """Return the generated policy name for a source/platform variant."""
    base = SOURCE_CONFIG[source]["policyNames"][platform]
    return base if not variant_ids else f"{base} ({', '.join(variant_ids)})"


def policy_description(source: str, variant_ids: list[str] | None) -> str:
    """Return the generated policy description with variant context."""
    description = SOURCE_CONFIG[source]["policyDescription"]
    return description if not variant_ids else f"{description} Variant selection: {', '.join(variant_ids)}."


def informational_title(source: str, recommendation: dict[str, Any]) -> str:
    """Return the ruleset title for an informational recommendation rule."""
    title_id_field = SOURCE_CONFIG[source]["titleIdField"]
    return f"{recommendation[title_id_field]} {recommendation['title']}" if isinstance(title_id_field, str) else recommendation["title"]


def informational_reason(source: str, recommendation: dict[str, Any]) -> str:
    """Return the first configured explanatory text for a recommendation."""
    for field in SOURCE_CONFIG[source]["reasonFields"]:
        if value := recommendation.get(field):
            return value
    return recommendation["title"]


def informational_value(source: str, recommendation: dict[str, Any]) -> Any:
    """Return the source-specific recommended value field."""
    return recommendation.get(SOURCE_CONFIG[source]["recommendedValueField"])
