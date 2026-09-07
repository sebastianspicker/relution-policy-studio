"""Report rendering and artifact writing for baseline comparisons."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .constants import PLATFORMS
from .utils import stable_json, write_json


def write_outputs(
    output_root: Path,
    institution_index: dict[str, Any],
    baseline_index: dict[str, Any],
    comparison: dict[str, Any],
) -> None:
    """Write comparison JSON artifacts and Markdown summary."""

    output_root.mkdir(parents=True, exist_ok=True)
    write_json(output_root / "institution-policy-index.json", institution_index)
    write_json(output_root / "relution-baseline-index.json", baseline_index)
    write_json(output_root / "institution-vs-relution-baseline.json", comparison)
    (output_root / "institution-vs-relution-baseline.md").write_text(
        render_markdown(comparison), encoding="utf8"
    )


def render_markdown(comparison: dict[str, Any]) -> str:
    """Render a compact human-readable comparison summary."""

    lines = [
        "# Institution Policy Catalog vs Generated Relution Baseline",
        "",
        f"Generated from baseline snapshot: `{comparison['generatedAt']}`",
        "",
        "## Summary",
        "",
        f"- Institution policies indexed: `{comparison['summary']['institutionPolicies']}`",
        "- Generated actionable baseline targets: "
        f"`{comparison['summary']['baselineActionableTargets']}`",
        "- Baseline targets missing in institution catalog: "
        f"`{comparison['summary']['baselineMissingInInstitution']}`",
        f"- Policy status counts: `{stable_json(comparison['summary']['statusCounts'])}`",
        "",
        "## Platform Results",
        "",
    ]
    for platform in PLATFORMS:
        platform_results = [
            row for row in comparison["policyResults"] if row["platform"] == platform
        ]
        missing = [
            row
            for row in comparison["baselineMissingInInstitution"]
            if row["platform"] == platform
        ]
        lines.append(f"### {platform}")
        lines.append("")
        lines.append(f"- Institution policies: `{len(platform_results)}`")
        lines.append(f"- Missing generated actionable targets: `{len(missing)}`")
        for result in platform_results[:25]:
            matched_target_summary = (
                ", ".join(target["target"] for target in result["matchedTargets"][:4])
                or "no actionable target match"
            )
            lines.append(
                f"- `{result['status']}` `{result['policyId']}`: "
                f"{matched_target_summary}"
            )
        if len(platform_results) > 25:
            lines.append(
                f"- ... `{len(platform_results) - 25}` more Institution policies in JSON report."
            )
        if missing:
            lines.append("")
            lines.append("Missing generated actionable targets:")
            for target in missing[:20]:
                lines.append(f"- `{target['target']}` via `{target['ruleId']}`")
            if len(missing) > 20:
                lines.append(
                    f"- ... `{len(missing) - 20}` more missing targets in JSON report."
                )
        lines.append("")
    return "\n".join(lines)
