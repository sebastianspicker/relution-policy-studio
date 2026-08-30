from __future__ import annotations

import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run_adapter(name: str, *arguments: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(ROOT / "scripts" / name), *arguments],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )


class CliAdapterTests(unittest.TestCase):
    def test_runtime_adapter_runs_profile_validation_as_a_subprocess(self) -> None:
        result = run_adapter("campusweave_runtime.py", "profile", "validate")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("commit-safe", result.stdout)

    def test_openapi_adapter_exposes_its_command_contract(self) -> None:
        result = run_adapter("render_relution_openapi.py", "--help")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("--spec", result.stdout)

    def test_machine_docs_adapter_validates_checked_in_artifacts(self) -> None:
        result = run_adapter("validate_machine_docs.py")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("valid:", result.stdout)


if __name__ == "__main__":
    unittest.main()
