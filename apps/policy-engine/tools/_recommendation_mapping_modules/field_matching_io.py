"""Io helpers for recommendation mapping."""

import json
from pathlib import Path
from typing import Any


def read_json(path: Path) -> Any:
    """Read a UTF-8 JSON artifact from disk."""

    return json.loads(path.read_text(encoding="utf8"))
