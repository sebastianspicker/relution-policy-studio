"""macOS profile-method fallback extraction for CIS benchmarks."""
from __future__ import annotations

from typing import Any

from _harvest_cis_benchmarks_modules.cis_text_collections import normalize_space, unique_profile_keys
from _harvest_cis_benchmarks_modules.cis_text_commands import build_helper_fallback
from _harvest_cis_benchmarks_modules.cis_parser_constants import MACOS_PROFILE_KEY_RE, MACOS_PROFILE_PAYLOAD_TYPE_RE
from _harvest_cis_benchmarks_modules.cis_parser_macos_blocks import split_macos_method_blocks, extract_terminal_commands

def extract_macos_helper_fallbacks(
    recommendation_id: str, remediation_lines: list[str]
) -> list[dict[str, Any]]:
    """Extract macOS terminal and profile-method fallback evidence."""
    fallbacks: list[dict[str, Any]] = []
    for index, block in enumerate(
        split_macos_method_blocks(remediation_lines), start=1
    ):
        if block["label"] == "Terminal Method":
            commands = extract_terminal_commands(block["rawText"])
            if commands:
                fallbacks.append(
                    build_helper_fallback(
                        recommendation_id,
                        {
                            "method": "terminal",
                            "role": "remediation",
                            "title": "Terminal Method",
                            "rawText": block["rawText"],
                            "commands": commands,
                            "index": index,
                        },
                    )
                )
        if block["label"] == "Profile Method":
            profile_payload_type = extract_profile_payload_type(block["text"])
            profile_keys = extract_profile_keys(block["text"])
            if profile_payload_type is not None or profile_keys:
                fallbacks.append(
                    build_helper_fallback(
                        recommendation_id,
                        {
                            "method": "profile-method",
                            "role": "remediation",
                            "title": "Profile Method",
                            "rawText": block["rawText"],
                            "profilePayloadType": profile_payload_type,
                            "profileKeys": profile_keys,
                            "index": index,
                        },
                    )
                )
    return fallbacks

def extract_profile_payload_type(text: str) -> str | None:
    """Extract the macOS configuration profile payload type from CIS text."""
    match = MACOS_PROFILE_PAYLOAD_TYPE_RE.search(text)
    if match is None:
        return None
    return match.group(1)


def extract_profile_keys(text: str) -> list[dict[str, str]]:
    """Extract unique macOS profile key/value hints from CIS profile text."""
    keys = [
        {
            "key": key,
            "value": normalize_space(value).rstrip("."),
        }
        for key, value in MACOS_PROFILE_KEY_RE.findall(text)
    ]
    return unique_profile_keys(keys)
