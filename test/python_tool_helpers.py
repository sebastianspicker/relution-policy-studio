"""Shared helpers for Python tests that import repository tools."""

from __future__ import annotations

import importlib
import sys
from pathlib import Path
from types import ModuleType


TOOLS_DIR = Path(__file__).resolve().parents[1] / "tools"
TOOLS_DIR_TEXT = str(TOOLS_DIR)
if TOOLS_DIR_TEXT not in sys.path:
    sys.path.insert(0, TOOLS_DIR_TEXT)

TOOL_MODULES: dict[str, ModuleType] = {
    "build_relution_import_artifacts": importlib.import_module(
        "build_relution_import_artifacts"
    ),
    "compare_institution_policy_baseline": importlib.import_module(
        "compare_institution_policy_baseline"
    ),
    "harvest_bsi_grundschutz": importlib.import_module("harvest_bsi_grundschutz"),
    "harvest_cis_benchmarks": importlib.import_module("harvest_cis_benchmarks"),
    "recommendation_mapping": importlib.import_module("recommendation_mapping"),
    "update_guideline_mappings": importlib.import_module("update_guideline_mappings"),
    "_harvest_vendor_guidance_modules.vendor_sources": importlib.import_module(
        "_harvest_vendor_guidance_modules.vendor_sources"
    ),
}


def expect(condition: object) -> None:
    """Assert a truthy condition with a consistent failure message."""
    if not condition:
        raise AssertionError("expected condition to be truthy")


def evidence(
    text: str, *, source: str = "bsi-requirement", confidence: float = 0.8
) -> list[dict[str, object]]:
    """Build a semantic evidence source record for recommendation tests."""
    return [{"source": source, "text": text, "confidence": confidence}]


def import_tool(module_name: str) -> ModuleType:
    """Import a module from the repository tools directory."""
    return TOOL_MODULES[module_name]


def semantic_concept_ids(platform: str, text: str) -> set[str]:
    """Return semantic concept IDs inferred from a single evidence text."""
    recommendation_mapping = import_tool("recommendation_mapping")
    return {
        concept["id"]
        for concept in recommendation_mapping.semantic_concepts_for(
            platform, evidence(text)
        )
    }
