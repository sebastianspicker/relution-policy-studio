"""Define source-specific paths for generated Relution import artifacts."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True, init=False)
class SourceConfig:
    """Paths and labels for one harvested recommendation source."""

    source: str
    label: str
    root: Path
    paths: dict[str, Path]

    def __init__(
        self,
        source: str,
        label: str,
        root: Path,
        paths: dict[str, Path] | None = None,
        **path_values: Path,
    ) -> None:
        """Normalize current path mappings and supported legacy keyword names."""

        path_map = dict(paths or {})
        legacy_names = {
            "recommendation_catalog_path": "recommendation_catalog",
            "ruleset_path": "ruleset",
            "settings_catalog_path": "settings_catalog",
            "baseline_path": "baseline",
            "readme_path": "readme",
        }
        unknown_names = sorted(set(path_values) - set(legacy_names))
        if unknown_names:
            raise TypeError(
                f"Unexpected SourceConfig path arguments: {', '.join(unknown_names)}"
            )
        for external_name, internal_name in legacy_names.items():
            if external_name in path_values:
                path_map[internal_name] = path_values[external_name]
        missing_names = sorted(set(legacy_names.values()) - set(path_map))
        if missing_names:
            raise TypeError(
                f"Missing SourceConfig path entries: {', '.join(missing_names)}"
            )
        object.__setattr__(self, "source", source)
        object.__setattr__(self, "label", label)
        object.__setattr__(self, "root", root)
        object.__setattr__(self, "paths", path_map)

    @property
    def recommendation_catalog_path(self) -> Path:
        """Path to the normalized recommendation catalog for this source."""

        return self.paths["recommendation_catalog"]

    @property
    def ruleset_path(self) -> Path:
        """Path to the generated source-specific ruleset."""

        return self.paths["ruleset"]

    @property
    def settings_catalog_path(self) -> Path:
        """Path to the generated source-specific settings catalog."""

        return self.paths["settings_catalog"]

    @property
    def baseline_path(self) -> Path:
        """Path to the source baseline summary."""

        return self.paths["baseline"]

    @property
    def readme_path(self) -> Path:
        """Path to the source README updated by artifact generation."""

        return self.paths["readme"]


SOURCE_CONFIGS: dict[str, SourceConfig] = {
    "bsi": SourceConfig(
        source="bsi",
        label="BSI Grundschutz",
        root=REPO_ROOT / "example" / "bsi-references",
        paths={
            "recommendation_catalog": REPO_ROOT
            / "example"
            / "bsi-references"
            / "bsi-recommendations.json",
            "ruleset": REPO_ROOT
            / "example"
            / "bsi-references"
            / "bsi-relution-ruleset.json",
            "settings_catalog": REPO_ROOT
            / "example"
            / "bsi-references"
            / "bsi-relution-settings-catalog.json",
            "baseline": REPO_ROOT
            / "example"
            / "bsi-references"
            / "bsi-relution-baseline.json",
            "readme": REPO_ROOT / "example" / "bsi-references" / "README.md",
        },
    ),
    "cis": SourceConfig(
        source="cis",
        label="CIS Benchmarks",
        root=REPO_ROOT / "example" / "cis-references",
        paths={
            "recommendation_catalog": REPO_ROOT
            / "example"
            / "cis-references"
            / "cis-recommendations.json",
            "ruleset": REPO_ROOT
            / "example"
            / "cis-references"
            / "cis-relution-ruleset.json",
            "settings_catalog": REPO_ROOT
            / "example"
            / "cis-references"
            / "cis-relution-settings-catalog.json",
            "baseline": REPO_ROOT
            / "example"
            / "cis-references"
            / "cis-relution-baseline.json",
            "readme": REPO_ROOT / "example" / "cis-references" / "README.md",
        },
    ),
    "vendor": SourceConfig(
        source="vendor",
        label="Vendor Guidance",
        root=REPO_ROOT / "example" / "vendor-references",
        paths={
            "recommendation_catalog": REPO_ROOT
            / "example"
            / "vendor-references"
            / "vendor-recommendations.json",
            "ruleset": REPO_ROOT
            / "example"
            / "vendor-references"
            / "vendor-relution-ruleset.json",
            "settings_catalog": REPO_ROOT
            / "example"
            / "vendor-references"
            / "vendor-relution-settings-catalog.json",
            "baseline": REPO_ROOT
            / "example"
            / "vendor-references"
            / "vendor-relution-baseline.json",
            "readme": REPO_ROOT / "example" / "vendor-references" / "README.md",
        },
    ),
}

COVERAGE_MATRIX_PATH = (
    REPO_ROOT
    / "example"
    / "recommendation-coverage"
    / "relution-achievability-matrix.json"
)
SEMANTIC_INDEX_PATH = (
    REPO_ROOT / "example" / "recommendation-coverage" / "relution-semantic-index.json"
)
UNIFIED_ANALYSIS_PATH = (
    REPO_ROOT
    / "example"
    / "recommendation-coverage"
    / "unified-recommendation-analysis.json"
)
UNIFIED_ANALYSIS_REPORT_PATH = (
    REPO_ROOT
    / "example"
    / "recommendation-coverage"
    / "unified-recommendation-analysis.md"
)
EXACT_MAPPING_REFERENCE_PATH = (
    REPO_ROOT / "example" / "recommendation-coverage" / "exact-mapping-reference.json"
)
MAPPING_CANDIDATE_REVIEW_PATH = (
    REPO_ROOT / "example" / "recommendation-coverage" / "mapping-candidate-review.json"
)
MANUAL_MAPPING_PROMOTIONS_PATH = (
    REPO_ROOT / "example" / "recommendation-coverage" / "manual-mapping-promotions.json"
)
MAPPING_CANDIDATE_REVIEW_REPORT_PATH = (
    REPO_ROOT / "docs" / "MAPPING_CANDIDATE_REVIEW.md"
)
SOURCE_CHANGE_REPORT_PATH = (
    REPO_ROOT / "example" / "recommendation-coverage" / "source-change-report.json"
)
RULESET_UPDATE_PLAN_PATH = (
    REPO_ROOT / "example" / "recommendation-coverage" / "ruleset-update-plan.json"
)
RELUTION_MAPPING_CHANGE_REPORT_PATH = (
    REPO_ROOT
    / "example"
    / "recommendation-coverage"
    / "relution-mapping-change-report.json"
)
RELUTION_MAPPING_UPDATE_PLAN_PATH = (
    REPO_ROOT
    / "example"
    / "recommendation-coverage"
    / "relution-mapping-update-plan.json"
)
ALLOWED_MAPPING_STATUSES = {"exact", "parameterized", "partial", "suggested", "none"}
MULTI_INSTANCE_TARGET_TYPES = {"WINDOWS_CUSTOM_CSP"}
AUTHORITATIVE_SOURCE = "bsi"
ALL_SOURCES = ("bsi", "cis", "vendor")

PLATFORM_ORDER = {
    "WINDOWS": 0,
    "MACOS": 1,
    "IOS": 2,
    "ANDROID_ENTERPRISE": 3,
}
