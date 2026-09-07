"""Index comparison rules for institution policy baselines."""

from __future__ import annotations

from collections import Counter, defaultdict
from typing import Any

from .matching import (
    baseline_target_matches_policy,
    conflict_for,
)
from .summary import comparison_summary_by_platform
from .utils import platform_rank


def compare_indexes(
    institution_index: dict[str, Any], baseline_index: dict[str, Any]
) -> dict[str, Any]:
    """Compare institution policy records with generated baseline targets."""

    results = []
    matched_baseline_ids = set()
    targets_by_platform = defaultdict(list)
    for target in baseline_index["actionableTargets"]:
        targets_by_platform[target["platform"]].append(target)

    for policy in institution_index["policies"]:
        candidates = targets_by_platform[policy["platform"]]
        target_matches = [
            target
            for target in candidates
            if baseline_target_matches_policy(policy, target)
        ]
        conflicts = [conflict_for(policy, target) for target in target_matches]
        conflicts = [conflict for conflict in conflicts if conflict is not None]
        for target in target_matches:
            matched_baseline_ids.add(target["ruleId"])
        results.append(
            {
                "policyId": policy["id"],
                "platform": policy["platform"],
                "title": policy["title"],
                "status": comparison_status(policy, target_matches, conflicts),
                "matchedTargets": target_matches,
                "conflicts": conflicts,
                "controls": policy["controls"],
                "relutionTargets": policy["relutionTargets"],
                "sourcePath": policy["sourcePath"],
                "lineStart": policy["lineStart"],
                "lineEnd": policy["lineEnd"],
            }
        )

    missing = [
        target
        for target in baseline_index["actionableTargets"]
        if target["ruleId"] not in matched_baseline_ids
    ]
    status_counts = Counter(result["status"] for result in results)
    return {
        "version": 1,
        "name": "Institution Policy Catalog vs Generated Relution Baseline",
        "generatedAt": baseline_index.get("generatedAt"),
        "inputs": {
            "institutionPolicyIndexPath": (
                "example/institution-policy-comparison/institution-policy-index.json"
            ),
            "relutionBaselineIndexPath": (
                "example/institution-policy-comparison/relution-baseline-index.json"
            ),
        },
        "policyResults": sorted(
            results, key=lambda row: (platform_rank(row["platform"]), row["policyId"])
        ),
        "baselineMissingInInstitution": sorted(
            missing,
            key=lambda row: (
                platform_rank(row["platform"]),
                row["target"],
                row["ruleId"],
            ),
        ),
        "suppressedBaselineConflicts": baseline_index["suppressedConflicts"],
        "summary": {
            "institutionPolicies": len(results),
            "baselineActionableTargets": len(baseline_index["actionableTargets"]),
            "baselineMissingInInstitution": len(missing),
            "statusCounts": dict(sorted(status_counts.items())),
            "byPlatform": comparison_summary_by_platform(results, missing),
        },
    }


def comparison_status(
    policy: dict[str, Any],
    matches: list[dict[str, Any]],
    conflicts: list[dict[str, Any]],
) -> str:
    """Classify one institution policy comparison result."""

    if conflicts:
        return "conflict"
    if matches:
        return "covered"
    if policy["relutionTargets"] or policy["controls"]:
        return "documented-only"
    return "institution-only"
