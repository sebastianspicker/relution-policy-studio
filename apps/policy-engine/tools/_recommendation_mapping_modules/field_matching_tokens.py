"""Tokens helpers for recommendation mapping."""

from ._mapping_lexical_constants import STOP_WORDS
from ._mapping_lexical_constants import SYNONYMS
import re

def tokenize(*values: str) -> set[str]:
    """Tokenize bilingual labels with synonym and stop-word normalization."""

    tokens: set[str] = set()
    for value in values:
        spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", value)
        spaced = (
            spaced.replace("ä", "ae")
            .replace("ö", "oe")
            .replace("ü", "ue")
            .replace("ß", "ss")
        )
        for raw in re.split(r"[^A-Za-z0-9]+", spaced.lower()):
            if len(raw) < 2:
                continue
            normalized = SYNONYMS.get(raw, raw)
            if normalized.endswith("s") and len(normalized) > 4:
                normalized = SYNONYMS.get(normalized[:-1], normalized)
            if normalized and normalized not in STOP_WORDS:
                tokens.add(normalized)
    return tokens
def token_string(tokens: set[str] | frozenset[str]) -> str:
    """Render tokens in deterministic order for equality checks."""

    return " ".join(sorted(tokens))
