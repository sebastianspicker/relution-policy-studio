"""Format mapping candidate review rows and reports."""

from typing import Any

from .artifact_paths import (
    MAPPING_CANDIDATE_REVIEW_REPORT_PATH,
)
from .artifact_io import (
    normalize_policy_platform,
    stable_json,
)
from recommendation_mapping import (
    unique_preserving_order,
)
from .semantic_review_candidates import (
    bilingual_tokens,
    detect_mapping_language,
    extracted_mapping_intent,
    nearest_exact_references,
    ranked_review_candidates,
    recommendation_semantic_concepts,
    recommendation_source_text,
    semantic_review_analysis,
    suggested_review_action,
)


def mapping_candidate_review_row(
    global_id: str,
    recommendation: dict[str, Any],
    current_status: str,
    references_by_platform: dict[str, list[dict[str, Any]]],
) -> dict[str, Any]:
    """Build one review row for a non-exact recommendation mapping."""

    source = str(recommendation["_source"])
    platform = normalize_policy_platform(str(recommendation.get("platform", "")))
    source_text = recommendation_source_text(source, recommendation)
    tokens = bilingual_tokens(source_text, recommendation)
    semantic_ids = [
        str(concept["id"])
        for concept in recommendation_semantic_concepts(recommendation)
    ]
    nearest_references = nearest_exact_references(
        platform,
        tokens,
        semantic_ids,
        references_by_platform.get(platform, []),
        limit=5,
    )
    ranked_candidates = ranked_review_candidates(
        recommendation, tokens, semantic_ids, nearest_references
    )
    extracted_intent = extracted_mapping_intent(source, recommendation, source_text)
    return {
        "source": source,
        "recommendationId": str(recommendation["id"]),
        "globalRecommendationId": global_id,
        "platform": platform,
        "language": detect_mapping_language(source_text),
        "title": str(recommendation.get("title", "")),
        "currentMappingStatus": current_status,
        "currentImplementationCategory": str(
            recommendation.get("implementation", {}).get("category", "gap")
        ),
        "extractedIntent": extracted_intent,
        "normalizedTokens": tokens,
        "semanticConceptIds": semantic_ids,
        "semanticAnalysis": semantic_review_analysis(
            current_status,
            extracted_intent,
            semantic_ids,
            ranked_candidates,
            nearest_references,
        ),
        "nearestExactReferences": nearest_references,
        "rankedCandidates": ranked_candidates,
        "suggestedReviewAction": suggested_review_action(
            current_status, ranked_candidates, nearest_references
        ),
        "blockedBy": mapping_candidate_blockers(recommendation),
    }


def mapping_candidate_blockers(recommendation: dict[str, Any]) -> list[str]:
    """Return mapping notes and implementation blockers that explain review limits."""

    relution_mapping = recommendation.get("relutionMapping", {})
    return unique_preserving_order(
        [
            *[
                str(note)
                for note in relution_mapping.get("notes", [])
                if isinstance(note, str) and note
            ],
            *[
                str(reason)
                for reason in recommendation.get("implementation", {}).get(
                    "blockingReasons", []
                )
                if isinstance(reason, str) and reason
            ],
        ]
    )


def write_mapping_candidate_review_report(
    reference_payload: dict[str, Any], review_payload: dict[str, Any]
) -> None:
    """Write the Markdown summary for offline mapping candidate review."""

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
            "This backend artifact uses existing exact BSI, CIS, and vendor mappings as "
            "bilingual reference examples. It does not call an external LLM or promote "
            "mappings automatically."
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
    MAPPING_CANDIDATE_REVIEW_REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    MAPPING_CANDIDATE_REVIEW_REPORT_PATH.write_text(
        "\n".join(lines) + "\n", encoding="utf8"
    )
