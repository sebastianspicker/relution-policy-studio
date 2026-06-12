"""Build unified semantic analysis artifacts across recommendation sources."""

from __future__ import annotations

from datetime import datetime, timezone
import sys
from typing import Any

from .artifact_io import (
    normalize_policy_platform,
    path_to_string,
    read_json,
    slugify,
    stable_json,
    write_json,
)
from .artifact_paths import (
    ALL_SOURCES,
    AUTHORITATIVE_SOURCE,
    PLATFORM_ORDER,
    SEMANTIC_INDEX_PATH,
    UNIFIED_ANALYSIS_PATH,
    UNIFIED_ANALYSIS_REPORT_PATH,
)
from .mapping_helpers import exact_mappings, mapping_target
from .recommendation_catalog import load_recommendations_by_global_id
from .ruleset_builder import (
    count_by,
    difference_severity_rank,
    flatten_values,
    semantic_support_level,
    source_coverage_counts,
    source_recommendation_counts,
)


def build_unified_recommendation_analysis() -> None:
    """Build the BSI-authoritative cross-source semantic analysis artifacts."""

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


def build_common_semantic_groups(
    semantic_index: dict[str, Any],
    recommendations: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    """Group recommendations that share semantic concepts across sources."""

    concepts = {
        str(concept.get("id")): concept
        for concept in semantic_index.get("concepts", [])
        if isinstance(concept, dict) and isinstance(concept.get("id"), str)
    }
    target_concepts = {
        str(target.get("id")): {
            str(concept_id)
            for concept_id in target.get("conceptIds", [])
            if isinstance(concept_id, str)
        }
        for target in semantic_index.get("relutionTargets", [])
        if isinstance(target, dict) and isinstance(target.get("id"), str)
    }
    groups: dict[tuple[str, str], dict[str, Any]] = {}
    for entry in semantic_index.get("recommendations", []):
        add_common_semantic_group_entry(
            entry, concepts, target_concepts, recommendations, groups
        )

    common_groups: list[dict[str, Any]] = []
    for group in groups.values():
        common_group = common_semantic_group(group, recommendations)
        if common_group is not None:
            common_groups.append(common_group)
    common_groups.sort(key=common_group_sort_key)
    return common_groups


def add_common_semantic_group_entry(
    entry: Any,
    concepts: dict[str, dict[str, Any]],
    target_concepts: dict[str, set[str]],
    recommendations: dict[str, dict[str, Any]],
    groups: dict[tuple[str, str], dict[str, Any]],
) -> None:
    """Add one semantic-index recommendation entry to common-group state."""

    if (
        not isinstance(entry, dict)
        or not isinstance(entry.get("source"), str)
        or not isinstance(entry.get("platform"), str)
    ):
        return
    source = str(entry["source"])
    global_id = f"{source}:{str(entry.get('recommendationId', ''))}"
    if global_id not in recommendations:
        return
    for concept_id in [
        str(value)
        for value in entry.get("semanticConceptIds", [])
        if isinstance(value, str)
    ]:
        group = semantic_group_for_entry(
            groups, concepts, str(entry["platform"]), concept_id
        )
        append_unique(group["recommendationsBySource"][source], global_id)
        append_group_target_links(
            group,
            entry,
            source,
            concept_id,
            {
                "targetConcepts": target_concepts,
                "keys": ("exactTargetIds", "exactTargetIdsBySource"),
            },
        )
        append_group_target_links(
            group,
            entry,
            source,
            concept_id,
            {
                "targetConcepts": target_concepts,
                "keys": ("candidateTargetIds", "candidateTargetIdsBySource"),
            },
        )


def append_unique(values: list[Any], value: Any) -> None:
    """Append a value only when it is not already present."""

    if value not in values:
        values.append(value)


def semantic_group_for_entry(
    groups: dict[tuple[str, str], dict[str, Any]],
    concepts: dict[str, dict[str, Any]],
    platform: str,
    concept_id: str,
) -> dict[str, Any]:
    """Return the accumulator for a platform and semantic concept pair."""

    return groups.setdefault(
        (platform, concept_id),
        {
            "platform": platform,
            "conceptId": concept_id,
            "label": concepts.get(concept_id, {}).get("label", {}),
            "recommendationsBySource": {source_name: [] for source_name in ALL_SOURCES},
            "exactTargetIdsBySource": {source_name: [] for source_name in ALL_SOURCES},
            "candidateTargetIdsBySource": {
                source_name: [] for source_name in ALL_SOURCES
            },
        },
    )


def append_group_target_links(
    group: dict[str, Any],
    entry: dict[str, Any],
    source: str,
    concept_id: str,
    state: dict[str, Any],
) -> None:
    """Append target ids that actually carry the grouped semantic concept."""

    target_concepts = state["targetConcepts"]
    entry_key, group_key = state["keys"]
    for target_id in entry.get(entry_key, []):
        if isinstance(target_id, str) and concept_id in target_concepts.get(
            target_id, set()
        ):
            append_unique(group[group_key][source], target_id)


def common_semantic_group(
    group: dict[str, Any], recommendations: dict[str, dict[str, Any]]
) -> dict[str, Any] | None:
    """Render a common semantic group when at least two sources participate."""

    sources = [
        source for source in ALL_SOURCES if group["recommendationsBySource"][source]
    ]
    if len(sources) < 2:
        return None
    return {
        "id": slugify(f"{group['platform']}-{group['conceptId']}"),
        "platform": group["platform"],
        "conceptId": group["conceptId"],
        "label": group["label"],
        "sources": sources,
        "missingSources": [source for source in ALL_SOURCES if source not in sources],
        "authoritativeSource": AUTHORITATIVE_SOURCE
        if AUTHORITATIVE_SOURCE in sources
        else None,
        "sourceCounts": {
            source: len(group["recommendationsBySource"][source]) for source in sources
        },
        "recommendationsBySource": {
            source: sorted(group["recommendationsBySource"][source])
            for source in sources
        },
        "sampleRecommendations": sample_group_recommendations(
            group, recommendations, sources
        ),
        "exactTargetIdsBySource": {
            source: sorted(group["exactTargetIdsBySource"][source])
            for source in sources
        },
        "candidateTargetIdsBySource": {
            source: sorted(group["candidateTargetIdsBySource"][source])
            for source in sources
        },
        "sharedRelutionTargetIds": shared_group_targets(group, sources),
    }


def shared_group_targets(group: dict[str, Any], sources: list[str]) -> list[str]:
    """Return Relution target ids shared by at least two source mappings."""

    all_target_sources: dict[str, set[str]] = {}
    for source in sources:
        for target_id in [
            *group["exactTargetIdsBySource"][source],
            *group["candidateTargetIdsBySource"][source],
        ]:
            all_target_sources.setdefault(target_id, set()).add(source)
    return sorted(
        target_id
        for target_id, target_sources in all_target_sources.items()
        if len(target_sources) >= 2
    )


def sample_group_recommendations(
    group: dict[str, Any],
    recommendations: dict[str, dict[str, Any]],
    sources: list[str],
) -> list[dict[str, Any]]:
    """Collect bounded example recommendations for a common semantic group."""

    samples = []
    for source in sources:
        for global_id in sorted(group["recommendationsBySource"][source])[:3]:
            recommendation = recommendations.get(global_id, {})
            samples.append(
                {
                    "source": source,
                    "recommendationId": str(
                        recommendation.get("id", global_id.split(":", 1)[1])
                    ),
                    "title": str(recommendation.get("title", "")),
                    "mappingStatus": str(
                        recommendation.get("relutionMapping", {}).get("status", "none")
                    ),
                }
            )
    return samples


def common_group_sort_key(group: dict[str, Any]) -> tuple[int, int, int, str, str]:
    """Sort common groups by BSI coverage, breadth, platform, and concept."""

    sources = group.get("sources", [])
    return (
        0 if AUTHORITATIVE_SOURCE in sources else 1,
        -len(sources),
        PLATFORM_ORDER.get(str(group.get("platform", "")), 99),
        str(group.get("platform", "")),
        str(group.get("conceptId", "")),
    )


def analyze_exact_mapping_differences(
    recommendations: dict[str, dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Find exact-value conflicts and compatible differences against BSI."""

    leaves_by_key = exact_mapping_leaves_by_key(recommendations)
    contradictions: list[dict[str, Any]] = []
    differences: list[dict[str, Any]] = []
    for (platform, kind, target, field_path), leaves in sorted(leaves_by_key.items()):
        sources = {leaf["source"] for leaf in leaves}
        if AUTHORITATIVE_SOURCE not in sources or not sources.intersection(
            set(ALL_SOURCES) - {AUTHORITATIVE_SOURCE}
        ):
            continue
        value_signatures = {leaf["valueSignature"] for leaf in leaves}
        if len(value_signatures) <= 1:
            continue
        entry = exact_value_difference_entry(platform, kind, target, field_path, leaves)
        if exact_leaf_difference_is_hard(leaves):
            entry["id"] = slugify(f"hard-{platform}-{kind}-{target}-{field_path}")
            entry["type"] = "hard-exact-value-contradiction"
            entry["severity"] = "error"
            contradictions.append(entry)
        else:
            entry["id"] = slugify(f"difference-{platform}-{kind}-{target}-{field_path}")
            entry["type"] = "constraint-compatible-exact-value-difference"
            entry["severity"] = "info"
            differences.append(entry)
    return contradictions, differences


def exact_mapping_leaves_by_key(
    recommendations: dict[str, dict[str, Any]],
) -> dict[tuple[str, str, str, str], list[dict[str, Any]]]:
    """Index exact mapping leaf values by platform, target, and field path."""

    leaves_by_key: dict[tuple[str, str, str, str], list[dict[str, Any]]] = {}
    for recommendation in recommendations.values():
        source = str(recommendation["_source"])
        platform = normalize_policy_platform(str(recommendation.get("platform", "")))
        for mapping in exact_mappings(recommendation):
            target = mapping_target(mapping)
            if target is None:
                continue
            flattened = flatten_values(mapping.get("values", {}))
            constraints = constraints_by_path(mapping)
            for path, value in flattened.items():
                path_string = path_to_string(path)
                leaves_by_key.setdefault(
                    (platform, str(mapping["kind"]), target, path_string), []
                ).append(
                    {
                        "source": source,
                        "globalId": recommendation["_globalId"],
                        "recommendationId": recommendation["id"],
                        "title": recommendation["title"],
                        "value": value,
                        "valueSignature": stable_json(value),
                        "constraints": constraints.get(path_string, []),
                    }
                )
    return leaves_by_key


def constraints_by_path(mapping: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    """Group exact-mapping constraints by their declared value path."""

    grouped: dict[str, list[dict[str, Any]]] = {}
    for constraint in mapping.get("constraints", []):
        if not isinstance(constraint, dict) or not isinstance(
            constraint.get("path"), str
        ):
            continue
        grouped.setdefault(str(constraint["path"]), []).append(dict(constraint))
    return grouped


def exact_value_difference_entry(
    platform: str,
    kind: str,
    target: str,
    field_path: str,
    leaves: list[dict[str, Any]],
) -> dict[str, Any]:
    """Render a source-by-source exact-value difference for review."""

    values_by_source: dict[str, list[dict[str, Any]]] = {}
    for leaf in leaves:
        values_by_source.setdefault(str(leaf["source"]), []).append(
            {
                "recommendationId": leaf["recommendationId"],
                "title": leaf["title"],
                "value": leaf["value"],
                "constraints": leaf["constraints"],
            }
        )
    return {
        "id": "",
        "type": "",
        "severity": "",
        "platform": platform,
        "kind": kind,
        "target": target,
        "fieldPath": field_path,
        "sources": sorted(values_by_source),
        "authoritativeSource": AUTHORITATIVE_SOURCE,
        "resolution": (
            "BSI is authoritative for interpretation; this analysis does not rewrite CIS or "
            "vendor mappings."
        ),
        "valuesBySource": {
            source: values_by_source[source] for source in sorted(values_by_source)
        },
    }


def exact_leaf_difference_is_hard(leaves: list[dict[str, Any]]) -> bool:
    """Classify exact-value differences as hard unless constraints overlap."""

    bounds = numeric_constraint_bounds(leaves)
    if bounds is not None:
        lower, upper = bounds
        if upper is None or lower is None or lower <= upper:
            return False
    return True


def numeric_constraint_bounds(
    leaves: list[dict[str, Any]],
) -> tuple[float | None, float | None] | None:
    """Return combined numeric bounds when exact leaves carry constraints."""

    lower: float | None = None
    upper: float | None = None
    saw_numeric_constraint = False
    for leaf in leaves:
        for constraint in leaf.get("constraints", []):
            if not isinstance(constraint, dict):
                continue
            value = constraint.get("value")
            if not isinstance(value, int | float):
                continue
            operator = constraint.get("operator")
            if operator == "atLeast":
                lower = value if lower is None else max(lower, value)
                saw_numeric_constraint = True
            elif operator == "atMost":
                upper = value if upper is None else min(upper, value)
                saw_numeric_constraint = True
    if not saw_numeric_constraint:
        return None
    return lower, upper


def semantic_group_differences(
    common_groups: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Report BSI-authoritative coverage and support differences by group."""

    differences: list[dict[str, Any]] = []
    for group in common_groups:
        sources = list(group.get("sources", []))
        if AUTHORITATIVE_SOURCE not in sources:
            continue
        if group.get("missingSources"):
            differences.append(
                {
                    "id": slugify(f"coverage-{group['platform']}-{group['conceptId']}"),
                    "type": "source-coverage-gap",
                    "severity": "info",
                    "platform": group["platform"],
                    "conceptId": group["conceptId"],
                    "sources": sources,
                    "missingSources": group["missingSources"],
                    "authoritativeSource": AUTHORITATIVE_SOURCE,
                    "resolution": (
                        "BSI participates in this semantic group; absent CIS/vendor coverage "
                        "is noted, not remapped."
                    ),
                }
            )
        support_by_source = {
            source: semantic_support_level(
                group["exactTargetIdsBySource"].get(source, []),
                group["candidateTargetIdsBySource"].get(source, []),
            )
            for source in sources
        }
        bsi_support = support_by_source.get(AUTHORITATIVE_SOURCE)
        if bsi_support is not None and any(
            level != bsi_support for level in support_by_source.values()
        ):
            differences.append(
                {
                    "id": slugify(f"support-{group['platform']}-{group['conceptId']}"),
                    "type": "mapping-support-difference",
                    "severity": "info",
                    "platform": group["platform"],
                    "conceptId": group["conceptId"],
                    "sources": sources,
                    "supportBySource": support_by_source,
                    "authoritativeSource": AUTHORITATIVE_SOURCE,
                    "resolution": (
                        "Support-level differences are evidence for review; exact mappings remain "
                        "source-owned."
                    ),
                }
            )
    return differences
