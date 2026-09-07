"""Windows helper fallback extraction for CIS benchmarks."""
from __future__ import annotations

from typing import Any

from _harvest_cis_benchmarks_modules.cis_text_collections import unique_preserving_order
from _harvest_cis_benchmarks_modules.cis_text_commands import build_helper_fallback, extract_excerpt, extract_powershell_commands
from _harvest_cis_benchmarks_modules.cis_parser_constants import WINDOWS_AUDITPOL_COMMAND_RE, WINDOWS_GROUP_POLICY_PATH_RE

def extract_windows_helper_fallbacks(
    recommendation_id: str, audit_text: str, remediation_text: str
) -> list[dict[str, Any]]:
    """Extract Windows audit/remediation commands and policy paths as fallbacks."""
    fallbacks: list[dict[str, Any]] = []
    combined_text = "\n".join([audit_text, remediation_text]).strip()

    auditpol_commands = unique_preserving_order(
        WINDOWS_AUDITPOL_COMMAND_RE.findall(audit_text)
    )
    if auditpol_commands:
        fallbacks.append(
            build_helper_fallback(
                recommendation_id,
                {
                    "method": "auditpol",
                    "role": "audit",
                    "title": "auditpol.exe",
                    "rawText": extract_excerpt(audit_text, auditpol_commands[0]),
                    "commands": auditpol_commands,
                },
            )
        )

    powershell_commands = extract_powershell_commands(remediation_text)
    if powershell_commands:
        fallbacks.append(
            build_helper_fallback(
                recommendation_id,
                {
                    "method": "powershell",
                    "role": "remediation",
                    "title": "PowerShell",
                    "rawText": extract_excerpt(
                        remediation_text, powershell_commands[0]
                    ),
                    "commands": powershell_commands,
                },
            )
        )

    group_policy_paths = unique_preserving_order(
        WINDOWS_GROUP_POLICY_PATH_RE.findall(combined_text)
    )
    if group_policy_paths:
        fallbacks.append(
            build_helper_fallback(
                recommendation_id,
                {
                    "method": "group-policy-path",
                    "role": "remediation",
                    "title": "Group Policy",
                    "rawText": extract_excerpt(combined_text, group_policy_paths[0]),
                    "groupPolicyPaths": group_policy_paths,
                },
            )
        )

    registry_paths = unique_preserving_order(
        extract_windows_registry_paths(combined_text)
    )
    if registry_paths:
        fallbacks.append(
            build_helper_fallback(
                recommendation_id,
                {
                    "method": "registry-reference",
                    "role": "audit",
                    "title": "Registry reference",
                    "rawText": extract_excerpt(combined_text, registry_paths[0]),
                    "registryPaths": registry_paths,
                },
            )
        )

    return fallbacks


def extract_windows_registry_paths(text: str) -> list[str]:
    """Find Windows registry paths embedded in CIS audit/remediation text."""
    paths: list[str] = []
    roots = ("HKLM\\", "HKCU\\", "HKEY_")
    for root in roots:
        start = 0
        while True:
            index = text.find(root, start)
            if index == -1:
                break
            path = read_windows_registry_path(text, index)
            if path is not None:
                paths.append(path)
                start = index + len(path)
            else:
                start = index + len(root)
    return paths


def read_windows_registry_path(text: str, start: int) -> str | None:
    """Read one bounded Windows registry path starting at a known root offset."""
    allowed = set(
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .(){}:/_-\\"
    )
    end = start
    while end < len(text) and text[end] in allowed:
        end += 1
    candidate = text[start:end].strip()
    if "\\" not in candidate:
        return None
    if candidate.startswith("HKEY_"):
        root, separator, rest = candidate.partition("\\")
        if (
            separator == ""
            or not root.removeprefix("HKEY_").replace("_", "").isalpha()
            or "\\" not in rest
        ):
            return None
    return candidate.rstrip(" .")
