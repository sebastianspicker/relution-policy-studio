"""Stable value and identifier helpers for generated artifacts."""

import json
from typing import Any

from _tooling_text_io import slugify
from _recommendation_mapping_modules._mapping_lexical_constants import unique_preserving_order


def variant_id_from_signature(signature: tuple[tuple[str, str], ...]) -> str:
    """Build a stable variant id from a bundle value signature."""

    parts = []
    for path, serialized_value in signature:
        value = json.loads(serialized_value)
        parts.append(
            f"{slugify(path.replace('.', '-'))}-{slugify(stringify_value(value))}"
        )
    return slugify("-".join(parts))


def normalize_policy_platform(platform: str) -> str:
    """Normalize Android policy variants to the Android Enterprise platform key."""

    return "ANDROID_ENTERPRISE" if platform == "ANDROID" else platform


def unique_single_value(values: Any) -> str:
    """Return one unique value or a slash-joined list of unique values."""

    unique_values = unique_preserving_order(values)
    if len(unique_values) == 1:
        return unique_values[0]
    return "/".join(unique_values)


def flatten_values(
    value: Any, prefix: tuple[str, ...] = ()
) -> dict[tuple[str, ...], Any]:
    """Flatten nested mapping values into tuple paths."""

    if not isinstance(value, dict):
        return {prefix: value}
    flattened: dict[tuple[str, ...], Any] = {}
    for key in sorted(value):
        child = value[key]
        child_prefix = prefix + (str(key),)
        if isinstance(child, dict):
            flattened.update(flatten_values(child, child_prefix))
            continue
        flattened[child_prefix] = child
    return flattened


def split_camel_text(value: str) -> str:
    """Split identifier text into human-readable words."""

    from _recommendation_mapping_modules.field_matching_windows_text import split_identifier

    return " ".join(split_identifier(value))


def path_to_string(path: tuple[str, ...]) -> str:
    """Render a flattened value path as dotted text."""

    return ".".join(path)


def stringify_value(value: Any) -> str:
    """Render primitive values in stable text form for ids and semantics."""

    if isinstance(value, bool):
        return "true" if value else "false"
    if value is None:
        return "null"
    return str(value)


def stable_json(value: Any) -> str:
    """Serialize a value deterministically for signature comparisons."""

    return json.dumps(value, ensure_ascii=False, sort_keys=True)
