"""Cohesive implementation stage 2 for bsi_mandatory_ledger."""

from typing import Any
from .bsi_mandatory_ledger_constants import MANDATORY_MODAL_RE
import re

def bsi_solution_status(mapping: dict[str, Any], implementation: dict[str, Any]) -> str:
    """Classify the strongest available Relution solution for a BSI mapping."""

    if mapping.get("status") == "exact":
        return "exact"
    if (
        isinstance(mapping.get("parameterRequirements"), list)
        and mapping["parameterRequirements"]
    ):
        return "parameterized"
    if isinstance(mapping.get("processSupport"), list) and mapping["processSupport"]:
        return "process-supported"
    if implementation.get("category") == "gap":
        return "gap"
    if mapping.get("candidates"):
        return "partial"
    return "gap"

def mandatory_clauses(text: str) -> list[str]:
    """Extract mandatory modal-verb clauses from requirement text."""

    clauses: list[str] = []
    for sentence in re.split(r"(?<=[.!?])\s+", text):
        normalized = " ".join(sentence.split())
        if normalized and MANDATORY_MODAL_RE.search(normalized):
            clauses.append(normalized)
    return clauses or ([" ".join(text.split())] if text.strip() else [])
