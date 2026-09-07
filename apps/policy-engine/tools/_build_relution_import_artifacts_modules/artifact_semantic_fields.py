"""Semantic-index seed links from the Relution setting catalog."""

from typing import Any

from _recommendation_mapping_modules.candidate_inference_semantic_output import semantic_concepts_for_field

from .artifact_io_values import normalize_policy_platform
from .ruleset_semantic_core import append_unique
from .ruleset_semantic_core import ensure_semantic_concept
from .ruleset_semantic_core import ensure_semantic_target
from .ruleset_semantic_core import semantic_target_id


def add_field_semantic_links(platform: str, fields: list[Any], concepts: dict[str, dict[str, Any]], targets: dict[str, dict[str, Any]]) -> None:
    """Seed semantic concepts and targets from the Relution setting index."""
    policy_platform = normalize_policy_platform(platform)
    for field in fields:
        target_id = semantic_target_id(policy_platform, field.kind, field.target, [field.field_path])
        target = ensure_semantic_target(targets, policy_platform, field.kind, field.target, [field.field_path])
        append_unique(target["labels"], field.label)
        for concept in semantic_concepts_for_field(platform, field):
            concept_id = str(concept.get("id", ""))
            if not concept_id:
                continue
            ensure_semantic_concept(concepts, concept)
            append_unique(target["conceptIds"], concept_id)
            append_unique(concepts[concept_id]["relutionTargetIds"], target_id)
