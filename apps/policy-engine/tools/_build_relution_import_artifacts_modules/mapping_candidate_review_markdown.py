"""Render the mapping candidate review Markdown report."""

from typing import Any

from .artifact_io_values import stable_json


def render_mapping_candidate_review_report(
    reference_payload: dict[str, Any], review_payload: dict[str, Any]
) -> str:
    """Render the Markdown summary for offline mapping candidate review."""

    summary = review_payload["summary"]
    reference_summary = reference_payload["summary"]
    lines = [
        "# Offline Bilingual Mapping Candidate Review",
        "",
        f"Generated: `{review_payload['generatedAt']}`",
        "",
        "## Scope",
        "",
        (
            "This deterministic artifact uses existing exact BSI, CIS, and vendor mappings "
            "as bilingual reference examples. It does not promote mappings automatically."
        ),
        "",
        "## Summary",
        "",
        f"- Exact reference mappings: `{summary['exactReferenceCount']}`",
        f"- Reviewed non-exact recommendations: `{summary['totalReviewedRecommendations']}`",
        f"- Exact references by source: `{stable_json(reference_summary['bySource'])}`",
        f"- Exact references by language: `{stable_json(reference_summary['byLanguage'])}`",
        f"- Review actions: `{stable_json(summary['bySuggestedReviewAction'])}`",
        "",
        "## Promotion Rule",
        "",
        (
            "Candidate similarity is advisory. Exact mappings require a validated entry in "
            "`example/recommendation-coverage/manual-mapping-promotions.json` with explicit "
            "evidence and exact-reference links."
        ),
        "",
        "## Guideline Drift Artifacts",
        "",
        (
            "- `example/recommendation-coverage/source-change-report.json` tracks "
            "BSI/CIS/vendor source hash drift against the previous generated report."
        ),
        (
            "- `example/recommendation-coverage/ruleset-update-plan.json` turns changed "
            "sources into review-gated update rows. Safe rows may be retained mechanically; "
            "exact mapping promotions still require the manual ledger."
        ),
        (
            "- `example/recommendation-coverage/relution-mapping-change-report.json` tracks "
            "recommendation-to-Relution mapping drift against the previous generated "
            "report."
        ),
        (
            "- `example/recommendation-coverage/relution-mapping-update-plan.json` records "
            "safe mapping updates separately from manual-ledger review rows."
        ),
        (
            "- `tools/update_guideline_mappings.py --offline --source all` rebuilds these "
            "artifacts from checked-in source material. Online refresh currently fails "
            "closed for BSI/CIS because no safe downloader is implemented there."
        ),
        "",
        "## Top Review Queues",
        "",
    ]
    queue_counts = summary["bySuggestedReviewAction"]
    for action, count in sorted(
        queue_counts.items(), key=lambda item: (-item[1], item[0])
    ):
        lines.append(f"- `{action}`: `{count}`")
    return "\n".join(lines) + "\n"
