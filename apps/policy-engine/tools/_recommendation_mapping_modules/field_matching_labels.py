"""Labels helpers for recommendation mapping."""

from ._mapping_lexical_constants import EXACT_IGNORABLE_TOKENS
from ._mapping_lexical_constants import LOW_SIGNAL_TOKENS

def is_exact_label_match(
    setting_tokens: set[str], label_tokens: frozenset[str]
) -> bool:
    """Return true for exact setting-label token matches with minor ignored terms."""

    if not setting_tokens or not label_tokens:
        return False
    important_setting = setting_tokens - LOW_SIGNAL_TOKENS
    important_label = set(label_tokens) - LOW_SIGNAL_TOKENS
    if important_setting == important_label:
        return True
    if (
        important_setting.symmetric_difference(important_label)
        <= EXACT_IGNORABLE_TOKENS
    ):
        return True
    return False
