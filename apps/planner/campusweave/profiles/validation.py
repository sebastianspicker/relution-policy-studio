"""Domain validation facade for the offline university profile."""

from __future__ import annotations

from typing import Any

from .validation_assignments import validate_assignments_and_gates
from .validation_groups import validate_groups_and_rings
from .validation_organization import validate_organization_and_cohorts
from .validation_policies import validate_layers_and_policies
from .validation_sources import build_context


def validate_package(document: Any, concept_ids: set[str]) -> list[str]:
    """Validate the profile in dependency order while keeping the public API stable."""
    context = build_context(document, concept_ids)
    if context.root is None:
        return context.errors
    validate_organization_and_cohorts(context)
    validate_layers_and_policies(context)
    validate_groups_and_rings(context)
    validate_assignments_and_gates(context)
    return sorted(set(context.errors))
