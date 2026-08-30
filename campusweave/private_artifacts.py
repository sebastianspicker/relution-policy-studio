"""Safe local artifact I/O for the offline university runtime."""

from __future__ import annotations

import hashlib
import json
import os
import stat
import tempfile
from pathlib import Path, PurePosixPath
from typing import Any

from .json_snapshot import _safe_posix_open_flags, decode_strict_json

MAX_ARTIFACT_BYTES = 8 * 1024 * 1024

__all__ = [
    "MAX_ARTIFACT_BYTES",
    "atomic_write_json",
    "canonical_json_bytes",
    "canonical_sha256",
    "load_json_beneath",
    "load_json_with_sha256",
    "read_artifact",
    "sha256_file",
    "strict_load_json",
]


def _validate_regular_metadata(
    metadata: os.stat_result,
    path: Path,
    *,
    private: bool,
) -> None:
    if not stat.S_ISREG(metadata.st_mode):
        raise ValueError(f"{path}: is not a regular file")
    if metadata.st_size > MAX_ARTIFACT_BYTES:
        raise ValueError(f"{path}: exceeds {MAX_ARTIFACT_BYTES} bytes")
    if private:
        if metadata.st_uid != os.getuid():
            raise ValueError(f"{path}: target-local artifact must be owned by the current user")
        if stat.S_IMODE(metadata.st_mode) != 0o600:
            raise ValueError(f"{path}: target-local artifact must have mode 0600")


def _read_descriptor(descriptor: int, path: Path, *, private: bool) -> bytes:
    metadata = os.fstat(descriptor)
    _validate_regular_metadata(metadata, path, private=private)
    chunks: list[bytes] = []
    remaining = metadata.st_size
    while remaining:
        chunk = os.read(descriptor, min(64 * 1024, remaining))
        if not chunk:
            raise ValueError(f"{path}: file changed while it was being read")
        chunks.append(chunk)
        remaining -= len(chunk)
    if os.read(descriptor, 1):
        raise ValueError(f"{path}: file changed while it was being read")
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
    if any(getattr(after, field) != getattr(metadata, field) for field in stable_fields):
        raise ValueError(f"{path}: file metadata changed while it was being read")
    return b"".join(chunks)


def read_artifact(path: Path, *, private: bool = False) -> bytes:
    """Read one regular file through a no-follow descriptor and one snapshot."""

    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | _safe_posix_open_flags()
    try:
        descriptor = os.open(path, flags)
    except OSError as exc:
        raise ValueError(f"{path}: cannot open regular non-symlink file: {exc}") from exc
    try:
        return _read_descriptor(descriptor, path, private=private)
    except OSError as exc:
        raise ValueError(f"{path}: cannot read artifact: {exc}") from exc
    finally:
        os.close(descriptor)


def _decode_json(payload: bytes, path: Path) -> Any:
    return decode_strict_json(payload, path)


def load_json_with_sha256(path: Path, *, private: bool = False) -> tuple[Any, str]:
    payload = read_artifact(path, private=private)
    return _decode_json(payload, path), hashlib.sha256(payload).hexdigest()


def strict_load_json(path: Path, *, private: bool = False) -> Any:
    """Load bounded UTF-8 JSON without symlinks or duplicate keys."""

    return load_json_with_sha256(path, private=private)[0]


def sha256_file(path: Path, *, private: bool = False) -> str:
    """Hash a bounded regular file after applying the local-artifact policy."""

    return hashlib.sha256(read_artifact(path, private=private)).hexdigest()


def _relative_parts(relative: str) -> tuple[str, ...]:
    pure = PurePosixPath(relative)
    if pure.is_absolute() or not pure.parts or any(part in {"", ".", ".."} for part in pure.parts):
        raise ValueError(f"{relative!r}: must be a traversal-free relative path")
    return pure.parts


def load_json_beneath(
    root: Path,
    relative: str,
    *,
    private: bool = True,
) -> tuple[Any, str, Path, bytes]:
    """Open a JSON artifact beneath a real private directory without following links."""

    parts = _relative_parts(relative)
    resolved_root = _resolve_root(root)
    directory_flags = (
        os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | _safe_posix_open_flags(directory=True)
    )
    file_flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | _safe_posix_open_flags()
    display_path = resolved_root.joinpath(*parts)
    payload = _read_beneath_descriptors(
        parts, resolved_root, display_path, directory_flags, file_flags, private
    )
    return (
        _decode_json(payload, display_path),
        hashlib.sha256(payload).hexdigest(),
        display_path,
        payload,
    )


def _read_beneath_descriptors(
    parts: tuple[str, ...],
    resolved_root: Path,
    display_path: Path,
    directory_flags: int,
    file_flags: int,
    private: bool,
) -> bytes:
    descriptors: list[int] = []
    try:
        current = _open_root(resolved_root, directory_flags)
        descriptors.append(current)
        _validate_private_directory(current, resolved_root, private, root=True)
        current = _open_nested_directories(
            parts[:-1], current, directory_flags, descriptors, display_path, private
        )
        descriptor = os.open(parts[-1], file_flags, dir_fd=current)
        descriptors.append(descriptor)
        payload = _read_descriptor(descriptor, display_path, private=private)
    except OSError as exc:
        raise ValueError(
            f"{display_path}: cannot open beneath artifact root without following symlinks: {exc}"
        ) from exc
    finally:
        for descriptor in reversed(descriptors):
            os.close(descriptor)
    return payload


def _resolve_root(root: Path) -> Path:
    try:
        return root.resolve(strict=True)
    except OSError as exc:
        raise ValueError(f"{root}: cannot resolve artifact root: {exc}") from exc


def _open_root(root: Path, flags: int) -> int:
    try:
        return os.open(root, flags)
    except OSError as exc:
        raise ValueError(f"{root}: cannot open artifact root: {exc}") from exc


def _validate_private_directory(
    descriptor: int, path: Path, private: bool, *, root: bool = False
) -> None:
    if not private:
        return
    metadata = os.fstat(descriptor)
    if metadata.st_uid != os.getuid() or stat.S_IMODE(metadata.st_mode) != 0o700:
        suffix = "private artifact root" if root else "every private artifact directory"
        raise ValueError(f"{path}: {suffix} must be current-user mode 0700")


def _open_nested_directories(
    parts: tuple[str, ...],
    current: int,
    flags: int,
    descriptors: list[int],
    display_path: Path,
    private: bool,
) -> int:
    for part in parts:
        current = os.open(part, flags, dir_fd=current)
        descriptors.append(current)
        _validate_private_directory(current, display_path, private)
    return current


def canonical_json_bytes(value: Any) -> bytes:
    return (
        json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n"
    ).encode("utf-8")


def canonical_sha256(value: Any) -> str:
    return hashlib.sha256(canonical_json_bytes(value)).hexdigest()


def _write_temporary(descriptor: int, value: Any, mode: int) -> None:
    """Write and close a temporary descriptor after taking sole ownership."""

    try:
        os.fchmod(descriptor, mode)
        payload = canonical_json_bytes(value)
        with os.fdopen(descriptor, "wb") as handle:
            descriptor = -1
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
    finally:
        if descriptor >= 0:
            os.close(descriptor)


def atomic_write_json(path: Path, value: Any, *, mode: int = 0o600) -> None:
    """Create a new JSON artifact atomically; existing outputs are never replaced."""

    _safe_posix_open_flags()
    parent = _prepare_output(path)
    target = parent / path.name
    if target.exists() or target.is_symlink():
        raise ValueError(f"{path}: output already exists")

    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=parent)
    _finish_atomic_write(descriptor, Path(temporary_name), target, path, value, mode)


def _finish_atomic_write(
    descriptor: int, temporary: Path, target: Path, path: Path, value: Any, mode: int
) -> None:
    try:
        _write_temporary(descriptor, value, mode)
        os.link(temporary, target)
        temporary.unlink()
    except BaseException:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass
        raise


def _prepare_output(path: Path) -> Path:
    if path.exists() or path.is_symlink():
        raise ValueError(f"{path}: output already exists")
    try:
        parent = path.parent.resolve(strict=True)
    except OSError as exc:
        raise ValueError(f"{path.parent}: cannot resolve output parent: {exc}") from exc
    if not parent.is_dir():
        raise ValueError(f"{path.parent}: output parent must already be a directory")
    return parent
