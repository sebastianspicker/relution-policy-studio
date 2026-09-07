"""Values helpers for recommendation mapping."""

from typing import Any

def value_at_path(path: str, value: Any) -> dict[str, Any]:
    """Wrap a value into a nested dictionary described by a dotted path."""

    parts = [part for part in path.split(".") if part]
    if not parts:
        return {}
    current: Any = value
    for part in reversed(parts):
        current = {part: current}
    return current
def flatten_value_paths(value: Any, prefix: tuple[str, ...] = ()) -> list[str]:
    """Return dotted paths for every leaf in a nested value object."""

    if isinstance(value, dict):
        paths: list[str] = []
        for key in sorted(value):
            paths.extend(flatten_value_paths(value[key], (*prefix, str(key))))
        return paths
    return [".".join(prefix)]
