"""Compatibility JSON helpers for Relution artifact generation."""

from pathlib import Path
from typing import Any

from _tooling_text_io import read_json as _read_json
from _tooling_text_io import write_json as _write_json


def read_json(path: Path) -> Any:
    """Read a JSON artifact through the shared tooling implementation."""

    return _read_json(path)


def write_json(path: Path, payload: Any) -> None:
    """Write a deterministic JSON artifact, creating its parent directory."""

    _write_json(path, payload, create_parents=True)
