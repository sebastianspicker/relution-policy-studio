"""Apple Mobileconfig helpers for recommendation mapping."""

from ._apple_analog_constants import APPLE_MOBILECONFIG_CANDIDATE_RULES
from ._mapping_paths import APPLE_MOBILECONFIG_EVIDENCE_PATH
from typing import Any
from pathlib import Path
from .field_matching_text import matched_rule_terms
from .field_matching_text import normalize_search_text
from .field_matching_text import phrase_groups_match
from .field_matching_io import read_json

def apple_mobileconfig_candidates_for(
    platform: str,
    title: str,
    *,
    extra_texts: tuple[str, ...] = (),
    evidence_index: dict[str, dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Return mobileconfig candidates backed by harvested Apple evidence."""
    if platform not in {"IOS", "MACOS"}:
        return []
    haystack = normalize_search_text(
        " ".join((title, *(str(text) for text in extra_texts)))
    )
    available_payloads = set(evidence_index or load_apple_mobileconfig_evidence())
    candidates: list[dict[str, Any]] = []
    for (
        platforms,
        payload_type,
        field_paths,
        required,
        note,
    ) in APPLE_MOBILECONFIG_CANDIDATE_RULES:
        if (
            platform not in platforms
            or payload_type not in available_payloads
            or not phrase_groups_match(haystack, required)
        ):
            continue
        candidates.append(
            {
                "kind": "apple-mobileconfig",
                "target": payload_type,
                "fieldPaths": list(field_paths),
                "match": {
                    "score": 90,
                    "matchedTerms": matched_rule_terms(haystack, required),
                    "valueCompatibility": "org-specific-mobileconfig",
                    "reason": note,
                },
            }
        )
    return candidates
def load_apple_mobileconfig_evidence(
    evidence_path: Path = APPLE_MOBILECONFIG_EVIDENCE_PATH,
) -> dict[str, dict[str, Any]]:
    """Load harvested mobileconfig-backed Apple payload evidence by payload type."""
    if not evidence_path.exists():
        return {}
    evidence = read_json(evidence_path)
    settings = evidence.get("settings", []) if isinstance(evidence, dict) else []
    loaded: dict[str, dict[str, Any]] = {}
    for setting in settings:
        if (
            not isinstance(setting, dict)
            or setting.get("status") != "mobileconfig-backed"
        ):
            continue
        payload_type = setting.get("payloadType")
        if isinstance(payload_type, str) and payload_type:
            loaded[payload_type] = setting
    return loaded
