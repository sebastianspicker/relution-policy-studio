"""Io helpers for recommendation mapping."""

from typing import Any
from pathlib import Path
import json

def read_json(path: Path) -> Any:
    """Read a UTF-8 JSON artifact from disk."""

    return json.loads(path.read_text(encoding="utf8"))
