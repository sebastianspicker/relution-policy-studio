from __future__ import annotations

import argparse
import hashlib
import os
import sys
import tempfile
from pathlib import Path
from typing import Any, Iterable, Mapping

from ..openapi.catalog_render import render_catalog
from ..openapi.contract import collect_operations, load_spec
from ..openapi.machine_builder import render_machine_catalog


def atomic_write(path: Path, content: str) -> None:
    """Write a catalog atomically in its destination directory."""

    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.",
        suffix=".tmp",
        dir=path.parent,
        text=True,
    )
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_path, path)
    except BaseException:
        temporary_path.unlink(missing_ok=True)
        raise


def parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Render or verify deterministic Markdown and JSON catalogs from OpenAPI JSON."
    )
    parser.add_argument("--spec", required=True, type=Path, help="OpenAPI/Swagger JSON file")
    parser.add_argument("--output", required=True, type=Path, help="Markdown catalog path")
    parser.add_argument(
        "--json-output",
        type=Path,
        help="optional machine-readable JSON catalog path",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help=(
            "fail unless the Markdown output exactly matches; when --json-output "
            "is supplied, check both outputs"
        ),
    )
    parser.add_argument(
        "--json-check",
        action="store_true",
        help="fail unless --json-output exactly matches, without checking Markdown",
    )
    args = parser.parse_args(argv)
    if args.json_check and args.json_output is None:
        parser.error("--json-check requires --json-output")
    return args


def main(argv: Iterable[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        _validate_paths(args)
        spec, raw = load_spec(args.spec)
        catalog = render_catalog(spec, raw, args.spec.name)
        machine_catalog = (
            render_machine_catalog(spec, raw, args.spec.name)
            if args.json_output is not None
            else None
        )
        return (
            _check_catalogs(args, catalog, machine_catalog, spec, raw)
            if args.check or args.json_check
            else _write_catalogs(args, catalog, machine_catalog, spec, raw)
        )
    except (OSError, ValueError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2


def _validate_paths(args: argparse.Namespace) -> None:
    if args.spec.resolve() == args.output.resolve():
        raise ValueError("--spec and --output must be different files")
    if args.json_output is None:
        return
    if args.spec.resolve() == args.json_output.resolve():
        raise ValueError("--spec and --json-output must be different files")
    if args.output.resolve() == args.json_output.resolve():
        raise ValueError("--output and --json-output must be different files")


def _check_catalogs(
    args: argparse.Namespace,
    catalog: str,
    machine_catalog: str | None,
    spec: Mapping[str, Any],
    raw: bytes,
) -> int:
    checks = _catalog_checks(args, catalog, machine_catalog)
    digest = hashlib.sha256(raw).hexdigest()
    if any(_is_stale(path, expected, args.spec, digest) for path, expected in checks):
        return 1
    print(
        f"current: {_checked_path(args)} contains {len(collect_operations(spec))} operations from SHA-256 {digest}"
    )
    return 0


def _catalog_checks(
    args: argparse.Namespace, catalog: str, machine_catalog: str | None
) -> list[tuple[Path, str]]:
    checks = [(args.output, catalog)] if args.check else []
    if args.json_check or (args.check and args.json_output is not None):
        if args.json_output is None or machine_catalog is None:
            raise ValueError("machine catalog output was not generated")
        checks.append((args.json_output, machine_catalog))
    return checks


def _is_stale(path: Path, expected: str, spec: Path, digest: str) -> bool:
    if not path.exists():
        print(f"stale: catalog does not exist: {path}", file=sys.stderr)
        return True
    if path.read_bytes() == expected.encode("utf-8"):
        return False
    print(f"stale: {path} does not match {spec} (SHA-256 {digest})", file=sys.stderr)
    return True


def _checked_path(args: argparse.Namespace) -> str:
    if args.check and args.json_output is not None:
        return f"{args.output} and {args.json_output}"
    return str(args.json_output if args.json_check else args.output)


def _write_catalogs(
    args: argparse.Namespace,
    catalog: str,
    machine_catalog: str | None,
    spec: Mapping[str, Any],
    raw: bytes,
) -> int:
    atomic_write(args.output, catalog)
    if args.json_output is not None:
        if machine_catalog is None:
            raise ValueError("machine catalog output was not generated")
        atomic_write(args.json_output, machine_catalog)
    path = (
        f"{args.output} and {args.json_output}"
        if args.json_output is not None
        else str(args.output)
    )
    print(
        f"wrote {path}: {len(collect_operations(spec))} operations, source SHA-256 {hashlib.sha256(raw).hexdigest()}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
