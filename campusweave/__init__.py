"""Loopback-only, offline planner surface for university Relution profiles."""

from .service import CampusWeaveServer, create_server

__all__ = ["CampusWeaveServer", "create_server"]
