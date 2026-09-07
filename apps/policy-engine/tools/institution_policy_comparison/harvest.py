"""Institution policy harvesting for baseline comparisons."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .constants import (
    BACKTICK_POLICY_RE,
    INSTITUTION_POLICY_FILES,
    POLICY_NAME_RE,
)
from .settings import (
    find_control_ids,
    infer_setting_values,
)
from .text import (
    extract_signal_text,
    find_policy_id,
    infer_targets,
    markdown_headings,
)
from .utils import (
    identifier_tokens,
    line_start_offsets,
    normalize_text,
    offset_to_line,
    one_line,
)
from .summary import summarize_by_platform


def harvest_institution_policy_index(institution_root: Path) -> dict[str, Any]:
    """Build a normalized index from institution managed-device policy docs."""

    policies = []
    for platform, relative_path in INSTITUTION_POLICY_FILES.items():
        path = institution_root / relative_path
        policies.extend(harvest_policy_file(platform, path, institution_root))
    return {
        "version": 1,
        "name": "Institution Managed Device Policy Catalog Index",
        "sourceRoot": str(institution_root),
        "policies": policies,
        "summary": summarize_by_platform(policies),
    }


def harvest_policy_file(
    platform: str, path: Path, institution_root: Path
) -> list[dict[str, Any]]:
    """Extract policy records from one platform Markdown catalog."""

    text = path.read_text(encoding="utf8")
    line_starts = line_start_offsets(text)
    headings = markdown_headings(text, line_starts)
    policies = []
    for index, heading in enumerate(headings):
        policy_id = find_policy_id(heading["title"])
        if policy_id is None:
            continue
        end = len(text)
        for next_heading in headings[index + 1 :]:
            if next_heading["level"] <= heading["level"]:
                end = next_heading["start"]
                break
        block = text[heading["start"] : end]
        signal_text = extract_signal_text(block)
        policies.append(
            {
                "id": policy_id,
                "platform": platform,
                "title": heading["title"],
                "sourcePath": path.relative_to(institution_root).as_posix(),
                "lineStart": heading["line"],
                "lineEnd": offset_to_line(line_starts, end),
                "policyNames": extract_policy_names(block),
                "controls": sorted(set(find_control_ids(block))),
                "relutionTargets": infer_targets(platform, signal_text),
                "matchText": normalize_text(signal_text),
                "matchTerms": sorted(set(identifier_tokens(signal_text))),
                "settings": infer_setting_values(signal_text),
                "status": "planned"
                if "PLANNED/Target" in block or "planned" in block.lower()
                else "unknown",
                "excerpt": one_line(
                    block.splitlines()[0] if block.splitlines() else heading["title"]
                ),
            }
        )
    return policies


def extract_policy_names(block: str) -> list[str]:
    """Extract referenced policy names from a policy block."""

    names = [match.strip() for match in POLICY_NAME_RE.findall(block)]
    names.extend(
        match.strip()
        for match in BACKTICK_POLICY_RE.findall(block)
        if " " not in match[:12]
    )
    return sorted(set(names))
