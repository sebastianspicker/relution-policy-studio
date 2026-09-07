"""Cohesive implementation stage 1 for unified_analysis."""

from .artifact_paths import AUTHORITATIVE_SOURCE
from typing import Any
from .artifact_paths import SEMANTIC_INDEX_PATH
from .artifact_paths import UNIFIED_ANALYSIS_PATH
from .artifact_paths import UNIFIED_ANALYSIS_REPORT_PATH
from .ruleset_reporting import count_by
from datetime import datetime
from .ruleset_reporting import difference_severity_rank
from .recommendation_catalog import load_recommendations_by_global_id
from .artifact_io_json import read_json
from .ruleset_reporting import source_coverage_counts
from .ruleset_reporting import source_recommendation_counts
from .artifact_io_values import stable_json
import sys
from datetime import timezone
from .artifact_io_json import write_json

def build_unified_recommendation_analysis() -> None:
    """Build the BSI-authoritative cross-source semantic analysis artifacts."""
    from .unified_exact_differences import analyze_exact_mapping_differences
    from .unified_group_differences import semantic_group_differences
    from .unified_semantic_groups import build_common_semantic_groups

    if not SEMANTIC_INDEX_PATH.exists():
        print(
            f"WARNING: skipping unified analysis; semantic index not found: {SEMANTIC_INDEX_PATH}",
            file=sys.stderr,
        )
        return
    semantic_index = read_json(SEMANTIC_INDEX_PATH)
    recommendations = load_recommendations_by_global_id()
    common_groups = build_common_semantic_groups(semantic_index, recommendations)
    contradictions, exact_differences = analyze_exact_mapping_differences(
        recommendations
    )
    semantic_differences = semantic_group_differences(common_groups)
    differences = sorted(
        [*exact_differences, *semantic_differences],
        key=lambda entry: (difference_severity_rank(entry), entry["type"], entry["id"]),
    )
    generated_at = (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )
    payload = {
        "version": 1,
        "name": "Unified Recommendation Semantic Analysis",
        "generatedAt": generated_at,
        "precedence": {
            "authoritativeSource": AUTHORITATIVE_SOURCE,
            "behavior": "rank-and-annotate",
            "note": (
                "BSI is marked as authoritative in differences; source mappings are not "
                "rewritten by this artifact."
            ),
        },
        "commonGroups": common_groups,
        "contradictions": contradictions,
        "differences": differences,
        "summary": {
            "totalCommonGroups": len(common_groups),
            "commonGroupsByPlatform": count_by(common_groups, "platform"),
            "commonGroupsBySourceCoverage": source_coverage_counts(common_groups),
            "hardContradictions": len(contradictions),
            "differences": len(differences),
            "bsiAuthoritativeDifferences": sum(
                1
                for entry in differences
                if entry.get("authoritativeSource") == AUTHORITATIVE_SOURCE
            ),
            "sourceRecommendationCounts": source_recommendation_counts(recommendations),
        },
    }
    write_json(UNIFIED_ANALYSIS_PATH, payload)
    write_unified_analysis_report(payload)

def write_unified_analysis_report(payload: dict[str, Any]) -> None:
    """Write the Markdown companion report for unified recommendation analysis."""

    summary = payload["summary"]
    lines = [
        "# Unified Recommendation Semantic Analysis",
        "",
        f"Generated: `{payload['generatedAt']}`",
        "",
        "## Summary",
        "",
        f"- Common semantic groups: `{summary['totalCommonGroups']}`",
        f"- Hard contradictions: `{summary['hardContradictions']}`",
        f"- Differences noted: `{summary['differences']}`",
        f"- BSI-authoritative differences: `{summary['bsiAuthoritativeDifferences']}`",
        f"- Source recommendation counts: `{stable_json(summary['sourceRecommendationCounts'])}`",
        "",
        "## BSI Precedence",
        "",
        (
            "BSI is authoritative for interpretation. This report annotates conflicts and "
            "differences; it does not rewrite CIS or vendor mappings."
        ),
        "",
        "## Common Groups",
        "",
    ]
    for group in payload["commonGroups"][:30]:
        label = group.get("label", {})
        label_text = label.get("en") if isinstance(label, dict) else ""
        label_suffix = f" - {label_text}" if label_text else ""
        lines.append(
            f"- `{group['platform']}` `{group['conceptId']}`"
            f"{label_suffix}: sources `{', '.join(group['sources'])}`, "
            f"recommendations `{stable_json(group['sourceCounts'])}`, "
            f"shared targets `{len(group['sharedRelutionTargetIds'])}`"
        )
    if not payload["commonGroups"]:
        lines.append("- None.")
    lines.extend(["", "## Hard Contradictions", ""])
    for contradiction in payload["contradictions"][:30]:
        lines.append(
            f"- `{contradiction['platform']}` `{contradiction['target']}` "
            f"`{contradiction['fieldPath']}`: "
            f"sources `{', '.join(contradiction['sources'])}`. BSI wins; mappings are unchanged."
        )
    if not payload["contradictions"]:
        lines.append("- None detected by conservative exact-value comparison.")
    lines.extend(["", "## Differences", ""])
    for difference in payload["differences"][:40]:
        if difference["type"] == "mapping-support-difference":
            lines.append(
                f"- `{difference['platform']}` `{difference['conceptId']}` support differs: "
                f"`{stable_json(difference['supportBySource'])}`. BSI wins for interpretation."
            )
        elif difference["type"] == "source-coverage-gap":
            lines.append(
                f"- `{difference['platform']}` `{difference['conceptId']}` missing sources: "
                f"`{', '.join(difference['missingSources'])}`. BSI coverage is preserved."
            )
        else:
            difference_target = difference.get(
                "target", difference.get("conceptId", "")
            )
            lines.append(
                f"- `{difference['platform']}` `{difference_target}` "
                f"`{difference.get('fieldPath', '')}` differs across "
                f"`{', '.join(difference['sources'])}`."
            )
    if not payload["differences"]:
        lines.append("- None.")
    UNIFIED_ANALYSIS_REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    UNIFIED_ANALYSIS_REPORT_PATH.write_text("\n".join(lines) + "\n", encoding="utf8")
