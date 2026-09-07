"""Cohesive implementation stage 7 for mapping_review_artifacts."""

from typing import Any

def update_confidence_tier(
    change_classification: str,
    recommendation: dict[str, Any],
    exact_refs: list[dict[str, Any]],
    review_row: dict[str, Any] | None,
) -> str:
    """Classify update-plan confidence from source drift and mapping evidence."""

    status = str(recommendation.get("relutionMapping", {}).get("status", "none"))
    decisions = (
        ("safe-retain", change_classification == "metadata-only"),
        (
            "gap-or-parser-work",
            change_classification in {"removed-source", "parser-breaking"},
        ),
        (
            "manual-ledger-needed",
            change_classification == "text-changed" and bool(exact_refs),
        ),
        (
            "parameter-needed",
            change_classification == "text-changed"
            and review_row is not None
            and status == "parameterized",
        ),
        (
            "manual-ledger-needed",
            change_classification == "text-changed" and review_row is not None,
        ),
        (
            "manual-ledger-needed",
            change_classification == "new-source" and review_row is not None,
        ),
        ("gap-or-parser-work", change_classification == "new-source"),
    )
    for confidence_tier, matched in decisions:
        if matched:
            return confidence_tier
    return "safe-retain"

def required_action_for_confidence_tier(confidence_tier: str) -> str:
    """Map update confidence tiers to required review or apply actions."""

    return {
        "safe-retain": "apply-safe",
        "safe-mechanical-update": "apply-safe",
        "manual-ledger-needed": "review-manual-ledger",
        "parameter-needed": "supply-local-parameters",
        "gap-or-parser-work": "inspect-parser-or-source",
    }.get(confidence_tier, "review")

def update_plan_reason(change_classification: str, confidence_tier: str) -> str:
    """Explain why an update-plan row received its confidence tier."""

    if confidence_tier == "safe-retain":
        return (
            "Source metadata changed without content hash drift; current mapping artifacts "
            "can be retained."
        )
    if confidence_tier == "safe-mechanical-update":
        return (
            "Target and field paths are stable and the value change is type-compatible."
        )
    if confidence_tier == "manual-ledger-needed":
        return (
            "Changed source text requires human review before exact mapping promotion or "
            "value changes."
        )
    if confidence_tier == "parameter-needed":
        return "Recommendation remains parameterized; local values or evidence are required."
    if change_classification == "removed-source":
        return "Source disappeared from the manifest and needs review before mappings are removed."
    return "No reliable mapping update can be inferred automatically."

