"""Bounded, no-follow JSON snapshots for contract and documentation tools."""

from __future__ import annotations

import errno
import json
import os
import stat
from pathlib import Path
from typing import Any, Sequence

MAX_JSON_BYTES = 64 * 1024 * 1024

__all__ = [
    "MAX_JSON_BYTES",
    "DuplicateKey",
    "decode_strict_json",
    "load_strict_json",
    "read_json_snapshot",
]


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


def _safe_posix_open_flags(*, directory: bool = False) -> int:
    """Return required no-follow flags or reject platforms without them."""

    no_follow = getattr(os, "O_NOFOLLOW", None)
    if os.name != "posix" or not isinstance(no_follow, int) or no_follow == 0:
        raise RuntimeError("safe artifact access requires POSIX os.O_NOFOLLOW support")
    if not directory:
        return no_follow

    directory_flag = getattr(os, "O_DIRECTORY", None)
    if (
        not isinstance(directory_flag, int)
        or directory_flag == 0
        or os.open not in os.supports_dir_fd
    ):
        raise RuntimeError(
            "safe beneath-root artifact access requires POSIX directory descriptor support"
        )
    return no_follow | directory_flag


def read_json_snapshot(path: Path, *, max_bytes: int = MAX_JSON_BYTES) -> bytes:
    """Read one regular non-symlink file through a stable descriptor snapshot."""
    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | _safe_posix_open_flags()
    descriptor = _open_snapshot(path, flags)
    try:
        return _read_snapshot_descriptor(descriptor, path, max_bytes)
    except OSError as exc:
        raise ValueError(f"{path}: cannot read JSON input: {exc}") from exc
    finally:
        os.close(descriptor)


def _read_snapshot_descriptor(descriptor: int, path: Path, max_bytes: int) -> bytes:
    before = _snapshot_metadata(descriptor, path, max_bytes)
    payload = _read_snapshot_bytes(descriptor, before.st_size, path)
    _ensure_snapshot_stable(descriptor, before, path)
    return payload


def _open_snapshot(path: Path, flags: int) -> int:
    try:
        return os.open(path, flags)
    except OSError as exc:
        message = (
            "symlink inputs are not allowed"
            if exc.errno == errno.ELOOP
            else f"cannot open regular JSON input: {exc}"
        )
        raise ValueError(f"{path}: {message}") from exc


def _snapshot_metadata(descriptor: int, path: Path, max_bytes: int) -> os.stat_result:
    metadata = os.fstat(descriptor)
    if not stat.S_ISREG(metadata.st_mode):
        raise ValueError(f"{path}: JSON input is not a regular file")
    if metadata.st_size > max_bytes:
        raise ValueError(f"{path}: JSON input exceeds {max_bytes} bytes")
    return metadata


def _read_snapshot_bytes(descriptor: int, size: int, path: Path) -> bytes:
    chunks: list[bytes] = []
    remaining = size
    while remaining:
        chunk = os.read(descriptor, min(64 * 1024, remaining))
        if not chunk:
            raise ValueError(f"{path}: JSON input changed while it was read")
        chunks.append(chunk)
        remaining -= len(chunk)
    if os.read(descriptor, 1):
        raise ValueError(f"{path}: JSON input changed while it was read")
    return b"".join(chunks)


def _ensure_snapshot_stable(descriptor: int, before: os.stat_result, path: Path) -> None:
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
