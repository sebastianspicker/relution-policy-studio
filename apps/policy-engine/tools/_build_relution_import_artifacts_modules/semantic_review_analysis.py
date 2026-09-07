"""Cohesive implementation stage 3 for semantic_review_candidates."""

from typing import Any

def semantic_review_analysis(
    current_status: str,
    extracted_intent: dict[str, Any],
    semantic_ids: list[str],
    ranked_candidates: list[dict[str, Any]],
    nearest_references: list[dict[str, Any]],
) -> dict[str, str]:
    """Summarize recommendation meaning, Relution fit, and exactness for reviewers."""
    action = str(extracted_intent.get("action", "unspecified"))
    has_value = bool(extracted_intent.get("hasConcreteValue", False))
    local_parameter = bool(extracted_intent.get("localParameterLikely", False))
    concept_text = ", ".join(semantic_ids) if semantic_ids else "no curated concept"
    if has_value:
        recommendation_meaning = (
            f"{action} recommendation with a concrete value and concepts: "
            f"{concept_text}."
        )
    elif local_parameter:
        recommendation_meaning = (
            f"{action} recommendation that depends on local identifiers, scope, or "
            f"organization-specific values; concepts: {concept_text}."
        )
    else:
        recommendation_meaning = (
            f"{action} recommendation interpreted through concepts: {concept_text}."
        )

    if ranked_candidates:
        top = ranked_candidates[0]
        relution_fit = (
            f"Best Relution candidate is {top['kind']}:{top['target']} with score "
            f"{top['score']} from {top['provenance']}."
        )
    elif nearest_references:
        relution_fit = (
            "No generated candidate target exists, but nearest exact references give review "
            "context."
        )
    else:
        relution_fit = (
            "No Relution candidate or exact-reference context is strong enough in this "
            "snapshot."
        )

    if current_status == "parameterized":
        exactness_decision = (
            "parameter candidate: Relution support exists, but local values or evidence are "
            "required before exact compliance."
        )
    elif ranked_candidates:
        exactness_decision = (
            "candidate only, not exact: semantic and reference evidence is advisory and "
            "cannot create an importable mapping without manual ledger evidence."
        )
    else:
        exactness_decision = (
            "not exact: keep as gap/helper until a concrete Relution setting and values are "
            "proven."
        )

    return {
        "recommendationMeaning": recommendation_meaning,
        "relutionFit": relution_fit,
        "exactnessDecision": exactness_decision,
    }

def candidate_setting_meaning(
    spec: dict[str, Any],
    shared_concepts: list[str],
    shared_tokens: list[str],
    provenance: str,
) -> str:
    """Describe why a candidate setting is relevant without promoting it to exact."""
    target = str(spec.get("target", ""))
    paths = [str(path) for path in spec.get("fieldPaths", []) if isinstance(path, str)]
    concept_text = ", ".join(
        shared_concepts or [str(spec.get("semanticConceptId", ""))]
    ).strip(", ")
    token_text = ", ".join(shared_tokens[:6])
    if concept_text:
        basis = f"matches semantic concept {concept_text}"
    elif token_text:
        basis = f"shares language tokens {token_text}"
    else:
        basis = "is a nearby setting-family candidate"
    return f"{target} fields {', '.join(paths) or 'unknown'} {basis}; provenance: {provenance}."

