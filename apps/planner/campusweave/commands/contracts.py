"""Coordinate offline machine-document validation."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any, Iterable, Mapping

from ..contracts.bindings import validate_bindings
from ..contracts.catalog import validate_catalog
from ..contracts.change_plan import validate_change_plan
from ..contracts.common import (
    DEFAULT_BINDINGS,
    DEFAULT_CATALOG,
    DEFAULT_CHANGE_PLAN,
    DEFAULT_MANIFEST,
    ValidationFailure,
    load_json,
    validate_catalog_freshness,
    validate_schema_references,
)
from ..contracts.manifest_validation import manifest_registry_paths
from ..contracts.registry_validation import (
    validate_dangling_references,
    validate_registries,
)


def parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
    """Parse the offline machine-document validator command line."""
    parser = argparse.ArgumentParser(
        description="Validate Relution machine-readable registries, catalog, bindings, and change plan."
    )
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    parser.add_argument(
        "--spec",
        type=Path,
        help=(
            "raw target OpenAPI/Swagger JSON used to prove a generated catalog "
            "is current; required when catalog.status is generated"
        ),
    )
    parser.add_argument("--bindings", type=Path, default=DEFAULT_BINDINGS)
    parser.add_argument("--change-plan", type=Path, default=DEFAULT_CHANGE_PLAN)
    return parser.parse_args(argv)


def validate_all(args: argparse.Namespace) -> list[str]:
    """Validate the configured documentation set and return stable diagnostics."""
    errors: list[str] = []
    validate_schema_references(args.manifest.parent.parent / "schemas", errors)
    try:
        manifest = load_json(args.manifest)
    except ValidationFailure as failure:
        return [str(failure)]
    all_ids = _validate_registries(manifest, args.manifest, errors)
    catalog, operations = _validate_catalog(args, errors)
    bindings = _validate_bindings(args, all_ids, catalog, operations, errors)
    _validate_change_plan(args, all_ids, catalog, operations, bindings, errors)
    return sorted(set(errors))


def _validate_registries(manifest: Any, manifest_path: Path, errors: list[str]) -> set[str]:
    entries = manifest_registry_paths(manifest, manifest_path, errors)
    all_ids, references = validate_registries(entries, manifest_path, errors)
    validate_dangling_references(all_ids, references, manifest_path, errors)
    return set(all_ids)


def _validate_catalog(
    args: argparse.Namespace, errors: list[str]
) -> tuple[Mapping[str, Any], Mapping[str, Mapping[str, Any]]]:
    try:
        catalog = load_json(args.catalog)
    except ValidationFailure as failure:
        errors.append(str(failure))
        return {}, {}
    operations = validate_catalog(catalog, args.catalog, errors)
    if isinstance(catalog, Mapping):
        validate_catalog_freshness(catalog, args.catalog, getattr(args, "spec", None), errors)
        return catalog, operations
    return {}, operations


def _validate_bindings(
    args: argparse.Namespace,
    all_ids: set[str],
    catalog: Mapping[str, Any],
    operations: Mapping[str, Mapping[str, Any]],
    errors: list[str],
) -> Mapping[str, Any] | None:
    try:
        bindings = load_json(args.bindings)
    except ValidationFailure as failure:
        errors.append(str(failure))
        return None
    validate_bindings(bindings, args.bindings, errors, all_ids, catalog, operations)
    return bindings if isinstance(bindings, Mapping) else None


def _validate_change_plan(
    args: argparse.Namespace,
    all_ids: set[str],
    catalog: Mapping[str, Any],
    operations: Mapping[str, Mapping[str, Any]],
    bindings: Mapping[str, Any] | None,
    errors: list[str],
) -> None:
    try:
        plan = load_json(args.change_plan)
    except ValidationFailure as failure:
        errors.append(str(failure))
        return
    validate_change_plan(plan, args.change_plan, errors, all_ids, catalog, operations, bindings)


def main(argv: Iterable[str] | None = None) -> int:
    """Run the validator command and print its diagnostic result."""
    errors = validate_all(parse_args(argv))
    if errors:
        for item in errors:
            print(f"error: {item}", file=sys.stderr)
        print(f"validation failed: {len(errors)} error(s)", file=sys.stderr)
        return 1
    print(
        "valid: Relution machine-readable registries, catalog state, bindings, and settings change plan"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
