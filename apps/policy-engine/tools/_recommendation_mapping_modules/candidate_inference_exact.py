"""Exact helpers for recommendation mapping."""

from typing import Any
from ._mapping_models import FieldEntry
from .field_matching_boolean import boolean_value_for_field
from .field_matching_setting_state import extract_setting_state
from .field_matching_labels import is_exact_label_match
from .field_matching_candidates import kind_priority
from .field_matching_scoring import score_fields
from .field_matching_tokens import tokenize
from .field_matching_values import value_at_path

def infer_exact_boolean_mapping(
    platform: str,
    title: str,
    recommended_value: Any,
    field_index: dict[str, list[FieldEntry]],
    options: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """Infer exact boolean mappings only from unambiguous label/state matches."""
    options = options or {}
    setting_name, state = extract_setting_state(title, recommended_value)
    if state is None or not tokenize(setting_name):
        return None
    best = best_exact_boolean_match(
        platform, setting_name, recommended_value, field_index, options
    )
    if best is None:
        return None
    desired = boolean_value_for_field(setting_name, state, best.field)
    return None if desired is None else exact_boolean_mapping_for_match(best, desired)
def best_exact_boolean_match(
    platform: str,
    setting_name: str,
    recommended_value: Any,
    field_index: dict[str, list[FieldEntry]],
    options: dict[str, Any],
) -> Any | None:
    """Return the best exact boolean field match unless matching is ambiguous."""
    setting_tokens = tokenize(setting_name)
    scored = score_fields(
        platform,
        setting_name,
        str(options.get("section", "")),
        field_index,
        {
            "extraTexts": tuple(str(text) for text in options.get("extraTexts", ())),
            "recommendedValue": recommended_value,
            "allowedKinds": options.get("allowedKinds"),
            "fieldKinds": {"boolean"},
            "minimumScore": 1,
        },
    )
    exact_matches = [
        entry
        for entry in scored
        if is_exact_label_match(setting_tokens, entry.field.label_tokens)
    ]
    if not exact_matches:
        return None
    exact_matches.sort(
        key=lambda entry: (
            kind_priority(entry.field.kind),
            -entry.score,
            entry.field.target,
            entry.field.field_path,
        )
    )
    best = exact_matches[0]
    next_best = exact_matches[1] if len(exact_matches) > 1 else None
    if (
        next_best is not None
        and best.field.kind == next_best.field.kind
        and best.field.label_tokens == next_best.field.label_tokens
    ):
        return None
    return best
def exact_boolean_mapping_for_match(best: Any, desired: Any) -> dict[str, Any] | None:
    """Render an exact mapping from a matched boolean field and desired value."""
    mapping = {
        "kind": best.field.kind,
        "values": value_at_path(best.field.field_path, desired),
        "match": {
            "score": best.score,
            "matchedTerms": list(best.matched_terms),
            "valueCompatibility": best.value_compatibility,
            "reason": (
                "Exact boolean mapping inferred from matching setting label and recommended "
                "state."
            ),
        },
    }
    if best.field.kind == "relution-native":
        mapping["type"] = best.field.target
    elif best.field.kind == "apple-schema-profile":
        mapping["schemaId"] = best.field.target
    elif best.field.kind == "apple-mobileconfig":
        mapping["payloadType"] = best.field.target
    else:
        return None
    return mapping
