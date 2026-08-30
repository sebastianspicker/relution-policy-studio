"""Low-level, dependency-free validation helpers for machine documents."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping
from urllib.parse import urlparse

from campusweave.json_snapshot import load_strict_json
from campusweave.openapi import build_machine_catalog
from campusweave.openapi.contract import load_spec
from campusweave.resources import SOURCE_ROOT

REPOSITORY_ROOT = SOURCE_ROOT


class ValidationFailure(Exception):
    """Raised for an input that cannot be loaded as a documentation object."""


def relative(path: Path) -> str:
    """Return a stable display path when the file is in the repository."""
    try:
        return str(path.resolve().relative_to(REPOSITORY_ROOT))
    except ValueError:
        return str(path)


def load_json(path: Path) -> Any:
    """Load one UTF-8 JSON document with precise diagnostics."""
    try:
        value, _ = load_strict_json(path)
        return value
    except ValueError as load_error:
        raise ValidationFailure(str(load_error)) from load_error


def catalog_digest(catalog: Mapping[str, Any]) -> str | None:
    """Return the optional generated source digest from a catalog."""
    source = catalog.get("source")
    if not isinstance(source, Mapping):
        return None
    value = source.get("sha256")
    return value if isinstance(value, str) else None


def nested_references(value: Any) -> Iterable[str]:
    """Yield every JSON Schema reference string from a document."""
    if isinstance(value, Mapping):
        yield from _mapping_references(value)
    elif isinstance(value, list):
        yield from _list_references(value)


def _mapping_references(value: Mapping[str, Any]) -> Iterable[str]:
    reference = value.get("$ref")
    if isinstance(reference, str):
        yield reference
    for child in value.values():
        yield from nested_references(child)


def _list_references(value: list[Any]) -> Iterable[str]:
    for child in value:
        yield from nested_references(child)


def pointer_exists(document: Any, fragment: str) -> bool:
    """Return whether an RFC 6901 fragment selects a value."""
    if not fragment:
        return True
    if not fragment.startswith("/"):
        return False
    current = document
    for raw_token in fragment[1:].split("/"):
        current = _pointer_child(current, raw_token)
        if current is _MISSING:
            return False
    return True


_MISSING = object()


def _pointer_child(value: Any, raw_token: str) -> Any:
    token = raw_token.replace("~1", "/").replace("~0", "~")
    if isinstance(value, Mapping):
        return value.get(token, _MISSING)
    if isinstance(value, list) and token.isdigit() and int(token) < len(value):
        return value[int(token)]
    return _MISSING


def validate_schema_references(schema_directory: Path, errors: list[str]) -> None:
    """Validate that every local schema reference has a real document/fragment."""
    documents, identifiers = _load_schema_documents(schema_directory, errors)
    for schema_path, document in documents.items():
        for reference in nested_references(document):
            _validate_schema_reference(schema_path, reference, documents, identifiers, errors)


def _load_schema_documents(
    schema_directory: Path, errors: list[str]
) -> tuple[dict[Path, Any], dict[str, Path]]:
    documents: dict[Path, Any] = {}
    identifiers: dict[str, Path] = {}
    try:
        schema_paths = sorted(schema_directory.glob("*.json"))
    except OSError as failure:
        errors.append(f"{relative(schema_directory)}: cannot enumerate schemas: {failure}")
        return documents, identifiers
    for schema_path in schema_paths:
        _load_schema_document(schema_path, documents, identifiers, errors)
    return documents, identifiers


def _load_schema_document(
    schema_path: Path,
    documents: dict[Path, Any],
    identifiers: dict[str, Path],
    errors: list[str],
) -> None:
    try:
        document = load_json(schema_path)
    except ValidationFailure as failure:
        errors.append(str(failure))
        return
    resolved = schema_path.resolve()
    documents[resolved] = document
    schema_id = document.get("$id") if isinstance(document, Mapping) else None
    if isinstance(schema_id, str):
        if schema_id in identifiers:
            error(errors, schema_path, "$.$id", f"duplicates schema ID {schema_id!r}")
        else:
            identifiers[schema_id] = resolved


def _validate_schema_reference(
    schema_path: Path,
    reference: str,
    documents: Mapping[Path, Any],
    identifiers: Mapping[str, Path],
    errors: list[str],
) -> None:
    target_path, fragment = _reference_target(schema_path, reference, identifiers)
    target = documents.get(target_path) if target_path is not None else None
    if target is None:
        document_part = reference.partition("#")[0]
        if urlparse(document_part).scheme:
            message = f"unresolved schema document {document_part!r}"
        else:
            message = f"unresolved local schema document {document_part!r}"
        error(errors, schema_path, "$ref", message)
    elif fragment and not pointer_exists(target, fragment):
        error(errors, schema_path, "$ref", f"unresolved schema fragment {reference!r}")


def _reference_target(
    schema_path: Path, reference: str, identifiers: Mapping[str, Path]
) -> tuple[Path | None, str]:
    document_part, _, fragment = reference.partition("#")
    if not document_part:
        return schema_path, fragment
    if urlparse(document_part).scheme:
        return identifiers.get(document_part), fragment
    return (schema_path.parent / document_part).resolve(), fragment


def error(errors: list[str], path: Path, location: str, message: str) -> None:
    """Add one stable path-qualified validation error."""
    errors.append(f"{relative(path)}:{location}: {message}")


def expect_mapping(
    value: Any, errors: list[str], path: Path, location: str
) -> Mapping[str, Any] | None:
    """Return a mapping or add the standard object-shape error."""
    if isinstance(value, Mapping):
        return value
    error(errors, path, location, "must be an object")
    return None


def expect_list(value: Any, errors: list[str], path: Path, location: str) -> list[Any] | None:
    """Return a list or add the standard array-shape error."""
    if isinstance(value, list):
        return value
    error(errors, path, location, "must be an array")
    return None


def require_exact_keys(
    value: Mapping[str, Any], required: set[str], errors: list[str], path: Path, location: str
) -> None:
    """Require a mapping to contain exactly the documented keys."""
    _report_key_difference(required - set(value), "missing keys", errors, path, location)
    _report_key_difference(set(value) - required, "unknown keys", errors, path, location)


def _report_key_difference(
    values: set[str], label: str, errors: list[str], path: Path, location: str
) -> None:
    if values:
        error(errors, path, location, f"{label}: {', '.join(sorted(values))}")


def validate_string_array(
    value: Any, errors: list[str], path: Path, location: str, *, nonempty: bool = False
) -> list[str]:
    """Validate a duplicate-free array of non-empty strings."""
    values = expect_list(value, errors, path, location)
    if values is None:
        return []
    if nonempty and not values:
        error(errors, path, location, "must not be empty")
    strings = _string_items(values, errors, path, location)
    duplicates = sorted({item for item in strings if strings.count(item) > 1})
    if duplicates:
        error(errors, path, location, f"duplicate values: {', '.join(duplicates)}")
    return strings


def _string_items(values: list[Any], errors: list[str], path: Path, location: str) -> list[str]:
    strings: list[str] = []
    for index, item in enumerate(values):
        if isinstance(item, str) and item:
            strings.append(item)
        else:
            error(errors, path, f"{location}[{index}]", "must be a non-empty string")
    return strings


def parse_timestamp(value: Any, errors: list[str], path: Path, location: str) -> datetime | None:
    """Parse one timezone-aware ISO-8601 timestamp."""
    if not isinstance(value, str) or not value:
        error(errors, path, location, "must be a non-empty ISO-8601 timestamp")
        return None
    parsed = _parse_iso_timestamp(value, errors, path, location)
    if parsed is None or parsed.tzinfo is None or parsed.utcoffset() is None:
        if parsed is not None:
            error(errors, path, location, "must include a timezone offset")
        return None
    return parsed.astimezone(timezone.utc)


def _parse_iso_timestamp(
    value: str, errors: list[str], path: Path, location: str
) -> datetime | None:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        error(errors, path, location, "must be a valid ISO-8601 timestamp")
        return None


def validate_https_url(
    value: Any, errors: list[str], path: Path, location: str, *, origin_only: bool
) -> tuple[str, str, int] | None:
    """Validate a credential-free HTTPS URL and return its normalized origin."""
    if not isinstance(value, str) or not value:
        error(errors, path, location, "must be a non-empty HTTPS URL")
        return None
    parsed = urlparse(value)
    if parsed.scheme.lower() != "https" or not parsed.hostname:
        error(errors, path, location, "must be an absolute HTTPS URL")
        return None
    _validate_url_parts(parsed, origin_only, errors, path, location)
    try:
        port = parsed.port or 443
    except ValueError:
        error(errors, path, location, "contains an invalid port")
        return None
    return "https", parsed.hostname.lower(), port


def _validate_url_parts(
    parsed: Any, origin_only: bool, errors: list[str], path: Path, location: str
) -> None:
    if parsed.username is not None or parsed.password is not None:
        error(errors, path, location, "must not contain URL credentials")
    if parsed.query or parsed.fragment or parsed.params:
        error(errors, path, location, "must not contain query, fragment, or parameters")
    if origin_only and parsed.path not in {"", "/"}:
        error(errors, path, location, "must be an origin without a path")


def validate_catalog_freshness(
    catalog: Mapping[str, Any], catalog_path: Path, spec_path: Path | None, errors: list[str]
) -> None:
    """Prove that a generated catalog is the exact output for its raw contract."""
    if catalog.get("status") != "generated":
        return
    if spec_path is None:
        error(
            errors,
            catalog_path,
            "$.status",
            "generated catalog validation requires --spec for freshness proof",
        )
        return
    expected = _render_expected_catalog(spec_path, errors)
    if expected is None:
        return
    if catalog_digest(catalog) != catalog_digest(expected):
        error(errors, catalog_path, "$.source.sha256", "does not match the raw --spec bytes")
    if catalog != expected:
        error(
            errors,
            catalog_path,
            "$",
            "generated catalog is stale or is not the renderer's exact output for --spec",
        )


def _render_expected_catalog(spec_path: Path, errors: list[str]) -> Mapping[str, Any] | None:
    try:
        source, raw = load_spec(spec_path)
        return build_machine_catalog(source, raw, spec_path.name)
    except (OSError, ValueError) as failure:
        error(errors, spec_path, "$", f"cannot prove catalog freshness: {failure}")
        return None
