"""Platform dispatch for CIS helper fallback extraction."""
from __future__ import annotations

from typing import Any

from _harvest_cis_benchmarks_modules.cis_benchmarks import BenchmarkSpec
from _harvest_cis_benchmarks_modules.cis_parser_macos_profiles import extract_macos_helper_fallbacks
from _harvest_cis_benchmarks_modules.cis_parser_windows import extract_windows_helper_fallbacks

def extract_helper_fallbacks(
    benchmark: BenchmarkSpec, recommendation_id: str, sections: dict[str, Any]
) -> list[dict[str, Any]]:
    """Extract non-MDM helper evidence for platform-specific CIS recommendations."""
    if benchmark.platform == "WINDOWS":
        return extract_windows_helper_fallbacks(
            recommendation_id,
            sections.get("audit", ""),
            sections.get("remediation", ""),
        )
    if benchmark.platform == "MACOS":
        return extract_macos_helper_fallbacks(
            recommendation_id, sections.get("remediationLines", [])
        )
    return []
