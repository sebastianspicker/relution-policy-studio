"""Semantic-index link construction from source catalogs."""

from pathlib import Path
from typing import Any

from _recommendation_mapping_modules._mapping_lexical_constants import unique_preserving_order

from .artifact_io_values import normalize_policy_platform
from .artifact_io_json import read_json
from .ruleset_semantic_links import add_recommendation_target_link
from .ruleset_semantic_targets import candidate_target_specs
from .ruleset_semantic_core import ensure_semantic_concept
from .ruleset_semantic_links import exact_target_specs
from .ruleset_semantic_links import target_link_concept_ids


def add_catalog_semantic_links(source: str, catalog_path: Path, state: dict[str, Any]) -> None:
    """Add one source catalog to the shared semantic-index construction state."""
    recommendations = read_json(catalog_path)
    if not isinstance(recommendations, list):
        raise ValueError(f"Required recommendation catalog malformed: source={source} path={catalog_path} expected list")
    for recommendation in recommendations:
        platform = normalize_policy_platform(str(recommendation["platform"]))
        state["counters"]["bySource"][source] = state["counters"]["bySource"].get(source, 0) + 1
        state["counters"]["byPlatform"][platform] = state["counters"]["byPlatform"].get(platform, 0) + 1
        state["recommendationsIndex"].append(semantic_recommendation_index_entry(source, platform, recommendation, state["concepts"], state["targets"]))


def semantic_recommendation_index_entry(source: str, platform: str, recommendation: dict[str, Any], concepts: dict[str, dict[str, Any]], targets: dict[str, dict[str, Any]]) -> dict[str, Any]:
    """Build one semantic-index recommendation row and update link state."""
    recommendation_id, global_id = str(recommendation["id"]), f"{source}:{recommendation['id']}"
    raw_semantic_ids = ensure_recommendation_concepts(recommendation, concepts)
    state = {"targets": targets, "concepts": concepts, "platform": platform, "globalId": global_id, "rawSemanticIds": raw_semantic_ids}
    exact_target_ids, exact_concept_ids = recommendation_target_links(state, exact_target_specs(recommendation), "exact")
    candidate_target_ids, candidate_concept_ids = ([], []) if exact_target_ids else recommendation_target_links(state, candidate_target_specs(recommendation), "candidate")
    return {"source": source, "recommendationId": recommendation_id, "platform": platform, "title": recommendation["title"], "semanticConceptIds": unique_preserving_order(recommendation_semantic_ids(concepts, global_id, raw_semantic_ids, exact_concept_ids, candidate_concept_ids)), "exactTargetIds": unique_preserving_order(exact_target_ids), "candidateTargetIds": unique_preserving_order(candidate_target_ids)}


def ensure_recommendation_concepts(recommendation: dict[str, Any], concepts: dict[str, dict[str, Any]]) -> list[str]:
    """Register declared semantic concepts and return their stable ids."""
    semantic_concepts = [concept for concept in recommendation.get("semanticConcepts", []) if isinstance(concept, dict) and isinstance(concept.get("id"), str)]
    for concept in semantic_concepts:
        ensure_semantic_concept(concepts, concept)
    return [str(concept["id"]) for concept in semantic_concepts]


def recommendation_target_links(state: dict[str, Any], specs: list[dict[str, Any]], link_kind: str) -> tuple[list[str], list[str]]:
    """Link recommendation mappings to semantic targets and concepts."""
    target_ids, concept_ids = [], []
    for spec in specs:
        linked_concept_ids = target_link_concept_ids(state["targets"], state["platform"], spec, state["rawSemanticIds"])
        target_ids.append(add_recommendation_target_link({"targets": state["targets"], "concepts": state["concepts"], "platform": state["platform"], "spec": spec, "recommendationId": state["globalId"], "conceptIds": linked_concept_ids, "linkKind": link_kind}))
        concept_ids.extend(linked_concept_ids)
    return target_ids, concept_ids


def recommendation_semantic_ids(concepts: dict[str, dict[str, Any]], global_id: str, raw_semantic_ids: list[str], exact_concept_ids: list[str], candidate_concept_ids: list[str]) -> list[str]:
    """Choose semantic ids from target links, falling back to declared concepts."""
    linked = exact_concept_ids or candidate_concept_ids or raw_semantic_ids
    for concept_id in linked:
        if concept_id in concepts:
            concepts[concept_id]["recommendationIds"] = unique_preserving_order([*concepts[concept_id]["recommendationIds"], global_id])
    return linked
