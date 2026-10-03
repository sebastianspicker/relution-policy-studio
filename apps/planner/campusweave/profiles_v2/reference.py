"""Reference profile v2 derived from the genuine checked-in v1 profile."""

from __future__ import annotations

import copy
from functools import lru_cache
from typing import Any

from ..json_snapshot import load_strict_json
from ..resources import REFERENCE_PROFILE
from .conversion import convert_v1_profile


@lru_cache(maxsize=1)
def _reference() -> dict[str, Any]:
    source, _ = load_strict_json(REFERENCE_PROFILE)
    converted = convert_v1_profile(source)
    profile = converted["profile"]
    if not isinstance(profile, dict):  # pragma: no cover - conversion invariant
        raise RuntimeError("the converted reference profile is not an object")
    return profile


def reference_profile() -> dict[str, Any]:
    """Return an isolated copy of the conservatively converted v2 reference."""
    return copy.deepcopy(_reference())
