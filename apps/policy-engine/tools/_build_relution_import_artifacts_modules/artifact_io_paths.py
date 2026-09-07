"""Repository and generated-artifact path helpers."""

from pathlib import Path

from .artifact_paths import REPO_ROOT


def relative_path(path: Path) -> str:
    """Return a repository-relative POSIX path."""

    return path.relative_to(REPO_ROOT).as_posix()


def resolve_relative(path: str, root: Path | None = None) -> Path:
    """Resolve a repo-relative path and optionally enforce an output root."""

    resolved = (REPO_ROOT / Path(path)).resolve()
    if root is not None:
        resolved_root = root.resolve()
        if resolved != resolved_root and resolved_root not in resolved.parents:
            raise ValueError(f"Path escapes expected root: {path}")
    return resolved
