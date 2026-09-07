"""Apple Numeric helpers for recommendation mapping."""

from ._apple_analog_constants import APPLE_PASSCODE
from typing import Any
from .field_matching_apple_mapping import apple_schema_mapping
from .field_matching_text import first_int

from .candidate_inference_apple_numeric_macos import (
    macos_numeric_analog_mappings,
)


def apple_numeric_analog_mappings_for(
    platform: str, haystack: str
) -> list[dict[str, Any]]:
    """Return numeric Apple analog mappings for supported Apple platforms."""
    mappings: list[dict[str, Any]] = []
    if platform == "IOS":
        mappings.extend(ios_numeric_analog_mappings(haystack))
    if platform == "MACOS":
        mappings.extend(macos_numeric_analog_mappings(haystack))
    return mappings


def ios_numeric_analog_mappings(haystack: str) -> list[dict[str, Any]]:
    """Infer iOS passcode numeric analog mappings from normalized text."""
    builders = (
        _ios_alphanumeric_mapping,
        _ios_minimum_length_mapping,
        _ios_maximum_auto_lock_mapping,
        _ios_immediate_grace_period_mapping,
        _ios_maximum_failed_attempts_mapping,
    )
    return [mapping for builder in builders if (mapping := builder(haystack))]


def _ios_alphanumeric_mapping(haystack: str) -> dict[str, Any] | None:
    """Map the iOS alphanumeric passcode requirement when recognized."""
    if "require alphanumeric value" in haystack and "enabled" in haystack:
        return apple_schema_mapping(
            APPLE_PASSCODE,
            {"requireAlphanumeric": True},
            ("requireAlphanumeric",),
            reason="Curated Apple passcode analog matched alphanumeric requirement.",
        )
    return None


def _ios_minimum_length_mapping(haystack: str) -> dict[str, Any] | None:
    """Map the iOS minimum passcode length when recognized."""
    if (
        "minimum passcode length" in haystack or "minimum password length" in haystack
    ) and (minimum := first_int(haystack)) is not None:
        return apple_schema_mapping(
            APPLE_PASSCODE,
            {"minLength": minimum},
            ("minLength",),
            constraints=(("minLength", "atLeast", minimum),),
            reason="Curated Apple passcode analog matched minimum length requirement.",
        )
    return None


def _ios_maximum_auto_lock_mapping(haystack: str) -> dict[str, Any] | None:
    """Map the iOS maximum auto-lock duration when recognized."""
    if (
        "maximum auto-lock" in haystack
        or "maximum minutes of inactivity until screen locks" in haystack
    ) and (maximum := first_int(haystack)) is not None:
        return apple_schema_mapping(
            APPLE_PASSCODE,
            {"maxInactivity": maximum},
            ("maxInactivity",),
            constraints=(("maxInactivity", "atMost", maximum),),
            reason="Curated Apple passcode analog matched auto-lock maximum requirement.",
        )
    return None


def _ios_immediate_grace_period_mapping(haystack: str) -> dict[str, Any] | None:
    """Map the iOS immediate device-lock grace period when recognized."""
    if "maximum grace period for device lock" in haystack and "immediately" in haystack:
        return apple_schema_mapping(
            APPLE_PASSCODE,
            {"maxGracePeriod": 0},
            ("maxGracePeriod",),
            reason="Curated Apple passcode analog matched immediate device-lock grace period.",
        )
    return None


def _ios_maximum_failed_attempts_mapping(haystack: str) -> dict[str, Any] | None:
    """Map the iOS failed-attempt limit when recognized."""
    if (
        "maximum number of failed attempts" in haystack
        and (attempts := first_int(haystack)) is not None
    ):
        return apple_schema_mapping(
            APPLE_PASSCODE,
            {"maxFailedAttempts": attempts},
            ("maxFailedAttempts",),
            reason="Curated Apple passcode analog matched failed-attempt limit.",
        )
    return None
