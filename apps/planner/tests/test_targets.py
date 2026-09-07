from __future__ import annotations

import copy
import unittest
from pathlib import Path

from campusweave.json_snapshot import load_strict_json
from campusweave.private_artifacts import canonical_sha256
from campusweave.targets import validate_target_context

ROOT = Path(__file__).resolve().parents[1]
PROFILE_PATH = ROOT / "docs/relution/packages/university/desired-state.json"
TEMPLATE_PATH = ROOT / "docs/relution/templates/university-runtime-target.json"


class TargetValidationTests(unittest.TestCase):
    def test_stale_or_credential_bearing_context_is_rejected(self) -> None:
        profile, _ = load_strict_json(PROFILE_PATH)
        template, _ = load_strict_json(TEMPLATE_PATH)
        assert isinstance(profile, dict)
        assert isinstance(template, dict)
        stale = copy.deepcopy(template)
        stale["context_status"] = "stale"
        errors = validate_target_context(
            stale, TEMPLATE_PATH, profile, PROFILE_PATH, canonical_sha256(profile)
        )
        self.assertTrue(any("stale target contexts" in error for error in errors))

        secret = copy.deepcopy(template)
        secret["target"]["client_secret"] = "must-not-enter-a-plan"
        errors = validate_target_context(
            secret, TEMPLATE_PATH, profile, PROFILE_PATH, canonical_sha256(profile)
        )
        self.assertTrue(any("credential-bearing" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
