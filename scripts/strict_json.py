"""Bounded, no-follow JSON snapshots for contract and documentation tools."""

from __future__ import annotations

import errno
import json
import os
import stat
from pathlib import Path
from typing import Any, Sequence


MAX_JSON_BYTES = 64 * 1024 * 1024


class DuplicateKey(ValueError):
    """Raised when a JSON object repeats a member name."""


def _unique_object(pairs: Sequence[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise DuplicateKey(f"duplicate JSON key {key!r}")
        result[key] = value
    return result


def _invalid_constant(value: str) -> None:
    raise ValueError(f"non-standard JSON constant {value!r} is forbidden")


def read_json_snapshot(path: Path, *, max_bytes: int = MAX_JSON_BYTES) -> bytes:
    """Read one regular non-symlink file through a stable descriptor snapshot."""

    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(path, flags)
    except OSError as exc:
        if exc.errno == errno.ELOOP:
            raise ValueError(f"{path}: symlink inputs are not allowed") from exc
        raise ValueError(f"{path}: cannot open regular JSON input: {exc}") from exc
    try:
        before = os.fstat(descriptor)
        if not stat.S_ISREG(before.st_mode):
            raise ValueError(f"{path}: JSON input is not a regular file")
        if before.st_size > max_bytes:
            raise ValueError(f"{path}: JSON input exceeds {max_bytes} bytes")
        chunks: list[bytes] = []
        remaining = before.st_size
        while remaining:
            chunk = os.read(descriptor, min(64 * 1024, remaining))
            if not chunk:
                raise ValueError(f"{path}: JSON input changed while it was read")
            chunks.append(chunk)
            remaining -= len(chunk)
        if os.read(descriptor, 1):
            raise ValueError(f"{path}: JSON input changed while it was read")
        after = os.fstat(descriptor)
        stable_fields = (
            "st_dev",
            "st_ino",
            "st_mode",
            "st_uid",
            "st_gid",
            "st_size",
            "st_mtime_ns",
            "st_ctime_ns",
        )
        if any(getattr(after, field) != getattr(before, field) for field in stable_fields):
            raise ValueError(f"{path}: JSON input metadata changed while it was read")
        return b"".join(chunks)
    except OSError as exc:
        raise ValueError(f"{path}: cannot read JSON input: {exc}") from exc
    finally:
        os.close(descriptor)


def decode_strict_json(raw: bytes, path: Path) -> Any:
    """Decode UTF-8 JSON while rejecting duplicate keys and non-finite values."""

    try:
        decoded = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ValueError(f"{path}: is not UTF-8 JSON: {exc}") from exc
    try:
        return json.loads(
            decoded,
            object_pairs_hook=_unique_object,
            parse_constant=_invalid_constant,
        )
    except json.JSONDecodeError as exc:
        raise ValueError(
            f"{path}: invalid JSON at line {exc.lineno}, column {exc.colno}: {exc.msg}"
        ) from exc
    except (DuplicateKey, RecursionError, ValueError) as exc:
        raise ValueError(f"{path}: invalid strict JSON: {exc}") from exc


def load_strict_json(
    path: Path,
    *,
    max_bytes: int = MAX_JSON_BYTES,
) -> tuple[Any, bytes]:
    """Return one parsed JSON value and the exact raw bytes used to parse it."""

    raw = read_json_snapshot(path, max_bytes=max_bytes)
    return decode_strict_json(raw, path), raw
