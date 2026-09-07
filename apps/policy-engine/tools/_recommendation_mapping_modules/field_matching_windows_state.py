"""Windows State helpers for recommendation mapping."""

from typing import Any
from ._mapping_lexical_constants import BLOCK_STATES
from ._mapping_lexical_constants import CONFIGURED_STATES
from ._mapping_lexical_constants import NEGATIVE_STATES
from ._mapping_lexical_constants import POSITIVE_STATES
import re

def is_simple_windows_state(recommended_value: Any, state: str | None) -> bool:
    """Check whether a recommendation state is simple enough for exact CSP matching."""

    if isinstance(recommended_value, bool):
        return True
    if state not in POSITIVE_STATES | NEGATIVE_STATES:
        return False
    text = re.sub(r"\s+", " ", str(recommended_value or "").strip().lower())
    return text in POSITIVE_STATES | NEGATIVE_STATES
def windows_csp_state_matches(state: str | None, evidence_state: Any) -> bool:
    """Compare normalized recommendation state with harvested CSP evidence state."""

    if not isinstance(evidence_state, str):
        return False
    if state in POSITIVE_STATES:
        return evidence_state == "enabled"
    if state in NEGATIVE_STATES:
        return evidence_state == "disabled"
    return False
def normalize_setting_name(value: str) -> str:
    """Trim quotes and collapse whitespace in extracted setting labels."""

    value = re.sub(r"\s+", " ", value.strip())
    value = value.strip("\"'“”")
    return value
def normalized_state(value: Any) -> str | None:
    """Normalize recommendation values to coarse enabled/disabled/configured states."""

    if isinstance(value, bool):
        return "true" if value else "false"
    text = re.sub(r"\s+", " ", str(value or "").strip().lower())
    if not text:
        return None
    exact_states = {
        **{
            state: state
            for state in POSITIVE_STATES | NEGATIVE_STATES | CONFIGURED_STATES
        },
        "enable": "enabled",
        "disable": "disabled",
    }
    if text in exact_states:
        return exact_states[text]
    prefix_states = (
        ("force deny", "block"),
        ("block", "block"),
        ("enabled", "enabled"),
        ("disabled", "disabled"),
    )
    for prefix, state in prefix_states:
        if text.startswith(prefix):
            return state
    return "block" if text in BLOCK_STATES else None
