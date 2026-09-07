"""Windows Csp helpers for recommendation mapping."""

from typing import Any
from pathlib import Path

from .field_matching_io import (
    read_json,
)

from .field_matching_setting_state import extract_setting_state
from .field_matching_windows_state import (
    is_simple_windows_state,
    windows_csp_state_matches,
)

from .field_matching_windows_text import (
    loc_uri_leaf,
    windows_policy_signature,
)

def load_windows_custom_csp_evidence(
    evidence_path: Path,
) -> dict[frozenset[str], list[dict[str, Any]]]:
    """Index harvested Windows Custom CSP evidence by normalized policy signature."""

    if not evidence_path.exists():
        return {}
    evidence = read_json(evidence_path)
    entries = (
        evidence.get("customCspSettings", []) if isinstance(evidence, dict) else []
    )
    by_signature: dict[frozenset[str], list[dict[str, Any]]] = {}
    seen: set[tuple[frozenset[str], str, str]] = set()
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        for value in (entry.get("name"), loc_uri_leaf(entry.get("locUri"))):
            if not isinstance(value, str):
                continue
            signature = windows_policy_signature(value)
            if not signature:
                continue
            marker = (
                signature,
                str(entry.get("name", "")),
                str(entry.get("locUri", "")),
            )
            if marker in seen:
                continue
            seen.add(marker)
            by_signature.setdefault(signature, []).append(entry)
    return by_signature
def windows_custom_csp_mapping_for(
    title: str,
    recommended_value: Any,
    evidence_index: dict[frozenset[str], list[dict[str, Any]]],
    *,
    parent_title: str | None = None,
    require_simple_state_match: bool = False,
) -> dict[str, Any] | None:
    """Return an exact Windows Custom CSP mapping when evidence has one safe match."""

    if not evidence_index:
        return None
    setting_name, state = extract_setting_state(title, recommended_value)
    if require_simple_state_match and not is_simple_windows_state(
        recommended_value, state
    ):
        return None
    search_terms = [setting_name, title]
    if parent_title:
        search_terms.append(parent_title)
    for term in search_terms:
        signature = windows_policy_signature(term)
        if not signature:
            continue
        matches = evidence_index.get(signature, [])
        if len(matches) != 1:
            continue
        evidence = matches[0]
        if require_simple_state_match and not windows_csp_state_matches(
            state, evidence.get("state")
        ):
            continue
        values = evidence.get("values")
        if not isinstance(values, dict):
            continue
        return {
            "kind": "relution-native",
            "type": "WINDOWS_CUSTOM_CSP",
            "values": values,
            "match": {
                "sourceFile": evidence.get("sourceFile", ""),
                "policyName": evidence.get("policyName", ""),
                "settingName": evidence.get("name", ""),
                "locUri": evidence.get("locUri", ""),
                "matchedSignature": sorted(signature),
                "reason": (
                    "Exact Windows Custom CSP mapping verified against the Relution Windows "
                    "security baseline .rexp exports."
                ),
            },
        }
    return None
