"""Dispatch curated CIS mappings by benchmark family."""
from __future__ import annotations

from typing import Any

from _harvest_cis_benchmarks_modules.cis_benchmarks import BenchmarkSpec
from _harvest_cis_benchmarks_modules.cis_mapping_android import add_android_curated_mapping
from _harvest_cis_benchmarks_modules.cis_mapping_ios_primary import add_ios_curated_mapping
from _harvest_cis_benchmarks_modules.cis_mapping_macos import add_macos_curated_mapping
from _harvest_cis_benchmarks_modules.cis_mapping_windows import add_windows_defender_mapping, add_windows_standalone_mapping

def add_curated_exact_mappings(
    acc: dict[str, list[dict[str, Any]] | list[str]],
    benchmark: BenchmarkSpec,
    normalized_title: str,
    title: str,
    recommended_value: str | None,
) -> None:
    """Apply benchmark-family-specific curated exact mapping rules."""
    if benchmark.platform == "ANDROID_ENTERPRISE":
        add_android_curated_mapping(
            acc, normalized_title, title, recommended_value, benchmark.platform
        )
    if benchmark.platform == "IOS":
        add_ios_curated_mapping(acc, normalized_title, title, recommended_value)
    if benchmark.platform == "MACOS":
        add_macos_curated_mapping(acc, normalized_title, title)
    if benchmark.benchmark_id == "cis-microsoft-windows-11-standalone-5-0-0":
        add_windows_standalone_mapping(acc, normalized_title, recommended_value)
    if benchmark.benchmark_id == "cis-microsoft-defender-antivirus-1-0-0":
        add_windows_defender_mapping(acc, normalized_title, recommended_value)
