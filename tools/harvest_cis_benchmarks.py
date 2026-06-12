#!/usr/bin/env python3
"""Compatibility launcher and export facade for CIS benchmark harvesting."""

import importlib
import sys

sys.dont_write_bytecode = True

_benchmark_common = importlib.import_module("_harvest_cis_benchmarks_modules.common")
_benchmark_parser = importlib.import_module(
    "_harvest_cis_benchmarks_modules.benchmark_parser"
)
_mapping_rulesets = importlib.import_module(
    "_harvest_cis_benchmarks_modules.mapping_rulesets"
)

BENCHMARKS = _benchmark_parser.BENCHMARKS
CIS_DIR = _benchmark_parser.CIS_DIR
PDF_DIR = _benchmark_parser.PDF_DIR
SOURCES_PATH = _benchmark_parser.SOURCES_PATH
MANIFEST_PATH = _benchmark_parser.MANIFEST_PATH
README_PATH = _benchmark_parser.README_PATH
BASELINE_PATH = _benchmark_parser.BASELINE_PATH
CATALOG_PATH = _benchmark_parser.CATALOG_PATH
RULESET_PATH = _benchmark_parser.RULESET_PATH
WINDOWS_REXP_EVIDENCE_PATH = _benchmark_parser.WINDOWS_REXP_EVIDENCE_PATH

BenchmarkDetails = _benchmark_common.BenchmarkDetails
BenchmarkSpec = _benchmark_parser.BenchmarkSpec
main = _benchmark_parser.main
parse_benchmark = _benchmark_parser.parse_benchmark
cis_semantic_evidence_sources_for = _benchmark_parser.cis_semantic_evidence_sources_for
cis_semantic_candidates_for = _benchmark_parser.cis_semantic_candidates_for
is_windows_helper_only_cis_recommendation = (
    _benchmark_parser.is_windows_helper_only_cis_recommendation
)

candidate_from_mapping = _mapping_rulesets.candidate_from_mapping
merge_candidates = _mapping_rulesets.merge_candidates
mapping_for = _mapping_rulesets.mapping_for
build_ruleset = _mapping_rulesets.build_ruleset
build_baseline_summary = _mapping_rulesets.build_baseline_summary

if __name__ == "__main__":
    main()
