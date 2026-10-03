"""Shared profile-v2 field definitions and small normalization helpers."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

PROFILE_SCHEMA_ID = "campusweave-profile-v2"
PLAN_SCHEMA_ID = "campusweave-plan-v2"
COLLECTIONS = (
    "organizations",
    "locations",
    "cohorts",
    "intents",
    "scope_blueprints",
    "assignments",
    "rollout_stages",
    "unresolved",
)
ROOT_FIELDS = {"schema_version", "id", "name", *COLLECTIONS}

RECORD_FIELDS: dict[str, set[str]] = {
    "organizations": {"id", "name", "parent_id", "description", "requirements"},
    "locations": {"id", "name", "organization_id", "description", "requirements"},
    "cohorts": {
        "id",
        "name",
        "organization_id",
        "location_ids",
        "role",
        "ownership",
        "requirements",
    },
    "intents": {
        "id",
        "name",
        "outcome",
        "platform",
        "ownership",
        "role",
        "cohort_ids",
        "layer",
        "scope_ids",
        "depends_on",
        "requirements",
    },
    "scope_blueprints": {
        "id",
        "name",
        "cohort_ids",
        "organization_ids",
        "location_ids",
        "platforms",
        "ownerships",
        "roles",
        "depends_on",
        "requirements",
    },
    "assignments": {
        "id",
        "name",
        "intent_id",
        "scope_id",
        "rollout_stage_id",
        "requirements",
    },
    "rollout_stages": {"id", "name", "order", "depends_on", "requirements"},
    "unresolved": {"id", "name", "description", "related_ids", "requirements"},
}

ARRAY_FIELDS: dict[str, set[str]] = {
    "organizations": {"requirements"},
    "locations": {"requirements"},
    "cohorts": {"location_ids", "requirements"},
    "intents": {"cohort_ids", "scope_ids", "depends_on", "requirements"},
    "scope_blueprints": {
        "cohort_ids",
        "organization_ids",
        "location_ids",
        "platforms",
        "ownerships",
        "roles",
        "depends_on",
        "requirements",
    },
    "assignments": {"requirements"},
    "rollout_stages": {"depends_on", "requirements"},
    "unresolved": {"related_ids", "requirements"},
}

NULLABLE_STRING_FIELDS: dict[str, set[str]] = {
    "organizations": {"parent_id", "description"},
    "locations": {"organization_id", "description"},
    "cohorts": {"organization_id", "role", "ownership"},
    "intents": {"ownership", "role"},
    "assignments": {"rollout_stage_id"},
    "unresolved": {"description"},
}


def records(profile: Mapping[str, Any], collection: str) -> list[Mapping[str, Any]]:
    """Return object records from one collection without mutating draft input."""
    value = profile.get(collection)
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, Mapping)]


def string_list(value: Any) -> list[str]:
    """Return only string members, retaining input order."""
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str)]


def record_id(record: Mapping[str, Any]) -> str | None:
    value = record.get("id")
    return value if isinstance(value, str) and value else None
