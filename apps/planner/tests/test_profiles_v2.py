from __future__ import annotations

import copy
import json
import unittest
from pathlib import Path
from typing import Any

from campusweave.profiles_v2 import (
    compile_profile,
    convert_v1_profile,
    reference_profile,
    validate_profile,
)

ROOT = Path(__file__).resolve().parents[1]
CONTRACTS = ROOT.parents[1] / "contracts"
V1_REFERENCE = ROOT / "docs/relution/packages/university/desired-state.json"


def fixture(name: str) -> dict[str, Any]:
    value = json.loads((CONTRACTS / "fixtures" / name).read_text(encoding="utf-8"))
    assert isinstance(value, dict)
    return value


def codes(result: dict[str, Any]) -> list[str]:
    diagnostics = result["diagnostics"]
    assert isinstance(diagnostics, list)
    return [item["code"] for item in diagnostics if isinstance(item, dict)]


class ProfileV2Tests(unittest.TestCase):
    def test_blank_and_custom_profiles_compile_deterministically(self) -> None:
        blank = fixture("planner-v2-blank.json")
        self.assertTrue(validate_profile(blank)["valid"])
        blank_plan = compile_profile(blank)
        self.assertTrue(blank_plan["valid"])
        self.assertEqual(blank_plan["plan"]["steps"], [])

        custom = fixture("planner-v2-custom.json")
        first = compile_profile(custom)
        self.assertEqual(first, compile_profile(copy.deepcopy(custom)))
        self.assertTrue(first["valid"])
        self.assertEqual(first["plan"]["schema"], "campusweave-plan-v2")
        self.assertFalse(first["plan"]["execution_authorized"])
        self.assertEqual(first["plan"]["requirements"][0]["requirement"], "setting.baseline")

    def test_partial_profile_returns_diagnostics_instead_of_raising(self) -> None:
        partial = {"schema_version": 2, "id": "draft", "name": "Draft", "intents": []}
        result = validate_profile(partial)
        self.assertFalse(result["valid"])
        self.assertIn("profile.collection", codes(result))
        self.assertEqual(compile_profile(partial)["profile_digest"], result["profile_digest"])

    def test_broken_references_cycles_and_incompatible_scopes_are_reported(self) -> None:
        profile = fixture("planner-v2-custom.json")
        intent = profile["intents"][0]
        scope = profile["scope_blueprints"][0]
        rollout = profile["rollout_stages"][0]
        intent["cohort_ids"] = ["cohort.missing"]
        intent["depends_on"] = [intent["id"]]
        scope["platforms"] = ["android_enterprise"]
        rollout["depends_on"] = [rollout["id"]]
        result = validate_profile(profile)
        self.assertFalse(result["valid"])
        self.assertIn("reference.broken", codes(result))
        self.assertIn("reference.cycle", codes(result))
        self.assertIn("scope.incompatible", codes(result))

    def test_conflicting_setting_ownership_and_reserved_data_are_rejected(self) -> None:
        profile = fixture("planner-v2-custom.json")
        second = copy.deepcopy(profile["intents"][0])
        second["id"] = "intent.conflict"
        second["name"] = "Conflicting intent"
        second["ownership"] = "department"
        second["depends_on"] = []
        profile["intents"].append(second)
        profile["target"] = {"credentials": {"token": "forbidden"}}
        result = validate_profile(profile)
        self.assertIn("ownership.conflict", codes(result))
        self.assertIn("profile.reserved_data", codes(result))

    def test_reference_is_a_fresh_conservative_v1_conversion(self) -> None:
        source = json.loads(V1_REFERENCE.read_text(encoding="utf-8"))
        converted = convert_v1_profile(source)
        self.assertFalse(converted["valid"])
        self.assertIn("conversion.ownership_role_ambiguous", codes(converted))
        profile = converted["profile"]
        self.assertEqual(profile["schema_version"], 2)
        self.assertTrue(
            any(item["id"] == "conversion.v1.ownership-role" for item in profile["unresolved"])
        )
        reference = reference_profile()
        self.assertEqual(reference, profile)
        reference["name"] = "changed"
        self.assertNotEqual(reference_profile()["name"], "changed")

    def test_conversion_preserves_unrepresentable_scopes_and_writer_facts(self) -> None:
        profile = reference_profile()
        self.assertTrue(all(intent["ownership"] is None for intent in profile["intents"]))
        self.assertTrue(
            any(item["id"].startswith("conversion.scope.") for item in profile["unresolved"])
        )
        self.assertTrue(
            any(item["id"].startswith("conversion.writer.") for item in profile["unresolved"])
        )

    def test_assigned_empty_scopes_and_unsafe_integers_are_diagnostics(self) -> None:
        profile = fixture("planner-v2-custom.json")
        scope = profile["scope_blueprints"][0]
        for field in (
            "cohort_ids",
            "organization_ids",
            "location_ids",
            "platforms",
            "ownerships",
            "roles",
        ):
            scope[field] = []
        profile["rollout_stages"][0]["order"] = 9007199254740993
        result = validate_profile(profile)
        self.assertIn("scope.unconstrained", codes(result))
        self.assertIn("rollout.order", codes(result))

    def test_contract_schemas_publish_stable_identities(self) -> None:
        profile_schema = json.loads(
            (CONTRACTS / "schemas/profile-v2.schema.json").read_text(encoding="utf-8")
        )
        bridge_schema = json.loads(
            (CONTRACTS / "schemas/planner-bridge.schema.json").read_text(encoding="utf-8")
        )
        self.assertEqual(profile_schema["$id"], "campusweave-profile-v2")
        self.assertEqual(bridge_schema["$id"], "campusweave-planner-bridge-v1")


if __name__ == "__main__":
    unittest.main()
