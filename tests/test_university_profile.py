from __future__ import annotations

import copy
import importlib.util
import json
import subprocess
import sys
import unittest
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
VALIDATOR_PATH = REPOSITORY_ROOT / "scripts" / "university_profile.py"
PACKAGE_PATH = REPOSITORY_ROOT / "docs/relution/packages/university/desired-state.json"
MANIFEST_PATH = REPOSITORY_ROOT / "docs/relution/registries/manifest.json"

spec = importlib.util.spec_from_file_location("university_profile", VALIDATOR_PATH)
assert spec is not None and spec.loader is not None
validator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validator)


class UniversityProfileTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.document = json.loads(PACKAGE_PATH.read_text(encoding="utf-8"))
        errors: list[str] = []
        cls.concept_ids = validator.concept_ids_from_manifest(MANIFEST_PATH, errors)
        if errors:
            raise AssertionError("\n".join(errors))

    def validate(self, document: dict[str, object]) -> str:
        return "\n".join(validator.validate_package(document, self.concept_ids))

    def test_checked_in_reference_university_profile_validates(self) -> None:
        result = subprocess.run(
            [sys.executable, str(VALIDATOR_PATH)], cwd=REPOSITORY_ROOT,
            capture_output=True, text=True, check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("valid: Reference University offline desired state", result.stdout)

    def test_institution_code_derives_every_required_namespace(self) -> None:
        document = json.loads(json.dumps(self.document).replace("university", "example-u"))
        document["$schema"] = "urn:campusweave-relution:schema:university-profile:1.0.0"
        document["document_type"] = "relution-university-offline-desired-state"
        self.assertEqual(self.validate(document), "")

    def test_policy_workflow_root_and_target_local_namespace_mismatches_fail(self) -> None:
        document = copy.deepcopy(self.document)
        document["package"]["package_id"] = "other-relution-desired-state-v1"
        document["organization_units"][0]["unit_id"] = "ou.other"
        document["policy_units"][0]["policy_id"] = "other-policy.trust-enrollment"
        document["api_workflows"][0]["workflow_id"] = "other.contract-discovery.v1"
        document["commit_boundary"]["target_local_root"] = "private/other"

        errors = self.validate(document)
        self.assertIn("$.package.package_id", errors)
        self.assertIn("institutional root 'ou.university'", errors)
        self.assertIn("'university'-policy namespace", errors)
        self.assertIn("'university' institution namespace", errors)
        self.assertIn("private/university", errors)

    def test_institution_identity_is_bounded_and_canonical(self) -> None:
        document = copy.deepcopy(self.document)
        document["package"]["institution_code"] = "u" * 49
        document["package"]["institution_label"] = " Reference University "

        errors = self.validate(document)

        self.assertIn("at most 48 characters", errors)
        self.assertIn("trimmed, non-empty institutional label", errors)


if __name__ == "__main__":
    unittest.main()
