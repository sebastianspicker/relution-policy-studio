"""Apple Numeric Macos helpers for recommendation mapping."""

from ._apple_analog_constants import APPLE_SCREEN_SAVER
from typing import Any
from .field_matching_apple_mapping import apple_schema_mapping
from .field_matching_text import first_int

def macos_numeric_analog_mappings(haystack: str) -> list[dict[str, Any]]:
    """Infer macOS screen-saver numeric analog mappings from normalized text."""
    mappings: list[dict[str, Any]] = []
    if (
        "inactivity interval" in haystack
        and "screen saver" in haystack
        and (minutes := first_int(haystack)) is not None
    ):
        seconds = minutes * 60
        mappings.append(
            apple_schema_mapping(
                APPLE_SCREEN_SAVER,
                {"idleTime": seconds},
                ("idleTime",),
                constraints=(("idleTime", "atMost", seconds),),
                reason="Curated Apple screen-saver analog matched inactivity interval requirement.",
            )
        )
    if (
        "require password after screen saver begins" in haystack
        or "display is turned off" in haystack
    ):
        delay = 0 if "immediately" in haystack else first_int(haystack)
        if delay is not None:
            mappings.append(
                apple_schema_mapping(
                    APPLE_SCREEN_SAVER,
                    {"askForPassword": True, "askForPasswordDelay": delay},
                    ("askForPassword", "askForPasswordDelay"),
                    constraints=(("askForPasswordDelay", "atMost", delay),),
                    reason=(
                        "Curated Apple screen-saver analog matched password-after-saver "
                        "requirement."
                    ),
                )
            )
    return mappings
