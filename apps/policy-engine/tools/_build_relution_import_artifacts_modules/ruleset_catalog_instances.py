"""Instance-id derivation for multi-instance Relution settings."""

from __future__ import annotations

import hashlib
from typing import Any

from _tooling_text_io import slugify
from .artifact_paths import MULTI_INSTANCE_TARGET_TYPES


def multi_instance_id(mapping: dict[str, Any], recommendation_id: str) -> str | None:
    """Derive a deterministic id for target types that allow multiple instances."""

    if mapping.get("type") not in MULTI_INSTANCE_TARGET_TYPES:
        return None
    values = mapping.get("values")
    if not isinstance(values, dict):
        return slugify(recommendation_id)
    name = str(values.get("name") or recommendation_id)
    install_sync_ml = str(values.get("installSyncML") or "")
    digest = hashlib.sha256(install_sync_ml.encode("utf8")).hexdigest()[:12]
    return slugify(f"{name}-{digest}")
