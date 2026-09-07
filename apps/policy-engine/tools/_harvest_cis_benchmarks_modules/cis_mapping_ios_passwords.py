"""iOS passcode phrase predicates and mappings."""
from __future__ import annotations

import re
from typing import Any

from _harvest_cis_benchmarks_modules.cis_mapping_accumulator import add_exact

def phrase_value_matches(
    normalized_title: str, recommended_value: str | None, phrase_value: tuple[str, str]
) -> bool:
    """Return whether title and recommended value match one phrase/value pair."""
    phrase, expected = phrase_value
    return phrase in normalized_title and recommended_value == expected


def ios_password_proximity_disabled(
    normalized_title: str, recommended_value: str | None
) -> bool:
    """Recognize CIS phrasings that disable password proximity requests."""
    return phrase_value_matches(
        normalized_title,
        recommended_value,
        ("block password proximity requests", "Yes"),
    ) or phrase_value_matches(
        normalized_title,
        recommended_value,
        ("allow proximity based password sharing requests", "Disabled"),
    )


def ios_password_sharing_disabled(
    normalized_title: str, recommended_value: str | None
) -> bool:
    """Recognize CIS phrasings that disable password sharing."""
    return phrase_value_matches(
        normalized_title, recommended_value, ("block password sharing", "Yes")
    ) or phrase_value_matches(
        normalized_title, recommended_value, ("allow password sharing", "Disabled")
    )


def add_minimum_ios_password_length(
    acc: dict[str, list[dict[str, Any]] | list[str]],
    recommended_value: str | None,
    title: str,
) -> None:
    """Add iOS passcode minimum-length mapping when a numeric value is present."""
    minimum_match = re.search(r"(\d+)", recommended_value or title)
    if minimum_match is not None:
        minimum = int(minimum_match.group(1))
        add_exact(
            acc,
            (
                "relution-native",
                "IOS_PASSCODE",
                ["minLength"],
                {"minLength": minimum},
                [{"path": "minLength", "operator": "atLeast", "value": minimum}],
            ),
        )

