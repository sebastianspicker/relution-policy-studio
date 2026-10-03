from __future__ import annotations

import json
import unittest
from pathlib import Path
from typing import Any

from campusweave.private_artifacts import canonical_json_bytes, canonical_sha256

FIXTURES = Path(__file__).resolve().parents[3] / "contracts" / "fixtures"


def load(name: str) -> Any:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


class CanonicalJsonVectorTests(unittest.TestCase):
    def test_python_reference_matches_every_golden_vector(self) -> None:
        vectors = load("canonical-json-vectors.json")["vectors"]
        self.assertGreaterEqual(len(vectors), 10)
        for vector in vectors:
            with self.subTest(vector=vector["name"]):
                value = load(vector["input_file"]) if "input_file" in vector else vector["input"]
                self.assertEqual(canonical_json_bytes(value).decode("utf-8"), vector["canonical"])
                self.assertEqual(canonical_sha256(value), vector["sha256"])
