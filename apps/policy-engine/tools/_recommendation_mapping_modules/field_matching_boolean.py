"""Boolean helpers for recommendation mapping."""

from ._mapping_lexical_constants import ALLOW_TERMS
from typing import Any
from ._mapping_lexical_constants import CONFIGURED_STATES
from ._mapping_models import FieldEntry
from ._mapping_lexical_constants import NEGATIVE_STATES
from ._mapping_lexical_constants import NEGATIVE_TERMS
from ._mapping_lexical_constants import POSITIVE_STATES
import re

from .field_matching_tokens import (
    token_string,
    tokenize,
)

def boolean_value_for_field(
    setting_name: str, state: str, field: FieldEntry
) -> bool | None:
    """Infer a boolean Relution value from setting/state wording and field polarity."""

    field_tokens = tokenize(field.label, field.field_path)
    setting_tokens = tokenize(setting_name)
    negative_field = bool(field_tokens & NEGATIVE_TERMS)
    allow_field = bool(field_tokens & ALLOW_TERMS)
    negative_setting = bool(setting_tokens & NEGATIVE_TERMS)

    if state in POSITIVE_STATES:
        return True
    if state in NEGATIVE_STATES:
        return negative_field and not allow_field
    if state == "block":
        return not (allow_field and not negative_field)
    if state in CONFIGURED_STATES:
        if negative_field or negative_setting:
            return True
        return None
    return None
def value_compatibility(
    field: FieldEntry, value_state: str | None, recommended_value: Any
) -> str:
    """Classify whether the recommendation value shape fits a field."""

    if field.field_kind == "boolean" and value_state is not None:
        return "boolean-state"
    if field.enum_values and isinstance(recommended_value, str):
        normalized_value = token_string(tokenize(recommended_value))
        for enum_value in field.enum_values:
            if token_string(tokenize(enum_value)) == normalized_value:
                return "enum-value"
    if field.field_kind in {"integer", "number"} and re.search(
        r"\d+", str(recommended_value or "")
    ):
        return "numeric-value"
    return "unknown"
