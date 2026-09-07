"""Windows Text helpers for recommendation mapping."""

from typing import Any
from ._mapping_lexical_constants import WINDOWS_POLICY_SIGNATURE_STOP_WORDS
from ._mapping_lexical_constants import WINDOWS_POLICY_SIGNATURE_SYNONYMS
import re

def windows_policy_signature(value: str) -> frozenset[str]:
    """Build a stable token signature for Windows policy name matching."""

    tokens: set[str] = set()
    for raw in split_identifier(value):
        if len(raw) < 2:
            continue
        normalized = WINDOWS_POLICY_SIGNATURE_SYNONYMS.get(raw, raw)
        if normalized.endswith("s") and len(normalized) > 4:
            normalized = WINDOWS_POLICY_SIGNATURE_SYNONYMS.get(
                normalized[:-1], normalized[:-1]
            )
        if normalized and normalized not in WINDOWS_POLICY_SIGNATURE_STOP_WORDS:
            tokens.add(normalized)
    return frozenset(tokens)
def split_identifier(value: str) -> list[str]:
    """Split identifiers, camelCase, and digit boundaries into lowercase words."""

    spaced = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1 \2", value)
    spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", spaced)
    spaced = re.sub(r"([A-Za-z])([0-9])", r"\1 \2", spaced)
    spaced = re.sub(r"([0-9])([A-Za-z])", r"\1 \2", spaced)
    return [raw for raw in re.split(r"[^A-Za-z0-9]+", spaced.lower()) if raw]
def loc_uri_leaf(value: Any) -> str | None:
    """Return the final segment of a CSP LocURI-like string."""

    if not isinstance(value, str) or "/" not in value:
        return None
    return value.rsplit("/", 1)[-1]
