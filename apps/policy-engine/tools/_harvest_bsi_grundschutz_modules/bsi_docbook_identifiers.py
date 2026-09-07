"""Supports BSI Grundschutz harvesting and recommendation-mapping workflows."""
from __future__ import annotations

from .bsi_source_text import normalize_space


def parse_requirement_title(raw_title: str) -> dict[str, str] | None:
    """Parse a BSI requirement heading into id, title, level, and actors."""

    title = normalize_space(raw_title)
    actors = ""
    if title.endswith("]"):
        actor_start = title.rfind(" [")
        if actor_start != -1:
            actors = title[actor_start + 2 : -1]
            title = title[:actor_start]
    level_start = title.rfind(" (")
    if level_start == -1 or not title.endswith(")"):
        return None
    level_text = title[level_start + 2 : -1]
    if level_text not in {"B", "S", "H"}:
        return None
    prefix_and_title = title[:level_start]
    requirement_id, separator, requirement_title = prefix_and_title.partition(" ")
    if separator == "" or not is_bsi_requirement_id(requirement_id):
        return None
    return {
        "requirement_id": requirement_id,
        "title": normalize_space(requirement_title),
        "level": level_text,
        "actors": actors,
    }


def is_bsi_requirement_id(value: str) -> bool:
    """Check the SYS.x.y.Az BSI requirement id format."""

    prefix, separator, requirement = value.rpartition(".A")
    if separator == "" or not requirement.isdigit() or not prefix.startswith("SYS."):
        return False
    return all(part.isdigit() for part in prefix.removeprefix("SYS.").split("."))


def parse_generic_threat_title(title: str) -> dict[str, str] | None:
    """Parse a generic BSI threat heading into id and title."""

    prefix, separator, threat_title = normalize_space(title).partition(" ")
    if separator == "" or not prefix.startswith("G"):
        return None
    number = prefix[1:]
    if (
        not number
        or "." not in number
        or not all(part.isdigit() for part in number.split("."))
    ):
        return None
    return {"id": f"G {number}", "title": normalize_space(threat_title)}
