"""Build CIS recommendation reconciliation rows from cached PDF evidence."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable

from _harvest_cis_benchmarks_modules.cis_parser_core import (
    extract_pdf_text,
    parsed_benchmark_text,
)
from _harvest_cis_benchmarks_modules.cis_benchmarks import BENCHMARKS


def cis_rows(
    index: dict[str, dict[str, Any]],
    root: Path,
    mapping_flag: Callable[[dict[str, Any]], str],
) -> list[dict[str, Any]]:
    """Build CIS rows with cached PDF hashes and generated page references."""

    recommendations = json.loads(
        (root / "example" / "cis-references" / "cis-recommendations.json").read_text(
            encoding="utf8"
        )
    )
    page_index = {
        (benchmark.benchmark_id, start["recommendationId"]): start["sourcePage"]
        for benchmark in BENCHMARKS
        for start in parsed_benchmark_text(extract_pdf_text(benchmark.path))["starts"]
    }
    rows = []
    for recommendation in recommendations:
        source = index.get(str(recommendation["sourcePdfPath"]))
        applicability = "current"
        if recommendation.get("managementSurface") == "MICROSOFT_INTUNE":
            applicability = "intune-specific"
        elif any(
            token in str(recommendation.get("benchmarkTitle", ""))
            for token in (" 15", " 17", " 18")
        ):
            applicability = "stale-os-version"
        source_page = page_index.get(
            (recommendation["benchmarkId"], recommendation["recommendationId"])
        )
        rows.append(
            {
                "recommendation_id": recommendation["id"],
                "control_id": recommendation["recommendationId"],
                "pdf_sha256": None if source is None else source["sha256"],
                "pdf_path": None if source is None else source["local_path"],
                "page": source_page,
                "verification": (
                    "verified"
                    if source is not None and source_page
                    else "unverifiable-page"
                ),
                "applicability": applicability,
                "mapping": mapping_flag(recommendation),
            }
        )
    return rows
