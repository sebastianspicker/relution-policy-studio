"""Stable contracts for guideline mapping update commands."""

from __future__ import annotations

from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SUPPORTED_SOURCES = ("bsi", "cis", "vendor")
OFFLINE_SOURCE_COMMANDS = {
    "bsi": ("tools/harvest_bsi_grundschutz.py", "--defer-artifacts"),
    "cis": ("tools/harvest_cis_benchmarks.py", "--defer-artifacts"),
    "vendor": (
        "tools/harvest_vendor_guidance.py",
        "--offline",
        "--defer-artifacts",
    ),
}
BUILD_COMMAND_ARGS = {
    ("bsi",): ("bsi",),
    ("cis",): ("cis",),
    ("vendor",): ("vendor",),
    SUPPORTED_SOURCES: SUPPORTED_SOURCES,
}
EXPECTED_UPDATE_ARTIFACT_PATHS = (
    REPO_ROOT / "example" / "recommendation-coverage" / "source-change-report.json",
    REPO_ROOT / "example" / "recommendation-coverage" / "ruleset-update-plan.json",
    REPO_ROOT
    / "example"
    / "recommendation-coverage"
    / "relution-mapping-change-report.json",
    REPO_ROOT
    / "example"
    / "recommendation-coverage"
    / "relution-mapping-update-plan.json",
)


def selected_sources(source: str) -> list[str]:
    """Return the ordered source selection represented by a CLI value."""

    if source == "all":
        return list(SUPPORTED_SOURCES)
    if source in SUPPORTED_SOURCES:
        return [source]
    raise AssertionError(f"Unsupported source selection: {source}")


def build_command_args(sources: list[str]) -> tuple[str, ...]:
    """Return the fixed artifact-builder arguments for a source selection."""

    source_key = tuple(sources)
    build_args = BUILD_COMMAND_ARGS.get(source_key)
    if build_args is None:
        raise AssertionError(f"Unsupported source selection: {sources}")
    return build_args


def assert_expected_outputs_written(output_paths: tuple[Path, ...]) -> None:
    """Raise when a required mapping drift artifact was not written."""

    missing = [path for path in output_paths if not path.is_file()]
    if missing:
        missing_paths = ", ".join(str(path) for path in missing)
        raise AssertionError(
            f"Expected update artifact(s) not written: {missing_paths}"
        )
