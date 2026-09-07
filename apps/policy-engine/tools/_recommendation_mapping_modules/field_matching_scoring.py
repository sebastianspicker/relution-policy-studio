"""Scoring helpers for recommendation mapping."""

from typing import Any
from ._mapping_models import FieldEntry
from ._mapping_lexical_constants import LOW_SIGNAL_TOKENS
from ._mapping_models import ScoredField

from .field_matching_boolean import (
    value_compatibility,
)

from .field_matching_candidates import (
    kind_priority,
)

from .field_matching_field_score import (
    field_match_score,
)

from .field_matching_tokens import (
    tokenize,
)

from .field_matching_windows_state import (
    normalized_state,
)

def score_fields(
    platform: str,
    title: str,
    section: str,
    field_index: dict[str, list[FieldEntry]],
    options: dict[str, Any] | None = None,
) -> list[ScoredField]:
    """Score Relution and Apple fields against recommendation wording."""

    options = options or {}
    extra_texts = tuple(str(text) for text in options.get("extraTexts", ()))
    recommended_value = options.get("recommendedValue")
    query_tokens = tokenize(
        section,
        title,
        *(str(text) for text in extra_texts),
        str(recommended_value or ""),
    )
    if not query_tokens:
        return []
    value_state = normalized_state(recommended_value)
    scored: list[ScoredField] = []
    for field in field_index.get(platform, []):
        if not field_allowed(
            field, options.get("allowedKinds"), options.get("fieldKinds")
        ):
            continue
        matched = query_tokens & field.tokens
        if not has_important_match(matched):
            continue
        compatibility = value_compatibility(field, value_state, recommended_value)
        score = field_match_score(field, query_tokens, matched, compatibility)
        if score >= int(options.get("minimumScore", 8)):
            scored.append(
                ScoredField(score, tuple(sorted(matched)), compatibility, field)
            )
    scored.sort(
        key=lambda entry: (
            -entry.score,
            kind_priority(entry.field.kind),
            entry.field.target,
            entry.field.field_path,
        )
    )
    return scored
def field_allowed(
    field: FieldEntry, allowed_kinds: set[str] | None, field_kinds: set[str] | None
) -> bool:
    """Check whether a field passes optional kind filters."""

    if allowed_kinds is not None and field.kind not in allowed_kinds:
        return False
    return field_kinds is None or field.field_kind in field_kinds
def has_important_match(matched: set[str]) -> bool:
    """Require at least one matched token beyond low-signal filler."""

    return bool(matched - LOW_SIGNAL_TOKENS)
