"""Apple Catalog helpers for recommendation mapping."""

from typing import Any
from ._mapping_models import FieldEntry
from ._mapping_models import FieldTokens
from pathlib import Path

from .field_matching_io import (
    read_json,
)

from .field_matching_tokens import (
    tokenize,
)

def apple_schema_fields(apple_schema_catalog_path: Path) -> list[FieldEntry]:
    """Extract searchable field metadata from Apple schema profile entries."""

    catalog = read_json(apple_schema_catalog_path)
    fields: list[FieldEntry] = []
    for entry in catalog.get("entries", []):
        if (
            not isinstance(entry, dict)
            or entry.get("kind") != "profile"
            or entry.get("deprecated") is True
        ):
            continue
        target = str(entry.get("id") or f"profile:{entry.get('identifier', '')}")
        platforms = apple_platforms(entry.get("availability", {}).get("platforms", []))
        if not target or not platforms:
            continue
        entry_title = str(entry.get("title", ""))
        identifier = str(entry.get("identifier", ""))
        for raw_field in entry.get("fields", []):
            if not isinstance(raw_field, dict):
                continue
            path = str(raw_field.get("path", ""))
            if not path:
                continue
            label = str(raw_field.get("title") or path)
            field_kind = str(raw_field.get("kind", ""))
            enum_values = tuple(
                str(value)
                for value in raw_field.get("enumValues", [])
                if isinstance(value, str)
            )
            fields.append(
                FieldEntry(
                    kind="apple-schema-profile",
                    target=target,
                    field_path=path,
                    label=label,
                    field_kind=field_kind,
                    platforms=frozenset(platforms),
                    token_data=FieldTokens(
                        tokens=frozenset(
                            tokenize(
                                target,
                                identifier,
                                entry_title,
                                path,
                                label,
                                field_kind,
                                " ".join(enum_values),
                            )
                        ),
                        label_tokens=frozenset(tokenize(label)),
                        enum_values=enum_values,
                    ),
                )
            )
    return fields
def apple_platforms(platforms: Any) -> set[str]:
    """Map Apple schema availability platforms to editor OS families."""

    logical: set[str] = set()
    for platform in platforms if isinstance(platforms, list) else []:
        normalized = str(platform).upper()
        if normalized in {"IOS", "IPADOS", "TVOS"}:
            logical.add("IOS")
        if normalized == "MACOS":
            logical.add("MACOS")
    return logical
