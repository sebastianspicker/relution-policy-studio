"""Loopback-only, offline planner surface for university Relution profiles."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from .server import CampusWeaveServer, create_server

__all__ = ["CampusWeaveServer", "create_server"]


def __getattr__(name: str) -> Any:
    # Resolve the HTTP adapter on first use so command and stdio entry points
    # do not load the legacy server for every planner process.
    if name in __all__:
        from . import server

        return getattr(server, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


def __dir__() -> list[str]:
    return sorted(set(globals()) | set(__all__))
