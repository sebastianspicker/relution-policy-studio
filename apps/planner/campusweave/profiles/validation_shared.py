"""Shared state for ordered university profile validation domains."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Mapping


@dataclass
class ValidationContext:
    """Indexes produced by earlier domains and consumed by later domains."""

    concept_ids: set[str]
    errors: list[str] = field(default_factory=list)
    root: Mapping[str, Any] | None = None
    institution_code: str = ""
    source_index: dict[str, Mapping[str, Any]] = field(default_factory=dict)
    control_index: dict[str, Mapping[str, Any]] = field(default_factory=dict)
    location_index: dict[str, Mapping[str, Any]] = field(default_factory=dict)
    org_index: dict[str, Mapping[str, Any]] = field(default_factory=dict)
    cohort_index: dict[str, Mapping[str, Any]] = field(default_factory=dict)
    layer_index: dict[str, Mapping[str, Any]] = field(default_factory=dict)
    policy_index: dict[str, Mapping[str, Any]] = field(default_factory=dict)
    group_index: dict[str, Mapping[str, Any]] = field(default_factory=dict)
    assignable_groups: set[str] = field(default_factory=set)
    ring_index: dict[str, Mapping[str, Any]] = field(default_factory=dict)
    gate_index: dict[str, Mapping[str, Any]] = field(default_factory=dict)
