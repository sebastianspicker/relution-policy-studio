from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from campusweave.commands import contracts as contract_commands
from campusweave.commands import openapi as openapi_commands

ROOT = Path(__file__).resolve().parents[1]


class OpenApiAndContractTests(unittest.TestCase):
    def test_machine_contracts_validate_checked_in_fail_closed_artifacts(self) -> None:
        self.assertEqual(contract_commands.main([]), 0)

    def test_catalog_command_writes_and_checks_a_minimal_openapi_document(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            spec = root / "openapi.json"
            markdown = root / "catalog.md"
            machine = root / "catalog.json"
            spec.write_text(
                json.dumps(
                    {
                        "openapi": "3.0.3",
                        "info": {"title": "Synthetic", "version": "1"},
                        "paths": {
                            "/health": {"get": {"responses": {"200": {"description": "ok"}}}}
                        },
                    }
                ),
                encoding="utf-8",
            )
            arguments = [
                "--spec",
                str(spec),
                "--output",
                str(markdown),
                "--json-output",
                str(machine),
            ]
            self.assertEqual(openapi_commands.main(arguments), 0)
            self.assertTrue(markdown.exists())
            catalog = json.loads(machine.read_text(encoding="utf-8"))
            self.assertEqual(catalog["operation_count"], 1)
            self.assertEqual(openapi_commands.main([*arguments, "--check"]), 0)


if __name__ == "__main__":
    unittest.main()
