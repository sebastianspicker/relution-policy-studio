from __future__ import annotations

import json
import subprocess
import sys
import unittest
from pathlib import Path
from typing import Any

from campusweave.commands.stdio import MAX_REQUEST_BYTES

ROOT = Path(__file__).resolve().parents[1]
CONTRACTS = ROOT.parents[1] / "contracts"


def request(payload: bytes) -> tuple[subprocess.CompletedProcess[bytes], dict[str, Any]]:
    process = subprocess.run(
        [sys.executable, "-m", "campusweave.commands.stdio"],
        cwd=ROOT,
        input=payload,
        capture_output=True,
        check=False,
    )
    response = json.loads(process.stdout)
    assert isinstance(response, dict)
    return process, response


class StdioBridgeTests(unittest.TestCase):
    def test_compile_and_reference_use_one_versioned_response(self) -> None:
        profile = json.loads(
            (CONTRACTS / "fixtures/planner-v2-custom.json").read_text(encoding="utf-8")
        )
        payload = json.dumps(
            {"version": 1, "id": "compile-1", "command": "compile", "payload": {"profile": profile}}
        ).encode()
        process, response = request(payload)
        self.assertEqual(process.returncode, 0, process.stderr)
        self.assertEqual(process.stderr, b"")
        self.assertTrue(response["ok"])
        self.assertEqual(response["id"], "compile-1")
        self.assertTrue(response["result"]["valid"])

        process, response = request(
            b'{"version":1,"id":"reference-1","command":"reference","payload":{}}'
        )
        self.assertEqual(process.returncode, 0, process.stderr)
        self.assertEqual(response["result"]["schema_version"], 2)

    def test_duplicate_keys_and_nonfinite_numbers_are_rejected(self) -> None:
        for payload in (
            b'{"version":1,"version":1,"id":"x","command":"reference","payload":{}}',
            b'{"version":1,"id":"x","command":"validate","payload":{"profile":{"x":NaN}}}',
        ):
            with self.subTest(payload=payload):
                process, response = request(payload)
                self.assertEqual(process.returncode, 2)
                self.assertFalse(response["ok"])
                self.assertEqual(response["error"]["code"], "invalid_json")

    def test_protocol_failures_preserve_only_a_valid_request_id(self) -> None:
        process, response = request(
            b'{"version":2,"id":"request-2","command":"reference","payload":{}}'
        )
        self.assertEqual(process.returncode, 2)
        self.assertEqual(response["id"], "request-2")
        self.assertEqual(response["error"]["code"], "unsupported_version")

        process, response = request(b"[]")
        self.assertEqual(process.returncode, 2)
        self.assertIsNone(response["id"])
        self.assertEqual(response["error"]["code"], "invalid_request")

    def test_expanded_diagnostics_have_a_bounded_error_response(self) -> None:
        payload = json.dumps(
            {
                "version": 1,
                "id": "large-result",
                "command": "validate",
                "payload": {"profile": {"intents": [1] * 15000}},
            }
        ).encode()
        process, response = request(payload)
        self.assertEqual(process.returncode, 2)
        self.assertEqual(response["error"]["code"], "response_too_large")
        self.assertEqual(response["id"], "large-result")
        self.assertLess(len(process.stdout), MAX_REQUEST_BYTES)

    def test_request_size_is_bounded_before_json_decode(self) -> None:
        process, response = request(b" " * (MAX_REQUEST_BYTES + 1))
        self.assertEqual(process.returncode, 2)
        self.assertEqual(response["error"]["code"], "request_too_large")

    def test_bridge_does_not_load_the_http_adapter(self) -> None:
        probe = (
            "import sys, campusweave.commands.stdio; "
            "print(sorted(m for m in sys.modules if m in "
            "{'campusweave.server', 'campusweave.workbench', 'http.server'}))"
        )
        process = subprocess.run(
            [sys.executable, "-c", probe], cwd=ROOT, capture_output=True, check=True
        )
        self.assertEqual(process.stdout.decode().strip(), "[]")

    def test_package_root_keeps_its_server_exports(self) -> None:
        import campusweave
        from campusweave import server

        self.assertIs(campusweave.create_server, server.create_server)
        self.assertIs(campusweave.CampusWeaveServer, server.CampusWeaveServer)
        self.assertIn("create_server", dir(campusweave))
        self.assertIn("CampusWeaveServer", dir(campusweave))
        with self.assertRaises(AttributeError):
            _ = campusweave.missing_attribute


if __name__ == "__main__":
    unittest.main()
