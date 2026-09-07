"""External evidence mapping support for CIS recommendations."""
from __future__ import annotations

from typing import Any

from _recommendation_mapping_modules.field_matching_windows_csp import windows_custom_csp_mapping_for
from _harvest_cis_benchmarks_modules.cis_benchmarks import BenchmarkSpec
from _harvest_cis_benchmarks_modules.cis_mapping_accumulator import add_mapping

def add_windows_rexp_mapping(
    acc: dict[str, list[dict[str, Any]] | list[str]],
    benchmark: BenchmarkSpec,
    title: str,
    recommended_value: str | None,
    windows_rexp_evidence: dict[frozenset[str], list[dict[str, Any]]],
) -> None:
    """Add Windows custom-CSP evidence mappings when they match exactly."""
    if benchmark.platform != "WINDOWS" or acc["exactMappings"]:
        return
    rexp_mapping = windows_custom_csp_mapping_for(
        title, recommended_value, windows_rexp_evidence, require_simple_state_match=True
    )
    if rexp_mapping is not None:
        add_mapping(acc, rexp_mapping)
