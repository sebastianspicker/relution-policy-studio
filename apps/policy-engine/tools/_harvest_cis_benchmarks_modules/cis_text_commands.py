"""Command-oriented text helpers shared by CIS harvesters."""
from __future__ import annotations

import re
from typing import Any

from _harvest_cis_benchmarks_modules.cis_text_collections import normalize_space, unique_preserving_order
from _tooling_text_io import slugify

POWERSHELL_COMMAND_START_RE = re.compile(r"(?:^|\n)(?:PS [^>]+>\s*)?(?:Set-|New-|Remove-|Add-|Enable-|Disable-|Get-)[^\n]+")
POWERSHELL_STOP_MARKERS = ("\nNote:", "\nReferences:", "\nDefault Value:", "\nImpact:", "\nAudit:", "\nRemediation:")

def extract_powershell_commands(text: str) -> list[str]:
    """Extract bounded PowerShell command snippets from remediation text."""

    commands: list[str] = []
    for match in POWERSHELL_COMMAND_START_RE.finditer(text):
        end = len(text)
        next_command = POWERSHELL_COMMAND_START_RE.search(text, match.end())
        if next_command is not None:
            end = min(end, next_command.start())
        for marker in POWERSHELL_STOP_MARKERS:
            marker_index = text.find(marker, match.start())
            if marker_index != -1:
                end = min(end, marker_index)
        candidate = normalize_space(text[match.start() : end]).rstrip(".")
        if candidate:
            commands.append(candidate)
    return unique_preserving_order(commands)


def build_helper_fallback(
    recommendation_id: str, options: dict[str, Any]
) -> dict[str, Any]:
    """Build a structured helper fallback row for non-importable CIS guidance."""

    payload: dict[str, Any] = {
        "id": slugify(
            f"{recommendation_id}-{options['method']}-{options.get('index', 1)}"
        ),
        "role": options["role"],
        "method": options["method"],
        "title": options["title"],
        "rawText": str(options["rawText"]).strip(),
        "commands": options.get("commands") or [],
    }
    if options.get("groupPolicyPaths"):
        payload["groupPolicyPaths"] = options["groupPolicyPaths"]
    if options.get("registryPaths"):
        payload["registryPaths"] = options["registryPaths"]
    if options.get("profilePayloadType") is not None:
        payload["profilePayloadType"] = options["profilePayloadType"]
    if options.get("profileKeys"):
        payload["profileKeys"] = options["profileKeys"]
    return payload


def extract_excerpt(text: str, needle: str, radius: int = 220) -> str:
    """Return a bounded excerpt around a marker string."""

    index = text.find(needle)
    if index == -1:
        return text.strip()
    start = max(0, index - radius)
    end = min(len(text), index + len(needle) + radius)
    return text[start:end].strip()


def trim_at_markers(text: str, markers: tuple[str, ...]) -> str:
    """Trim text at the earliest marker, if any marker appears."""

    end = len(text)
    for marker in markers:
        index = text.find(marker)
        if index != -1:
            end = min(end, index)
    return text[:end]


def is_terminal_stop_line(line: str) -> bool:
    """Return whether a parsed line starts a non-recommendation appendix block."""

    return any(
        line.startswith(prefix)
        for prefix in (
            "The output",
            "Software Update Tool",
            "Software Update found",
            "Finding available software",
            "Note:",
            "Or run the following command",
            "example:",
            "Example:",
            "Profile Method:",
            "Graphical Method:",
            "Default Value:",
            "References:",
            "CIS Controls:",
        )
    )

