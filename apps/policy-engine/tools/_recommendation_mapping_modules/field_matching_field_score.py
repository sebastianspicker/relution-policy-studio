"""Field Score helpers for recommendation mapping."""

from ._mapping_models import FieldEntry
from ._mapping_lexical_constants import LOW_SIGNAL_TOKENS

def field_match_score(
    field: FieldEntry, query_tokens: set[str], matched: set[str], compatibility: str
) -> int:
    """Compute a deterministic field score from tokens and value compatibility."""

    score = sum(4 if token not in LOW_SIGNAL_TOKENS else 1 for token in matched)
    important_label = set(field.label_tokens) - LOW_SIGNAL_TOKENS
    if len(important_label) >= 2 and field.label_tokens <= query_tokens:
        score += 10
    if compatibility != "unknown":
        score += 2
    return score
