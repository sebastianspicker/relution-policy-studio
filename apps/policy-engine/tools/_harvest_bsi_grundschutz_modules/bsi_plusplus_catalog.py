"""Supports BSI Grundschutz harvesting and recommendation-mapping workflows."""
from __future__ import annotations

from .bsi_plusplus_platform_context import GS_PLUSPLUS_METHOD_CONTEXT
from .bsi_source_collections import count_values, natural_control_sort_key
from .bsi_source_text import relative_repo_path

import json
from pathlib import Path
from typing import Any

from .bsi_plusplus_controls import parse_plusplus_control, policy_relevant_plusplus_control_ids
from .bsi_plusplus_practices import parse_plusplus_practice_groups



def parse_grundschutz_plusplus_catalog(path: Path) -> dict[str, Any]:
    """Parse the GS++ OSCAL catalog into systematics and control lookup records."""

    raw = json.loads(path.read_text(encoding="utf8"))
    catalog = raw["catalog"]
    controls = parse_plusplus_controls(catalog)
    controls_by_id = {control["id"]: control for control in controls}
    practice_groups = parse_plusplus_practice_groups(
        catalog.get("groups", []), controls
    )
    systematics = {
        "version": 1,
        "name": "BSI Grundschutz++ Systematics",
        "catalog": {
            "title": catalog.get("metadata", {}).get("title"),
            "version": catalog.get("metadata", {}).get("version"),
            "lastModified": catalog.get("metadata", {}).get("last-modified"),
            "oscalVersion": catalog.get("metadata", {}).get("oscal-version"),
            "sourcePath": relative_repo_path(path),
            "remarks": catalog.get("metadata", {}).get("remarks"),
        },
        "methodology": GS_PLUSPLUS_METHOD_CONTEXT,
        "counts": {
            "controls": len(controls),
            "practiceGroups": len(practice_groups),
            "bySecurityLevel": count_values(
                control.get("securityLevel") for control in controls
            ),
            "byModalVerb": count_values(
                control.get("modalVerb") for control in controls
            ),
            "byEffortLevel": count_values(
                control.get("effortLevel") for control in controls
            ),
        },
        "practiceGroups": practice_groups,
        "policyRelevantControlIds": sorted(
            policy_relevant_plusplus_control_ids(controls_by_id)
        ),
        "controls": controls,
    }
    return {"systematics": systematics, "controlsById": controls_by_id}


def parse_plusplus_controls(catalog: dict[str, Any]) -> list[dict[str, Any]]:
    """Flatten GS++ nested control groups while preserving practice context."""
    controls: list[dict[str, Any]] = []

    def walk_group(group: dict[str, Any], path: tuple[dict[str, str], ...]) -> None:
        """Collect controls recursively while retaining their group ancestry."""

        group_entry = {
            "id": str(group.get("id", "")),
            "title": str(group.get("title", "")),
        }
        next_path = (*path, group_entry)
        for control in group.get("controls", []):
            if not isinstance(control, dict):
                continue
            controls.append(parse_plusplus_control(control, next_path))
        for child in group.get("groups", []):
            if isinstance(child, dict):
                walk_group(child, next_path)

    for group in catalog.get("groups", []):
        if isinstance(group, dict):
            walk_group(group, ())
    controls.sort(key=lambda entry: natural_control_sort_key(entry["id"]))
    return controls
