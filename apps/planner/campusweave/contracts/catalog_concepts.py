"""Concept-registry validation helpers for machine-readable documents."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping
from urllib.parse import urlparse

from .common import (
    API_BINDING_FIELDS,
    APPROVAL_LEVELS,
    CONCEPT_ID,
    CONCEPT_RECORD_KEYS,
    CONCEPT_TOP_LEVEL_KEYS,
    DATE,
    EVIDENCE_CLASSES,
    REGISTRY_DOCUMENT_TYPES,
    RELATED_KINDS,
    RISK_TIERS,
    ROLLBACK_STRATEGIES,
    SCHEMA_VERSION,
    STATIC_EVIDENCE_CLASSES,
    error,
    expect_list,
    expect_mapping,
    require_exact_keys,
    validate_string_array,
)

ConceptIndex = dict[str, tuple[Path, Mapping[str, Any]]]
ConceptReferences = dict[str, list[str]]


@dataclass
class ConceptRegistryState:
    """Mutable indexes collected while validating one registry."""

    path: Path
    errors: list[str]
    prefix: str
    ids: ConceptIndex
    references: ConceptReferences


def validate_concept_registry(
    document: Any, path: Path, errors: list[str]
) -> tuple[ConceptIndex, ConceptReferences]:
    """Validate one stable concept registry and return IDs plus references."""
    root = expect_mapping(document, errors, path, "$")
    if root is None:
        return {}, {}
    prefix = _validate_registry_root(root, path, errors)
    records = expect_list(root.get("records"), errors, path, "$.records")
    if records is None:
        return {}, {}
    if not records:
        error(errors, path, "$.records", "must contain at least one record")
    state = ConceptRegistryState(path, errors, prefix, {}, {})
    for index, raw_record in enumerate(records):
        _validate_record(raw_record, index, state)
    return state.ids, state.references


def _validate_registry_root(root: Mapping[str, Any], path: Path, errors: list[str]) -> str:
    require_exact_keys(root, CONCEPT_TOP_LEVEL_KEYS, errors, path, "$")
    _validate_root_metadata(root, path, errors)
    _validate_root_scope(root.get("scope"), path, errors)
    _validate_root_completeness(root.get("completeness"), path, errors)
    document_type = root.get("document_type")
    return REGISTRY_DOCUMENT_TYPES.get(document_type, "") if isinstance(document_type, str) else ""


def _validate_root_metadata(root: Mapping[str, Any], path: Path, errors: list[str]) -> None:
    _validate_schema_version(root, path, errors)
    _validate_product(root, path, errors)
    _validate_as_of(root, path, errors)
    _validate_registry_identity(root, path, errors)


def _validate_schema_version(root: Mapping[str, Any], path: Path, errors: list[str]) -> None:
    if root.get("schema_version") != SCHEMA_VERSION:
        error(errors, path, "$.schema_version", f"must equal {SCHEMA_VERSION!r}")


def _validate_product(root: Mapping[str, Any], path: Path, errors: list[str]) -> None:
    if root.get("product") != "Relution MDM":
        error(errors, path, "$.product", "must equal 'Relution MDM'")


def _validate_as_of(root: Mapping[str, Any], path: Path, errors: list[str]) -> None:
    value = root.get("as_of")
    if not isinstance(value, str) or not DATE.fullmatch(value):
        error(errors, path, "$.as_of", "must use YYYY-MM-DD")


def _validate_registry_identity(root: Mapping[str, Any], path: Path, errors: list[str]) -> None:
    document_type = root.get("document_type")
    if document_type not in REGISTRY_DOCUMENT_TYPES:
        error(errors, path, "$.document_type", "is not a supported concept registry type")
        return
    expected_id = {
        "feature_registry": "relution.features",
        "setting_registry": "relution.settings",
        "policy_registry": "relution.policies",
        "group_registry": "relution.groups",
    }[document_type]
    if root.get("document_id") != expected_id:
        error(errors, path, "$.document_id", f"must equal {expected_id!r}")


def _validate_root_scope(value: Any, path: Path, errors: list[str]) -> None:
    scope = expect_mapping(value, errors, path, "$.scope")
    if scope is None:
        return
    intended_use = scope.get("intended_use")
    if not isinstance(intended_use, str) or not intended_use:
        error(errors, path, "$.scope.intended_use", "must be a non-empty string")
    validate_string_array(
        scope.get("not_authoritative_for"),
        errors,
        path,
        "$.scope.not_authoritative_for",
        nonempty=True,
    )


def _validate_root_completeness(value: Any, path: Path, errors: list[str]) -> None:
    completeness = expect_mapping(value, errors, path, "$.completeness")
    if completeness is None:
        return
    if completeness.get("level") != "stable_capability_map":
        error(errors, path, "$.completeness.level", "must equal 'stable_capability_map'")
    _validate_completeness_text(completeness, path, errors)
    validate_string_array(
        completeness.get("known_exclusions"),
        errors,
        path,
        "$.completeness.known_exclusions",
    )


def _validate_completeness_text(
    completeness: Mapping[str, Any], path: Path, errors: list[str]
) -> None:
    for field in ("coverage_basis", "contract_boundary"):
        value = completeness.get(field)
        if not isinstance(value, str) or not value:
            error(errors, path, f"$.completeness.{field}", "must be non-empty")


def _validate_record(raw_record: Any, index: int, state: ConceptRegistryState) -> None:
    location = f"$.records[{index}]"
    record = expect_mapping(raw_record, state.errors, state.path, location)
    if record is None:
        return
    require_exact_keys(record, CONCEPT_RECORD_KEYS, state.errors, state.path, location)
    concept_id = _index_concept(record, index, location, state)
    _validate_record_content(record, location, state)
    state.references[concept_id] = _validate_record_relations(record, location, state)
    _validate_api_discovery(record.get("api_discovery"), location, state)
    _validate_evidence(record.get("evidence"), location, state)


def _index_concept(
    record: Mapping[str, Any], index: int, location: str, state: ConceptRegistryState
) -> str:
    concept_id = record.get("id")
    if not isinstance(concept_id, str) or not CONCEPT_ID.fullmatch(concept_id):
        error(state.errors, state.path, f"{location}.id", "must be a valid concept ID")
        return f"<invalid:{index}>"
    _register_concept(concept_id, record, location, state)
    return concept_id


def _register_concept(
    concept_id: str,
    record: Mapping[str, Any],
    location: str,
    state: ConceptRegistryState,
) -> None:
    if state.prefix and not concept_id.startswith(state.prefix):
        error(state.errors, state.path, f"{location}.id", f"must start with {state.prefix!r}")
        return
    if concept_id in state.ids:
        error(state.errors, state.path, f"{location}.id", f"duplicate ID {concept_id!r}")
        return
    state.ids[concept_id] = (state.path, record)


def _validate_record_content(
    record: Mapping[str, Any], location: str, state: ConceptRegistryState
) -> None:
    _validate_record_text(record, location, state)
    _validate_record_arrays(record, location, state)
    _validate_risk(record.get("risk"), location, state)
    _validate_approval(record.get("approval"), location, state)
    _validate_rollback(record.get("rollback"), location, state)


def _validate_record_text(
    record: Mapping[str, Any], location: str, state: ConceptRegistryState
) -> None:
    for field in ("record_kind", "name", "summary"):
        value = record.get(field)
        if not isinstance(value, str) or not value:
            error(state.errors, state.path, f"{location}.{field}", "must be non-empty")


def _validate_record_arrays(
    record: Mapping[str, Any], location: str, state: ConceptRegistryState
) -> None:
    validate_string_array(
        record.get("capabilities"),
        state.errors,
        state.path,
        f"{location}.capabilities",
        nonempty=True,
    )
    for field in ("prerequisites", "sensitive_value_classes"):
        validate_string_array(record.get(field), state.errors, state.path, f"{location}.{field}")
    validate_string_array(
        record.get("platforms"),
        state.errors,
        state.path,
        f"{location}.platforms",
        nonempty=True,
    )


def _validate_risk(value: Any, location: str, state: ConceptRegistryState) -> None:
    risk = expect_mapping(value, state.errors, state.path, f"{location}.risk")
    if risk is None:
        return
    if risk.get("tier") not in RISK_TIERS:
        error(state.errors, state.path, f"{location}.risk.tier", "has an invalid risk tier")
    validate_string_array(risk.get("reasons"), state.errors, state.path, f"{location}.risk.reasons")
    blast_radius = risk.get("blast_radius")
    if not isinstance(blast_radius, str) or not blast_radius:
        error(state.errors, state.path, f"{location}.risk.blast_radius", "must be non-empty")


def _validate_approval(value: Any, location: str, state: ConceptRegistryState) -> None:
    approval = expect_mapping(value, state.errors, state.path, f"{location}.approval")
    if approval is None:
        return
    if approval.get("level") not in APPROVAL_LEVELS:
        error(state.errors, state.path, f"{location}.approval.level", "has an invalid level")
    validate_string_array(
        approval.get("required_for"),
        state.errors,
        state.path,
        f"{location}.approval.required_for",
    )


def _validate_rollback(value: Any, location: str, state: ConceptRegistryState) -> None:
    rollback = expect_mapping(value, state.errors, state.path, f"{location}.rollback")
    if rollback is not None and rollback.get("strategy") not in ROLLBACK_STRATEGIES:
        error(state.errors, state.path, f"{location}.rollback.strategy", "has an invalid strategy")


def _validate_record_relations(
    record: Mapping[str, Any], location: str, state: ConceptRegistryState
) -> list[str]:
    related = expect_mapping(
        record.get("related_ids"),
        state.errors,
        state.path,
        f"{location}.related_ids",
    )
    if related is None:
        return []
    require_exact_keys(
        related,
        set(RELATED_KINDS),
        state.errors,
        state.path,
        f"{location}.related_ids",
    )
    references: list[str] = []
    for kind in RELATED_KINDS:
        references.extend(
            validate_string_array(
                related.get(kind),
                state.errors,
                state.path,
                f"{location}.related_ids.{kind}",
            )
        )
    return references


def _validate_api_discovery(value: Any, location: str, state: ConceptRegistryState) -> None:
    discovery = expect_mapping(value, state.errors, state.path, f"{location}.api_discovery")
    if discovery is None:
        return
    _validate_binding_status(discovery, location, state)
    _validate_empty_bindings(discovery, location, state)
    _validate_discovery_arrays(discovery, location, state)


def _validate_binding_status(
    discovery: Mapping[str, Any], location: str, state: ConceptRegistryState
) -> None:
    if discovery.get("binding_status") != "target_contract_required":
        error(
            state.errors,
            state.path,
            f"{location}.api_discovery.binding_status",
            "must remain 'target_contract_required' in a concept registry",
        )


def _validate_empty_bindings(
    discovery: Mapping[str, Any], location: str, state: ConceptRegistryState
) -> None:
    for field in API_BINDING_FIELDS:
        if discovery.get(field) is not None:
            error(
                state.errors,
                state.path,
                f"{location}.api_discovery.{field}",
                "must be null; concrete bindings belong in a digest-bound target file",
            )


def _validate_discovery_arrays(
    discovery: Mapping[str, Any], location: str, state: ConceptRegistryState
) -> None:
    for field, nonempty in (("tags", False), ("search_terms", False), ("contract_checks", True)):
        validate_string_array(
            discovery.get(field),
            state.errors,
            state.path,
            f"{location}.api_discovery.{field}",
            nonempty=nonempty,
        )


def _validate_evidence(value: Any, location: str, state: ConceptRegistryState) -> None:
    evidence_items = expect_list(value, state.errors, state.path, f"{location}.evidence")
    if evidence_items is None:
        return
    if not evidence_items:
        error(state.errors, state.path, f"{location}.evidence", "must not be empty")
    for index, raw_evidence in enumerate(evidence_items):
        _validate_evidence_item(raw_evidence, f"{location}.evidence[{index}]", state)


def _validate_evidence_item(value: Any, location: str, state: ConceptRegistryState) -> None:
    evidence = expect_mapping(value, state.errors, state.path, location)
    if evidence is None:
        return
    evidence_class = evidence.get("class")
    _validate_evidence_class(evidence_class, location, state)
    _validate_evidence_url(evidence.get("url"), evidence_class, location, state)
    _validate_evidence_claim(evidence, location, state)
    _validate_evidence_date(evidence, location, state)


def _validate_evidence_class(value: Any, location: str, state: ConceptRegistryState) -> None:
    if value not in EVIDENCE_CLASSES:
        error(state.errors, state.path, f"{location}.class", "is invalid")
    elif value not in STATIC_EVIDENCE_CLASSES:
        error(
            state.errors,
            state.path,
            f"{location}.class",
            "target/runtime evidence is forbidden in static concept registries",
        )


def _validate_evidence_url(
    value: Any, evidence_class: Any, location: str, state: ConceptRegistryState
) -> None:
    parsed_url = urlparse(value) if isinstance(value, str) else None
    if parsed_url is None or parsed_url.scheme != "https":
        error(state.errors, state.path, f"{location}.url", "must be an HTTPS URL")
        return
    _validate_official_evidence_host(parsed_url.hostname, evidence_class, location, state)


def _validate_official_evidence_host(
    hostname: str | None,
    evidence_class: Any,
    location: str,
    state: ConceptRegistryState,
) -> None:
    if evidence_class == "official_documentation" and hostname != "hub.relution.io":
        error(
            state.errors,
            state.path,
            f"{location}.url",
            "official Relution evidence must use hub.relution.io",
        )


def _validate_evidence_claim(
    evidence: Mapping[str, Any], location: str, state: ConceptRegistryState
) -> None:
    claim = evidence.get("claim")
    if not isinstance(claim, str) or not claim:
        error(state.errors, state.path, f"{location}.claim", "must be non-empty")


def _validate_evidence_date(
    evidence: Mapping[str, Any], location: str, state: ConceptRegistryState
) -> None:
    accessed = evidence.get("accessed_at")
    if not isinstance(accessed, str) or not DATE.fullmatch(accessed):
        error(state.errors, state.path, f"{location}.accessed_at", "must use YYYY-MM-DD")
