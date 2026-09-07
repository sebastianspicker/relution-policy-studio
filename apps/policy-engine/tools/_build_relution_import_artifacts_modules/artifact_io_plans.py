"""Review-gated artifact update-plan envelopes."""

from pathlib import Path
from typing import Any

from .artifact_io_paths import relative_path


def update_plan_payload(*, metadata: dict[str, Any], inputs: dict[str, Path], rows: list[dict[str, Any]], summary: dict[str, Any]) -> dict[str, Any]:
    """Build the common review-gated update-plan artifact envelope."""

    return {"version": 1, **metadata, "inputs": {name: relative_path(path) for name, path in inputs.items()}, "rows": rows, "summary": summary}


def update_plan_inputs(primary_name: str, primary_path: Path, shared_paths: tuple[Path, Path, Path]) -> dict[str, Path]:
    """Build common input paths for review-gated update-plan artifacts."""

    exact_mapping_reference_path, mapping_candidate_review_path, manual_promotion_ledger_path = shared_paths
    return {primary_name: primary_path, "exactMappingReferencePath": exact_mapping_reference_path, "mappingCandidateReviewPath": mapping_candidate_review_path, "manualPromotionLedgerPath": manual_promotion_ledger_path}
