#!/usr/bin/env python3
"""Compatibility facade for recommendation mapping helpers."""

import json
import sys
from pathlib import Path
from typing import Any

from _recommendation_mapping_modules.candidate_inference import (
    android_relution_analog_mappings_for,
    android_relution_candidates_for,
    apple_mobileconfig_candidates_for,
    apple_schema_analog_mappings_for,
    build_setting_index,
    infer_exact_boolean_mapping,
    load_apple_mobileconfig_evidence,
    mapping_candidates,
    semantic_candidates_for,
    semantic_concepts_for,
    semantic_concepts_for_field,
    semantic_evidence_source_records,
    semantic_metadata_for,
    semantic_no_concept_reason,
)
from _recommendation_mapping_modules.field_matching import (
    candidate_from_mapping,
    flatten_value_paths,
    load_windows_custom_csp_evidence,
    merge_candidate_lists,
    read_json,
    split_identifier,
    tokenize,
    unique_preserving_order,
    windows_custom_csp_mapping_for,
)
from _recommendation_mapping_modules.mapping_types_and_constants import (
    MANAGEMENT_SUPPORT_CONCEPT_IDS,
    REPO_ROOT,
)

sys.dont_write_bytecode = True

__all__ = [
    "MANAGEMENT_SUPPORT_CONCEPT_IDS",
    "android_relution_analog_mappings_for",
    "android_relution_candidates_for",
    "apple_mobileconfig_candidates_for",
    "apple_schema_analog_mappings_for",
    "build_setting_index",
    "candidate_from_mapping",
    "flatten_value_paths",
    "infer_exact_boolean_mapping",
    "load_apple_mobileconfig_evidence",
    "load_windows_custom_csp_evidence",
    "mapping_candidates",
    "merge_candidate_lists",
    "semantic_candidates_for",
    "semantic_concepts_for",
    "semantic_concepts_for_field",
    "semantic_evidence_source_records",
    "semantic_metadata_for",
    "semantic_no_concept_reason",
    "split_identifier",
    "tokenize",
    "windows_custom_csp_mapping_for",
]

ACHIEVABILITY_MATRIX_PATH = (
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
LLM_MAPPING_REVIEW_PATH = (
    REPO_ROOT
    / "example"
    / "recommendation-coverage"
    / "llm-relution-mapping-review.json"
)
LLM_MAPPING_DOC_PATH = REPO_ROOT / "docs" / "LLM_RELUTION_MAPPING.md"


def build_llm_mapping_review() -> dict[str, Any]:
    """Build the machine-readable LLM mapping review from committed artifacts."""
    matrix = read_json(ACHIEVABILITY_MATRIX_PATH)
    semantic_index = read_json(SEMANTIC_INDEX_PATH)
    analysis = read_json(UNIFIED_ANALYSIS_PATH)
    semantic_by_recommendation = {
        (entry["source"], entry["recommendationId"]): entry
        for entry in semantic_index.get("recommendations", [])
        if isinstance(entry, dict)
    }
    semantic_targets = {
        str(entry["id"]): entry
        for entry in semantic_index.get("relutionTargets", [])
        if isinstance(entry, dict) and isinstance(entry.get("id"), str)
    }
    rows = [
        llm_review_row(
            row,
            semantic_by_recommendation.get((row["source"], row["recommendationId"])),
            semantic_targets,
        )
        for row in matrix["rows"]
    ]
    return {
        "version": 1,
        "name": "LLM Relution Mapping Review",
        "generatedAt": matrix["generatedAt"],
        "reviewMethod": {
            "mode": "model-reviewed-from-vendored-artifacts",
            "sourceScope": "vendored-snapshots",
            "externalLlmApi": False,
            "note": (
                "Rows are reviewed against the committed achievability matrix, semantic index, "
                "and source manifests. Exact mappings are not promoted beyond deterministic "
                "exact evidence."
            ),
        },
        "sourceSnapshots": source_snapshots(),
        "inputs": {
            "achievabilityMatrixPath": relative_path(ACHIEVABILITY_MATRIX_PATH),
            "semanticIndexPath": relative_path(SEMANTIC_INDEX_PATH),
            "unifiedAnalysisPath": relative_path(UNIFIED_ANALYSIS_PATH),
        },
        "precedence": analysis["precedence"],
        "rows": rows,
        "summary": review_summary(rows, matrix["summary"], analysis["summary"]),
    }


def write_llm_mapping_review() -> None:
    """Write the JSON and Markdown LLM mapping review artifacts."""
    review = build_llm_mapping_review()
    LLM_MAPPING_REVIEW_PATH.write_text(
        json.dumps(review, ensure_ascii=False, indent=2) + "\n", encoding="utf8"
    )
    LLM_MAPPING_DOC_PATH.parent.mkdir(parents=True, exist_ok=True)
    LLM_MAPPING_DOC_PATH.write_text(render_llm_mapping_doc(review), encoding="utf8")


def llm_review_row(
    row: dict[str, Any],
    semantic_entry: dict[str, Any] | None,
    semantic_targets: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    """Convert one achievability-matrix row into an LLM review row."""
    exact_targets = classify_targets(row.get("targetTypes", []), "exact")
    candidate_targets = classify_targets(
        row.get("candidateTargetTypes", []), "candidate"
    )
    status = review_status(row)
    blocking_reasons = [
        str(reason)
        for reason in row.get("blockingReasons", [])
        if isinstance(reason, str)
    ]
    semantic_concepts = review_semantic_concept_ids(
        status, semantic_entry, semantic_targets
    )
    return {
        "source": row["source"],
        "recommendationId": row["recommendationId"],
        "platform": row["platform"],
        "title": row["title"],
        "status": status,
        "confidence": review_confidence(
            status, exact_targets, candidate_targets, blocking_reasons
        ),
        "relutionTargets": [
            target
            for target in [*exact_targets, *candidate_targets]
            if target["surface"] == "relution-native"
        ],
        "appleTargets": [
            target
            for target in [*exact_targets, *candidate_targets]
            if target["surface"] in {"apple-schema-profile", "apple-mobileconfig"}
        ],
        "semanticConceptIds": semantic_concepts,
        "evidence": {
            "category": row["category"],
            "mappingStatus": row["mappingStatus"],
            "surfaces": row.get("surfaces", []),
            "importableVia": row.get("importableVia", []),
            "semanticExactTargetIds": semantic_entry.get("exactTargetIds", [])
            if isinstance(semantic_entry, dict)
            else [],
            "semanticCandidateTargetIds": semantic_entry.get("candidateTargetIds", [])
            if isinstance(semantic_entry, dict)
            else [],
        },
        "reason": review_reason(status, blocking_reasons),
        "blockedBy": blocking_reasons,
        "reviewedAt": row.get("generatedAt", "") or "2026-04-24",
    }


def review_semantic_concept_ids(
    status: str,
    semantic_entry: dict[str, Any] | None,
    semantic_targets: dict[str, dict[str, Any]],
) -> list[str]:
    """Choose concept IDs from exact targets first, then candidate evidence."""
    if not isinstance(semantic_entry, dict):
        return []
    exact_ids = [
        str(target_id)
        for target_id in semantic_entry.get("exactTargetIds", [])
        if isinstance(target_id, str)
    ]
    candidate_ids = [
        str(target_id)
        for target_id in semantic_entry.get("candidateTargetIds", [])
        if isinstance(target_id, str)
    ]
    target_ids = exact_ids if status == "exact" else candidate_ids
    concepts: list[str] = []
    for target_id in target_ids:
        target = semantic_targets.get(target_id)
        if not isinstance(target, dict):
            continue
        for concept_id in target.get("conceptIds", []):
            if isinstance(concept_id, str):
                concepts.append(concept_id)
    if concepts:
        return unique_preserving_order(concepts)
    return unique_preserving_order(
        [
            str(concept_id)
            for concept_id in semantic_entry.get("semanticConceptIds", [])
            if isinstance(concept_id, str)
        ]
    )


def review_status(row: dict[str, Any]) -> str:
    """Map achievability categories to stable review status values."""
    if row.get("mappingStatus") == "parameterized":
        return "parameterized"
    category = row["category"]
    if category == "relution-achievable":
        return "exact"
    if category == "relution-partial":
        return "partial"
    if category == "helper-only":
        return "helper-only"
    return "gap"


def review_confidence(
    status: str,
    exact_targets: list[dict[str, str]],
    candidate_targets: list[dict[str, str]],
    blocking_reasons: list[str],
) -> str:
    """Derive coarse review confidence from status, targets, and blockers."""
    if status == "exact" and exact_targets:
        return "high"
    if status in {"partial", "parameterized"} and candidate_targets:
        return "medium"
    if status in {"gap", "helper-only"} and blocking_reasons:
        return "medium"
    return "low"


def review_reason(status: str, blocking_reasons: list[str]) -> str:
    """Return the human-readable reason stored with an LLM review row."""
    if blocking_reasons:
        return blocking_reasons[0]
    if status == "exact":
        return (
            "Exact Relution or Apple transport mapping is present in the committed "
            "achievability matrix."
        )
    if status == "partial":
        return (
            "Related Relution targets exist, but exact values or local scope decisions are "
            "missing."
        )
    if status == "parameterized":
        return (
            "Relution support exists, but local parameters or process evidence are required "
            "before compliance can be closed."
        )
    if status == "helper-only":
        return "Only non-Relution helper guidance is available in the committed source artifacts."
    return (
        "No supported Relution, Apple profile, mobileconfig, or helper target is "
        "available in the committed artifacts."
    )


def classify_targets(values: list[str], status: str) -> list[dict[str, str]]:
    """Classify target identifiers by Relution, Apple profile, or mobileconfig surface."""
    targets = []
    for value in values:
        if not isinstance(value, str):
            continue
        if value.startswith("profile:"):
            targets.append(
                {"surface": "apple-schema-profile", "target": value, "status": status}
            )
        elif value.startswith("com.apple."):
            targets.append(
                {"surface": "apple-mobileconfig", "target": value, "status": status}
            )
        else:
            targets.append(
                {"surface": "relution-native", "target": value, "status": status}
            )
    return targets


def source_snapshots() -> list[dict[str, str]]:
    """Summarize source baselines referenced by the LLM mapping review."""
    snapshots = []
    for source, baseline_path in (
        (
            "bsi",
            REPO_ROOT / "example" / "bsi-references" / "bsi-relution-baseline.json",
        ),
        (
            "cis",
            REPO_ROOT / "example" / "cis-references" / "cis-relution-baseline.json",
        ),
        (
            "vendor",
            REPO_ROOT
            / "example"
            / "vendor-references"
            / "vendor-relution-baseline.json",
        ),
    ):
        baseline = read_json(baseline_path)
        snapshots.append(
            {
                "source": source,
                "verifiedAsOf": str(baseline.get("verifiedAsOf", "")),
                "baselinePath": relative_path(baseline_path),
                "sourceIndexPath": str(
                    baseline.get(
                        "sourceIndexPath", f"example/{source}-references/sources.json"
                    )
                ),
                "downloadManifestPath": str(baseline.get("downloadManifestPath", "")),
                "recommendationCatalogPath": str(
                    baseline.get("recommendationCatalogPath", "")
                ),
                "settingBundleCatalogPath": str(
                    baseline.get("settingBundleCatalogPath", "")
                ),
            }
        )
    return snapshots


def review_summary(
    rows: list[dict[str, Any]],
    matrix_summary: dict[str, Any],
    analysis_summary: dict[str, Any],
) -> dict[str, Any]:
    """Build aggregate counts for the LLM mapping review artifact."""
    return {
        "totalRecommendations": len(rows),
        "reviewedRecommendations": len(rows),
        "pendingRecommendations": 0,
        "byStatus": count_by(rows, "status"),
        "bySource": count_by(rows, "source"),
        "byPlatform": count_by(rows, "platform"),
        "byConfidence": count_by(rows, "confidence"),
        "bySourceAndStatus": nested_count(rows, "source", "status"),
        "byPlatformAndStatus": nested_count(rows, "platform", "status"),
        "matrixSummary": matrix_summary,
        "unifiedAnalysisSummary": analysis_summary,
    }


def count_by(rows: list[dict[str, Any]], key: str) -> dict[str, int]:
    """Count review rows by one stringified key."""
    counts: dict[str, int] = {}
    for row in rows:
        value = str(row.get(key, ""))
        counts[value] = counts.get(value, 0) + 1
    return dict(sorted(counts.items()))


def nested_count(
    rows: list[dict[str, Any]], outer_key: str, inner_key: str
) -> dict[str, dict[str, int]]:
    """Count review rows by nested stringified outer and inner keys."""
    counts: dict[str, dict[str, int]] = {}
    for row in rows:
        outer = str(row.get(outer_key, ""))
        inner = str(row.get(inner_key, ""))
        counts.setdefault(outer, {})
        counts[outer][inner] = counts[outer].get(inner, 0) + 1
    return {
        outer: dict(sorted(inner.items())) for outer, inner in sorted(counts.items())
    }


def render_llm_mapping_doc(review: dict[str, Any]) -> str:
    """Render the Markdown companion for the LLM mapping review JSON."""
    summary = review["summary"]
    lines = [
        "# LLM Relution Mapping Review",
        "",
        f"Generated: `{review['generatedAt']}`",
        "",
        "## Scope",
        "",
        (
            "This review maps Relution settings against the vendored BSI, CIS, and vendor "
            "recommendation corpus. It uses the committed achievability matrix, semantic "
            "index, and unified source analysis as evidence. No online source refresh or "
            "external LLM API call is part of this artifact."
        ),
        "",
        "BSI remains authoritative for interpretation when CIS or vendor guidance differs.",
        "",
        "## Source Snapshots",
        "",
        "| Source | Verified as of | Baseline | Manifest | Recommendations |",
        "| --- | --- | --- | --- | --- |",
    ]
    for snapshot in review["sourceSnapshots"]:
        lines.append(
            f"| {snapshot['source']} | {snapshot['verifiedAsOf']} | "
            f"`{snapshot['baselinePath']}` | `{snapshot['downloadManifestPath']}` | "
            f"`{snapshot['recommendationCatalogPath']}` |"
        )
    lines.extend(
        [
            "",
            "## Results",
            "",
            f"- Total recommendations: `{summary['totalRecommendations']}`",
            f"- Reviewed recommendations: `{summary['reviewedRecommendations']}`",
            f"- Pending recommendations: `{summary['pendingRecommendations']}`",
            f"- Status counts: `{compact_json(summary['byStatus'])}`",
            f"- Source counts: `{compact_json(summary['bySource'])}`",
            f"- Platform counts: `{compact_json(summary['byPlatform'])}`",
            f"- Confidence counts: `{compact_json(summary['byConfidence'])}`",
            "",
            "## Semantic Correction",
            "",
            (
                "Semantic concepts are grounded in the current exact or candidate "
                "Relution/Apple target links. Exact mappings do not inherit unrelated "
                "candidate-target concepts, and common semantic groups only list targets whose "
                "own concept metadata matches the group concept."
            ),
            "",
            "## Status Semantics",
            "",
            (
                "- `exact`: Relution or Apple profile transport can enforce the concrete "
                "recommendation value."
            ),
            (
                "- `parameterized`: Relution support exists, but local identifiers, scope, or "
                "process evidence must be supplied before compliance can be closed."
            ),
            (
                "- `partial`: Related Relution targets exist, but exact values, scope, app "
                "identifiers, certificates, network names, schedules, or local policy choices "
                "are still required."
            ),
            (
                "- `helper-only`: structured audit/remediation guidance exists outside Relution "
                "importable settings."
            ),
            (
                "- `gap`: no supported Relution, Apple profile, mobileconfig, or helper target "
                "is available in this repo snapshot."
            ),
            "",
            "## Notable Differences",
            "",
            f"- Common semantic groups: `{summary['unifiedAnalysisSummary']['totalCommonGroups']}`",
            f"- Hard contradictions: `{summary['unifiedAnalysisSummary']['hardContradictions']}`",
            f"- Differences noted: `{summary['unifiedAnalysisSummary']['differences']}`",
            "- BSI-authoritative differences: "
            f"`{summary['unifiedAnalysisSummary']['bsiAuthoritativeDifferences']}`",
            "",
            (
                "The machine-readable ledger is "
                "`example/recommendation-coverage/llm-relution-mapping-review.json`."
            ),
            "",
        ]
    )
    return "\n".join(lines)


def relative_path(path: Path) -> str:
    """Return a repository-relative POSIX path for review artifacts."""
    return path.relative_to(REPO_ROOT).as_posix()


def compact_json(value: Any) -> str:
    """Render compact sorted JSON for inline Markdown summary fields."""
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


if __name__ == "__main__":
    if sys.argv[1:] == ["write-llm-review"]:
        write_llm_mapping_review()
    else:
        raise SystemExit("usage: tools/recommendation_mapping.py write-llm-review")
