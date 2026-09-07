"""Recommendation setting-state extraction for field matching."""

from typing import Any
import re
from .field_matching_windows_state import normalize_setting_name, normalized_state


def extract_setting_state(title: str, recommended_value: Any) -> tuple[str, str | None]:
    """Split a recommendation title into setting text and normalized state."""
    quoted_match = re.search(
        (
            "[\\\"'“”](?P<setting>.+?)[\\\"'“”]\\s+"
            "(?:is\\s+)?(?:set\\s+to|configured\\s+to|is)\\s+"
            "[\\\"'“”]?(?P<state>[^\\\"'“”]+?)[\\\"'“”]?$"
        ),
        title,
        re.IGNORECASE,
    )
    if quoted_match is not None:
        return normalize_setting_name(quoted_match.group("setting")), normalized_state(
            quoted_match.group("state")
        )
    setting = re.sub(r"^ensure\\s+", "", title, flags=re.IGNORECASE)
    setting = re.sub(
        r"\\s+is\\s+(?:configured|enabled|disabled)$", "", setting, flags=re.IGNORECASE
    )
    return normalize_setting_name(setting), normalized_state(recommended_value)
