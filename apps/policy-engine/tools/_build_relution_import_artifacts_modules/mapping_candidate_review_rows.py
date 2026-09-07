"""Build machine-readable mapping candidate review rows."""

from typing import Any

from _recommendation_mapping_modules._mapping_lexical_constants import unique_preserving_order

from .artifact_io_values import normalize_policy_platform
from .semantic_evidence_extraction import bilingual_tokens
from .semantic_evidence_extraction import detect_mapping_language
from .semantic_intent_analysis import extracted_mapping_intent
from .semantic_reference_matching import nearest_exact_references
from .semantic_reference_matching import PreparedExactReference
from .semantic_candidate_ranking import ranked_review_candidates
from .semantic_evidence_extraction import recommendation_semantic_concepts
from .semantic_evidence_extraction import recommendation_source_text
from .semantic_review_analysis import semantic_review_analysis
from .semantic_intent_analysis import suggested_review_action


def mapping_candidate_review_row(
    global_id: str,
    recommendation: dict[str, Any],
    current_status: str,
    references_by_platform: dict[str, tuple[PreparedExactReference, ...]],
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
