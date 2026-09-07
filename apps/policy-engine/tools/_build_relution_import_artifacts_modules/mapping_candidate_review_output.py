"""Format mapping candidate review rows and reports."""

from typing import Any

from .artifact_paths import MAPPING_CANDIDATE_REVIEW_REPORT_PATH
from .mapping_candidate_review_markdown import render_mapping_candidate_review_report


def write_mapping_candidate_review_report(
    reference_payload: dict[str, Any], review_payload: dict[str, Any]
) -> None:
    """Write the Markdown summary for offline mapping candidate review."""

    MAPPING_CANDIDATE_REVIEW_REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    MAPPING_CANDIDATE_REVIEW_REPORT_PATH.write_text(
        render_mapping_candidate_review_report(reference_payload, review_payload),
        encoding="utf8",
    )
