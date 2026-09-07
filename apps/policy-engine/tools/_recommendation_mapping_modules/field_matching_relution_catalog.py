"""Relution Catalog helpers for recommendation mapping."""

from typing import Any
from ._mapping_models import FieldEntry
from ._mapping_models import FieldTokens
from pathlib import Path

from .field_matching_io import (
    read_json,
)

from .field_matching_relution_platforms import (
    android_relution_platforms,
    apple_relution_platforms,
)

from .field_matching_tokens import (
    tokenize,
)

def relution_fields(template_bundle_path: Path) -> list[FieldEntry]:
    """Extract searchable field metadata from the Relution template bundle."""

    bundle = read_json(template_bundle_path)
    fields: list[FieldEntry] = []
    for config in bundle.get("configurationTypes", []):
        if not isinstance(config, dict):
            continue
        target = str(config.get("type", ""))
        if not target or target.startswith(("ANDROID_IFP", "RELUTION_")):
            continue
        platforms = relution_platforms(target, config.get("platforms", []))
        if not platforms:
            continue
        target_label = str(config.get("label", target))
        for raw_field in config.get("fields", []):
            if not isinstance(raw_field, dict):
                continue
            path = str(raw_field.get("path", ""))
            if path in {"", "type", "uuid"}:
                continue
            label = str(raw_field.get("label", path))
            enum_values = tuple(
                str(value)
                for value in raw_field.get("enumValues", [])
                if isinstance(value, str)
            )
            enum_labels = " ".join(
                str(value) for value in (raw_field.get("enumLabels", {}) or {}).values()
            )
            field_kind = str(raw_field.get("kind", ""))
            fields.append(
                FieldEntry(
                    kind="relution-native",
                    target=target,
                    field_path=path,
                    label=label,
                    field_kind=field_kind,
                    platforms=frozenset(platforms),
                    token_data=FieldTokens(
                        tokens=frozenset(
                            tokenize(
                                target,
                                target_label,
                                path,
                                label,
                                field_kind,
                                " ".join(enum_values),
                                enum_labels,
                            )
                        ),
                        label_tokens=frozenset(tokenize(label)),
                        enum_values=enum_values,
                    ),
                )
            )
    return fields
def relution_platforms(target: str, platforms: Any) -> set[str]:
    """Map Relution platform metadata and target names to logical OS families."""

    raw = {str(platform).upper() for platform in platforms if isinstance(platform, str)}
    logical: set[str] = set()
    logical.update(android_relution_platforms(target, raw))
    for platform in ("IOS", "MACOS", "WINDOWS"):
        if platform in raw or target.startswith(platform):
            logical.add(platform)
    logical.update(apple_relution_platforms(target, raw))
    return logical
