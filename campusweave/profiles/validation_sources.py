"""University profile validation for this domain."""

from __future__ import annotations

import re
from typing import Any, Mapping

from .constants import (
    CONTROL_KEYS,
    MODELS,
    PACKAGE_KEYS,
    PLATFORMS,
    PROVENANCE_KEYS,
    ROOT_KEYS,
    SOURCE_KEYS,
)
from .helpers import (
    add,
    exact_keys,
    mapping,
    records,
    require_references,
    string_list,
)
from .validation_shared import ValidationContext


def build_context(document: Any, concept_ids: set[str]) -> ValidationContext:
    context = ValidationContext(concept_ids=concept_ids)
    root, context.institution_code = validate_identity(document, context.errors)
    if root is None:
        return context
    context.root = root
    (
        sources,
        context.source_index,
        controls,
        context.control_index,
    ) = collect_sources_and_controls(root, context.errors)
    validate_sources(sources, context.errors)
    validate_controls(controls, context.source_index, context.errors)
    return context


def validate_identity(document: Any, errors: list[str]) -> tuple[Mapping[str, Any] | None, str]:
    root = mapping(document, errors, "$")
    if root is None:
        return None, ""
    validate_document_header(root, errors)
    return root, validate_package_metadata(root, errors)


def validate_document_header(root: Mapping[str, Any], errors: list[str]) -> None:
    exact_keys(root, ROOT_KEYS, errors, "$")
    if root.get("schema_version") != "1.0.0":
        add(errors, "$.schema_version", "must equal '1.0.0'")
    document_type = root.get("document_type")
    if document_type != "relution-university-offline-desired-state":
        add(errors, "$.document_type", "must identify the inert university desired-state format")
    expected_schema = "urn:campusweave-relution:schema:university-profile:1.0.0"
    schema_ref = root.get("$schema")
    if schema_ref != expected_schema:
        add(errors, "$.$schema", f"must reference {expected_schema}")


def validate_package_metadata(root: Mapping[str, Any], errors: list[str]) -> str:
    package = mapping(root.get("package"), errors, "$.package")
    if package is None:
        return ""
    exact_keys(package, PACKAGE_KEYS, errors, "$.package")
    institution_code = institution_code_from(package, errors)
    validate_package_values(package, institution_code, errors)
    return institution_code


def institution_code_from(package: Mapping[str, Any], errors: list[str]) -> str:
    candidate_code = package.get("institution_code")
    if not isinstance(candidate_code, str) or len(candidate_code) > 48:
        add(
            errors,
            "$.package.institution_code",
            "must be a lowercase institution namespace of at most 48 characters",
        )
        return ""
    if re.fullmatch(r"[a-z0-9][a-z0-9-]*", candidate_code) is None:
        add(
            errors,
            "$.package.institution_code",
            "must be a lowercase institution namespace of at most 48 characters",
        )
        return ""
    return candidate_code


def validate_package_values(
    package: Mapping[str, Any], institution_code: str, errors: list[str]
) -> None:
    expected = {
        "package_id": f"{institution_code}-relution-desired-state-v1",
        "status": "PROPOSED",
        "evidence_state": "NOT_EVIDENCED",
        "sensitivity": "public_design_no_target_data",
        "execution_capability": "none",
        "execution_authorized": False,
        "target_contract_required": True,
        "production_ready": False,
    }
    for field, expected_value in expected.items():
        if package.get(field) != expected_value:
            add(errors, f"$.package.{field}", f"must equal {expected_value!r}")
    institution_label = package.get("institution_label")
    if (
        not isinstance(institution_label, str)
        or not institution_label
        or institution_label.strip() != institution_label
        or len(institution_label) > 200
    ):
        add(
            errors,
            "$.package.institution_label",
            "must be a trimmed, non-empty institutional label of at most 200 characters",
        )


def collect_sources_and_controls(
    root: Mapping[str, Any], errors: list[str]
) -> tuple[
    list[Mapping[str, Any]],
    dict[str, Mapping[str, Any]],
    list[Mapping[str, Any]],
    dict[str, Mapping[str, Any]],
]:
    provenance = mapping(root.get("provenance"), errors, "$.provenance")
    sources: list[Mapping[str, Any]] = []
    source_index: dict[str, Mapping[str, Any]] = {}
    controls: list[Mapping[str, Any]] = []
    control_index: dict[str, Mapping[str, Any]] = {}
    if provenance is not None:
        exact_keys(provenance, PROVENANCE_KEYS, errors, "$.provenance")
        if provenance.get("authority_order") != ["bsi", "cis", "vendor"]:
            add(errors, "$.provenance.authority_order", "must be exactly BSI, CIS, vendor")
        constants = {
            "conflict_rule": "higher_authority_controls",
            "applicability_rule": "unsupported_vendor_capability_becomes_gap_not_override",
            "cis_content_policy": "metadata_and_control_refs_only",
        }
        for field, expected_value in constants.items():
            if provenance.get(field) != expected_value:
                add(errors, f"$.provenance.{field}", f"must equal {expected_value!r}")
        pseudo_root = dict(root)
        pseudo_root["sources"] = provenance.get("sources")
        pseudo_root["control_intents"] = provenance.get("control_intents")
        sources, source_index = records(pseudo_root, "sources", SOURCE_KEYS, "source_id", errors)
        controls, control_index = records(
            pseudo_root, "control_intents", CONTROL_KEYS, "control_id", errors
        )
    return sources, source_index, controls, control_index


def validate_sources(sources: list[Mapping[str, Any]], errors: list[str]) -> None:
    seen_authorities: set[str] = set()
    for index, source in enumerate(sources):
        authority = source.get("authority")
        if isinstance(authority, str):
            seen_authorities.add(authority)
        validate_source(source, index, errors)
    if seen_authorities != {"bsi", "cis", "vendor"}:
        add(errors, "$.provenance.sources", "must include BSI, CIS, and vendor source metadata")


def validate_source(source: Mapping[str, Any], index: int, errors: list[str]) -> None:
    location = f"$.provenance.sources[{index}]"
    authority = source.get("authority")
    validate_source_authority(source, authority, location, errors)
    validate_source_metadata(source, authority, location, errors)


def validate_source_authority(
    source: Mapping[str, Any], authority: Any, location: str, errors: list[str]
) -> None:
    authority_rank = {"bsi": 1, "cis": 2, "vendor": 3}
    if authority not in authority_rank:
        add(errors, f"{location}.authority", "must be bsi, cis, or vendor")
    elif source.get("authority_rank") != authority_rank[authority]:
        add(errors, f"{location}.authority_rank", "does not match the authority rank")
    if source.get("status") not in {
        "documented",
        "licensed_local_reference",
        "applicability_pending",
    }:
        add(errors, f"{location}.status", "is not an allowed evidence status")
    if source.get("mapping_status") not in {
        "unresolved",
        "metadata_only",
        "verified_local",
    }:
        add(errors, f"{location}.mapping_status", "is not an allowed mapping status")


def validate_source_metadata(
    source: Mapping[str, Any], authority: Any, location: str, errors: list[str]
) -> None:
    publication_date, content_sha256 = validate_source_dates(source, location, errors)
    validate_verified_source(source, publication_date, content_sha256, location, errors)
    validate_source_redistribution(source, authority, location, errors)


def validate_source_dates(
    source: Mapping[str, Any], location: str, errors: list[str]
) -> tuple[Any, Any]:
    publication_date = source.get("publication_date")
    if publication_date is not None and (
        not isinstance(publication_date, str)
        or re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", publication_date) is None
    ):
        add(errors, f"{location}.publication_date", "must be YYYY-MM-DD or null")
    content_sha256 = source.get("content_sha256")
    if content_sha256 is not None and (
        not isinstance(content_sha256, str) or re.fullmatch(r"[0-9a-f]{64}", content_sha256) is None
    ):
        add(errors, f"{location}.content_sha256", "must be a lowercase SHA-256 or null")
    return publication_date, content_sha256


def validate_verified_source(
    source: Mapping[str, Any],
    publication_date: Any,
    content_sha256: Any,
    location: str,
    errors: list[str],
) -> None:
    if source.get("mapping_status") == "verified_local" and (
        publication_date is None
        or content_sha256 is None
        or not isinstance(source.get("version"), str)
        or not source["version"]
    ):
        add(
            errors,
            location,
            "verified source mapping requires version, publication date, and content SHA-256",
        )


def validate_source_redistribution(
    source: Mapping[str, Any], authority: Any, location: str, errors: list[str]
) -> None:
    if source.get("redistribution") not in {
        "public_metadata_only",
        "no_benchmark_body",
    }:
        add(errors, f"{location}.redistribution", "is not an allowed redistribution class")
    if authority == "cis" and source.get("redistribution") != "no_benchmark_body":
        add(errors, f"{location}.redistribution", "CIS content must remain metadata/reference only")


def validate_controls(
    controls: list[Mapping[str, Any]], source_index: dict[str, Mapping[str, Any]], errors: list[str]
) -> None:
    for index, control in enumerate(controls):
        validate_control(control, index, source_index, errors)


def validate_control(
    control: Mapping[str, Any],
    index: int,
    source_index: dict[str, Mapping[str, Any]],
    errors: list[str],
) -> None:
    location = f"$.provenance.control_intents[{index}]"
    validate_control_chain(control, source_index, location, errors)
    validate_control_scope(control, location, errors)


def validate_control_chain(
    control: Mapping[str, Any],
    source_index: dict[str, Mapping[str, Any]],
    location: str,
    errors: list[str],
) -> None:
    chain = require_references(
        control.get("provenance_chain"),
        source_index,
        errors,
        f"{location}.provenance_chain",
        nonempty=True,
    )
    raw_ranks, ranks = chain_ranks(chain, source_index)
    if ranks and ranks[0] != 1:
        add(errors, f"{location}.provenance_chain", "must start with BSI authority")
    if len(ranks) != len(raw_ranks) or ranks != sorted(set(ranks)):
        add(
            errors,
            f"{location}.provenance_chain",
            "must follow strictly increasing BSI, CIS, vendor precedence",
        )


def chain_ranks(
    chain: list[str], source_index: dict[str, Mapping[str, Any]]
) -> tuple[list[Any], list[int]]:
    raw_ranks = [source_index[item].get("authority_rank") for item in chain if item in source_index]
    ranks = [rank for rank in raw_ranks if isinstance(rank, int) and not isinstance(rank, bool)]
    return raw_ranks, ranks


def validate_control_scope(control: Mapping[str, Any], location: str, errors: list[str]) -> None:
    platforms = string_list(
        control.get("platforms"), errors, f"{location}.platforms", nonempty=True
    )
    models = string_list(control.get("models"), errors, f"{location}.models", nonempty=True)
    if set(platforms) - PLATFORMS:
        add(errors, f"{location}.platforms", "contains an unknown platform")
    if set(models) - MODELS:
        add(errors, f"{location}.models", "contains an unknown device model")
    string_list(control.get("unresolved_items"), errors, f"{location}.unresolved_items")
    if control.get("exception_required_if_weakened") is not True:
        add(errors, f"{location}.exception_required_if_weakened", "must be true")
