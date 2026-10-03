"""Regenerate canonical-json-vectors.json from the Python planner reference.

Run from apps/planner:
    uv run --locked python ../../contracts/fixtures/generate_canonical_json_vectors.py

The expected canonical text and SHA-256 come from
campusweave.private_artifacts.canonical_json_bytes / canonical_sha256, the
pre-migration reference implementation. Only edit INPUTS to add vectors.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from campusweave.private_artifacts import canonical_json_bytes, canonical_sha256

FIXTURES = Path(__file__).resolve().parent
INPUTS: list[tuple[str, dict[str, Any]]] = [
    ("null", {"value": None}),
    ("true", {"value": True}),
    ("false", {"value": False}),
    ("integers", {"value": [0, 1, -1, 42, 9007199254740991, -9007199254740991]}),
    ("strings", {"value": ["", "plain", 'quote " backslash \\ slash /', "tab\t newline\n"]}),
    ("empty-object", {"value": {}}),
    ("empty-array", {"value": []}),
    ("key-ordering", {"value": {"b": 1, "a": 2, "B": 3, "A": 4, "_": 5, "ab": 6, "a-": 7, "": 8}}),
    ("numeric-like-keys", {"value": {"10": "x", "9": "y", "1": "z"}}),
    ("nested", {"value": {"z": [{"y": 1, "x": [True, None, {"b": {}, "a": []}]}], "a": {"c": {"b": {"a": 0}}}}}),
    ("unicode-bmp-values", {"value": ["café", "üöäß", "日本語", "€", "  ", "\u0000"]}),
    ("unicode-bmp-keys", {"value": {"ü": 1, "z": 2, "é": 3, "日": 4, "€": 5, "a": 6}}),
]
FILES = ["planner-v2-blank.json", "planner-v2-custom.json"]


def vector(name: str, value: Any, source: str | None) -> dict[str, Any]:
    entry: dict[str, Any] = {"name": name}
    if source is None:
        entry["input"] = value
    else:
        entry["input_file"] = source
    entry["canonical"] = canonical_json_bytes(value).decode("utf-8")
    entry["sha256"] = canonical_sha256(value)
    return entry


def main() -> None:
    vectors = [vector(name, doc["value"], None) for name, doc in INPUTS]
    for filename in FILES:
        value = json.loads((FIXTURES / filename).read_text(encoding="utf-8"))
        vectors.append(vector(filename.removesuffix(".json"), value, filename))
    document = {
        "description": "Canonical JSON text (sorted keys, compact, UTF-8, trailing newline) and SHA-256 hex of that text.",
        "generator": "contracts/fixtures/generate_canonical_json_vectors.py using campusweave.private_artifacts",
        "vectors": vectors,
    }
    target = FIXTURES / "canonical-json-vectors.json"
    target.write_text(json.dumps(document, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
