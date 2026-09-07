"""Apple analog mapping support for CIS recommendations."""
from __future__ import annotations

from typing import Any

from _recommendation_mapping_modules.candidate_inference_apple_analog import apple_schema_analog_mappings_for
from _harvest_cis_benchmarks_modules.cis_benchmarks import BenchmarkSpec
from _harvest_cis_benchmarks_modules.cis_mapping_accumulator import add_mapping

def add_analog_mappings(
    acc: dict[str, list[dict[str, Any]] | list[str]],
    benchmark: BenchmarkSpec,
    title: str,
    recommended_value: str | None,
) -> None:
    """Add curated Apple analog mappings when no exact mapping exists."""
    if benchmark.platform in {"IOS", "MACOS"} and not acc["exactMappings"]:
        for mapping in apple_schema_analog_mappings_for(
            benchmark.platform, title, recommended_value, extra_texts=()
        ):
            add_mapping(acc, mapping)
