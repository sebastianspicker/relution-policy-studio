"""Deterministic offline compiler for CampusWeave profile v2."""

from __future__ import annotations

import copy
from collections import defaultdict
from collections.abc import Mapping
from typing import Any

from ..private_artifacts import canonical_sha256
from .model import PLAN_SCHEMA_ID, record_id, records, string_list
from .validation import validate_profile


def _sorted_records(profile: Mapping[str, Any], collection: str) -> list[dict[str, Any]]:
    copied = [copy.deepcopy(dict(item)) for item in records(profile, collection)]
    return sorted(copied, key=lambda item: (str(item.get("id", "")), str(item.get("name", ""))))


def _requirements(profile: Mapping[str, Any]) -> list[dict[str, Any]]:
    uses: dict[str, list[Mapping[str, Any]]] = defaultdict(list)
    for intent in records(profile, "intents"):
        for requirement in string_list(intent.get("requirements")):
            uses[requirement].append(intent)
    result: list[dict[str, Any]] = []
    for requirement, intents in sorted(uses.items()):
        result.append(
            {
                "requirement": requirement,
                "intent_ids": sorted(filter(None, (record_id(item) for item in intents))),
                "ownerships": sorted(
                    {
                        item["ownership"]
                        for item in intents
                        if isinstance(item.get("ownership"), str) and item["ownership"]
                    }
                ),
            }
        )
    return result


def _steps(profile: Mapping[str, Any]) -> list[dict[str, Any]]:
    assignments_by_intent: dict[str, list[str]] = defaultdict(list)
    for assignment in records(profile, "assignments"):
        intent_id, assignment_id = assignment.get("intent_id"), record_id(assignment)
        if isinstance(intent_id, str) and assignment_id is not None:
            assignments_by_intent[intent_id].append(assignment_id)
    steps: list[dict[str, Any]] = []
    for intent in records(profile, "intents"):
        identifier = record_id(intent)
        if identifier is None:
            continue
        steps.append(
            {
                "id": identifier,
                "name": intent.get("name"),
                "outcome": intent.get("outcome"),
                "platform": intent.get("platform"),
                "ownership": intent.get("ownership"),
                "role": intent.get("role"),
                "cohort_ids": sorted(string_list(intent.get("cohort_ids"))),
                "layer": intent.get("layer"),
                "scope_ids": sorted(string_list(intent.get("scope_ids"))),
                "depends_on": sorted(string_list(intent.get("depends_on"))),
                "requirements": sorted(string_list(intent.get("requirements"))),
                "assignment_ids": sorted(assignments_by_intent.get(identifier, [])),
                "state": "unbound",
            }
        )
    return sorted(steps, key=lambda item: item["id"])


def _plan(profile: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "schema": PLAN_SCHEMA_ID,
        "schema_version": 2,
        "profile_id": profile.get("id"),
        "profile_name": profile.get("name"),
        "execution_authorized": False,
        "network_capable": False,
        "mutation_capable": False,
        "requirements": _requirements(profile),
        "steps": _steps(profile),
        "scope_blueprints": _sorted_records(profile, "scope_blueprints"),
        "assignments": _sorted_records(profile, "assignments"),
        "rollout_stages": _sorted_records(profile, "rollout_stages"),
        "unresolved": _sorted_records(profile, "unresolved"),
    }


def compile_profile(profile: Any) -> dict[str, Any]:
    """Compile one draft and return a reviewable plan even when diagnostics fail."""
    validation = validate_profile(profile)
    digest = canonical_sha256(profile)
    plan = _plan(profile) if isinstance(profile, Mapping) else _plan({})
    return {
        "profile_digest": digest,
        "plan_digest": canonical_sha256(plan),
        "plan": plan,
        "diagnostics": validation["diagnostics"],
        "valid": validation["valid"],
    }
