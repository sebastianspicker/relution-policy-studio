#!/usr/bin/env python3
"""Entry point for the strictly offline CampusWeave runtime."""

from __future__ import annotations

import sys
from pathlib import Path


SCRIPT_ROOT = Path(__file__).resolve().parent
if str(SCRIPT_ROOT) not in sys.path:
    sys.path.insert(0, str(SCRIPT_ROOT))

from university_runtime.cli import main  # noqa: E402


if __name__ == "__main__":
    raise SystemExit(main())
