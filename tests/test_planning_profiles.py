from __future__ import annotations

import copy
import unittest
from pathlib import Path

from campusweave.json_snapshot import load_strict_json
from campusweave.planning import build_execution_plan, instantiate_profile, validate_execution_plan
from campusweave.private_artifacts import canonical_sha256
from campusweave.profiles import concept_ids_from_manifest, validate_package

ROOT = Path(__file__).resolve().parents[1]
PROFILE_PATH = ROOT / "docs/relution/packages/university/desired-state.json"
MANIFEST_PATH = ROOT / "docs/relution/registries/manifest.json"


def reference_profile() -> dict[str, object]:
    profile, _ = load_strict_json(PROFILE_PATH)
    assert isinstance(profile, dict)
    return profile


class ProfilePlanningTests(unittest.TestCase):
    def test_reference_profile_is_valid_and_compiles_deterministically(self) -> None:
        profile = reference_profile()
        concept_errors: list[str] = []
        concept_ids = concept_ids_from_manifest(MANIFEST_PATH, concept_errors)
        self.assertEqual(concept_errors, [])
        self.assertEqual(validate_package(profile, concept_ids), [])

        digest = canonical_sha256(profile)
        plan = build_execution_plan(profile, digest)
        self.assertEqual(plan, build_execution_plan(profile, digest))
        self.assertEqual(validate_execution_plan(plan, profile, digest), [])
        self.assertEqual(plan["plan_status"], "offline_valid")
        self.assertFalse(plan["execution_authorized"])
        self.assertFalse(plan["network_capable"])
        self.assertFalse(plan["mutation_capable"])
        self.assertTrue(all(step["state"] == "unbound" for step in plan["steps"]))
        self.assertTrue(all(step["operation_bindings"] == [] for step in plan["steps"]))

    def test_plan_validation_rejects_execution_and_digest_drift(self) -> None:
        profile = reference_profile()
        digest = canonical_sha256(profile)
        plan = build_execution_plan(profile, digest)
        altered = copy.deepcopy(plan)
        altered["execution_authorized"] = True
        altered["steps"][0]["operation_bindings"] = ["POST /devices"]
        errors = validate_execution_plan(altered, profile, digest)
        self.assertTrue(any("execution_authorized" in error for error in errors))
        self.assertTrue(any("operation_bindings" in error for error in errors))
        self.assertTrue(validate_execution_plan(plan, profile, "0" * 64))

    def test_identity_rebinding_preserves_the_profile_contract(self) -> None:
        profile = reference_profile()
        rebound = instantiate_profile(profile, "example-u", "Example University")
        self.assertEqual(rebound["package"]["institution_code"], "example-u")
        self.assertEqual(rebound["package"]["institution_label"], "Example University")
        concept_errors: list[str] = []
        self.assertEqual(
            validate_package(rebound, concept_ids_from_manifest(MANIFEST_PATH, concept_errors)), []
        )
        self.assertEqual(concept_errors, [])


if __name__ == "__main__":
    unittest.main()
