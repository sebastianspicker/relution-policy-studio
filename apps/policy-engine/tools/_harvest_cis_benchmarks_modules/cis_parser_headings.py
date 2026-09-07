"""CIS recommendation-heading detection helpers."""
from __future__ import annotations

from typing import Any

from _harvest_cis_benchmarks_modules.cis_text_collections import normalize_space
from _harvest_cis_benchmarks_modules.cis_parser_constants import HEADING_ID_RE

def detect_recommendation_starts(
    pages: list[list[str]], page_starts: list[int]
) -> list[dict[str, Any]]:
    """Find recommendation headings that are followed by profile applicability."""
    starts: list[dict[str, Any]] = []
    for page_index, page_lines in enumerate(pages):
        for line_index, line in enumerate(page_lines):
            if HEADING_ID_RE.match(line) is None:
                continue
            heading_lines: list[str] = []
            cursor = line_index
            while (
                cursor < len(page_lines)
                and page_lines[cursor] != "Profile Applicability:"
                and len(heading_lines) < 6
            ):
                heading_lines.append(page_lines[cursor])
                cursor += 1
            if (
                cursor >= len(page_lines)
                or page_lines[cursor] != "Profile Applicability:"
            ):
                continue
            heading = normalize_space(" ".join(heading_lines))
            parsed_heading = parse_recommendation_heading(heading)
            if parsed_heading is None:
                continue
            starts.append(
                {
                    "startOffset": page_starts[page_index] + line_index,
                    "profileOffset": page_starts[page_index] + cursor,
                    "recommendationId": parsed_heading["id"],
                    "title": parsed_heading["title"],
                    "assessmentStatus": parsed_heading["assessment"],
                    "sourcePage": page_index + 1,
                }
            )
    return starts


def parse_recommendation_heading(heading: str) -> dict[str, str] | None:
    """Parse a CIS heading into ID, title, and automated/manual assessment."""
    assessment_start = heading.rfind(" (")
    if assessment_start == -1 or not heading.endswith(")"):
        return None
    assessment = heading[assessment_start + 2 : -1]
    if assessment not in {"Automated", "Manual"}:
        return None
    id_and_title = heading[:assessment_start]
    recommendation_id, separator, title = id_and_title.partition(" ")
    if separator == "" or not is_dotted_number(recommendation_id):
        return None
    return {"id": recommendation_id, "title": title.strip(), "assessment": assessment}


def is_dotted_number(value: str) -> bool:
    """Return whether a heading token is a dotted numeric CIS recommendation ID."""
    parts = value.split(".")
    return len(parts) >= 2 and all(part.isdigit() for part in parts)
