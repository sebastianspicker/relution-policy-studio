from __future__ import annotations

import json
import unittest
from pathlib import Path
from typing import Any

from campusweave.profiles_v2.model import (
    ARRAY_FIELDS,
    COLLECTIONS,
    NULLABLE_STRING_FIELDS,
    RECORD_FIELDS,
    ROOT_FIELDS,
)
from campusweave.profiles_v2.validation import RESERVED_PROFILE_KEYS

SCHEMA = json.loads(
    (Path(__file__).resolve().parents[3] / "contracts/schemas/profile-v2.schema.json").read_text(
        encoding="utf-8"
    )
)
DEFS: dict[str, Any] = SCHEMA["$defs"]
RECORD_DEFS = {
    "organizations": "organization",
    "locations": "location",
    "cohorts": "cohort",
    "intents": "intent",
    "scope_blueprints": "scope",
    "assignments": "assignment",
    "rollout_stages": "rollout",
    "unresolved": "unresolved",
}


def ref(schema: dict[str, Any]) -> str | None:
    value = schema.get("$ref")
    return value.removeprefix("#/$defs/") if isinstance(value, str) else None


class ProfileSchemaParityTests(unittest.TestCase):
    def test_root_fields_and_collections_match_the_schema(self) -> None:
        self.assertEqual(set(SCHEMA["properties"]), ROOT_FIELDS)
        self.assertEqual(set(SCHEMA["required"]), ROOT_FIELDS)
        self.assertIs(SCHEMA["additionalProperties"], False)
        self.assertEqual(set(RECORD_DEFS), set(COLLECTIONS))
        for collection, definition in RECORD_DEFS.items():
            self.assertEqual(ref(SCHEMA["properties"][collection]["items"]), definition)

    def test_record_field_sets_match_the_schema(self) -> None:
        for collection, definition in RECORD_DEFS.items():
            with self.subTest(collection=collection):
                record = DEFS[definition]
                self.assertEqual(set(record["properties"]), RECORD_FIELDS[collection])
                self.assertIs(record["additionalProperties"], False)

    def test_required_array_and_nullable_fields_match_the_schema(self) -> None:
        for collection, definition in RECORD_DEFS.items():
            with self.subTest(collection=collection):
                record = DEFS[definition]
                properties = record["properties"]
                arrays = {name for name, spec in properties.items() if ref(spec) == "strings"}
                nullable = {
                    name for name, spec in properties.items() if ref(spec) == "nullableString"
                }
                optional = set(NULLABLE_STRING_FIELDS.get(collection, set()))
                if collection == "intents":
                    optional.add("layer")
                self.assertEqual(arrays, ARRAY_FIELDS[collection])
                self.assertEqual(nullable, NULLABLE_STRING_FIELDS.get(collection, set()))
                self.assertEqual(set(record["required"]), RECORD_FIELDS[collection] - optional)

    def test_reserved_profile_keys_match_the_schema(self) -> None:
        self.assertEqual(set(DEFS["reservedKey"]["enum"]), RESERVED_PROFILE_KEYS)
        self.assertEqual(len(DEFS["reservedKey"]["enum"]), len(RESERVED_PROFILE_KEYS))
