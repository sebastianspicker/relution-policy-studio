"""Section parsing for CIS recommendation blocks."""
from __future__ import annotations

from typing import Any

from _harvest_cis_benchmarks_modules.cis_parser_constants import SECTION_ALIASES
from _harvest_cis_benchmarks_modules.cis_parser_section_text import join_section_text, parse_profile_lines, parse_references

def parse_sections(block_lines: list[str]) -> dict[str, Any]:
    """Split a recommendation block into normalized CIS section fields."""
    sections: dict[str, list[str]] = {"profileApplicability": []}
    current = "profileApplicability"
    for raw_line in block_lines:
        line = raw_line.strip()
        if not line:
            if current not in {"profileApplicability", "references"}:
                sections.setdefault(current, []).append("")
            continue
        label = next(
            (candidate for candidate in SECTION_ALIASES if line.startswith(candidate)),
            None,
        )
        if label is not None:
            current = SECTION_ALIASES[label]
            sections.setdefault(current, [])
            remainder = line[len(label) :].strip()
            if remainder:
                sections[current].append(remainder)
            continue
        sections.setdefault(current, []).append(line)
    return {
        "profileApplicability": parse_profile_lines(
            sections.get("profileApplicability", [])
        ),
        "description": join_section_text(sections.get("description", [])),
        "rationale": join_section_text(sections.get("rationale", [])),
        "impact": join_section_text(sections.get("impact", [])),
        "audit": join_section_text(sections.get("audit", [])),
        "auditLines": list(sections.get("audit", [])),
        "remediation": join_section_text(sections.get("remediation", [])),
        "remediationLines": list(sections.get("remediation", [])),
        "defaultValue": join_section_text(sections.get("defaultValue", [])),
        "additionalInformation": join_section_text(
            sections.get("additionalInformation", [])
        ),
        "references": parse_references(sections.get("references", [])),
    }
