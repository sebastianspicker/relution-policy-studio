"""Institution policy identifier parsing helpers."""

from __future__ import annotations


def identifier_like_tokens(text: str) -> list[str]:
    """Extract alphanumeric identifier-like tokens while keeping dots and dashes."""

    tokens: list[str] = []
    current: list[str] = []
    allowed_extra = {".", "-"}
    for char in text:
        if char.isalnum() or char in allowed_extra:
            current.append(char)
            continue
        if current:
            tokens.append("".join(current))
            current = []
    if current:
        tokens.append("".join(current))
    return tokens


def is_policy_id(value: str) -> bool:
    """Check the institution policy id format."""

    parts = value.split("-")
    if (
        len(parts) < 3
        or parts[0] not in {"WIN", "MAC", "IOS", "AND"}
        or len(parts[-1]) != 3
        or not parts[-1].isdigit()
    ):
        return False
    return all(part.isalnum() and part.upper() == part for part in parts[1:-1])
