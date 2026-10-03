"""Build the browser-safe assurance catalog, audit, presets, and snapshots."""

from __future__ import annotations

from collections import Counter
from pathlib import Path
from typing import Any

from .artifact_io_json import read_json, write_json
from .artifact_io_values import flatten_values
from .artifact_paths import (
    ASSURANCE_CATALOG_PATH,
    ASSURANCE_DETAILS_PATH,
    ASSURANCE_PRESETS_PATH,
    ASSURANCE_RECONCILIATION_PATH,
    ASSURANCE_SNAPSHOT_INDEX_PATH,
    ASSURANCE_SNAPSHOT_ROOT,
    REPO_ROOT,
    SOURCE_CONFIGS,
)
from .assurance_schema_validation import (
    MappingSchema,
    audit_mapping,
    json_pointer,
    load_mapping_schemas,
)
from .assurance_recommendation_projection import (
    applicability_for,
    constraints_for,
    disposition_for,
    disposition_reasons,
    errata_for,
    normalize_platform,
    optional_text,
    parameters_for,
    prerequisites_for,
    provenance_for,
    public_mapping,
    rationale_for,
    refresh_for_sources,
    requirement_strength,
    selectable_mapping_for,
    source_ids_for,
)
from .assurance_sources import (
    CHECKED_AT,
    build_source_provenance,
    canonical_digest,
    write_source_refresh_report,
)


ARTIFACT_VERSION = "1.0.0"
DISPOSITIONS = ("supported", "parameter", "candidate", "organizational", "unsupported")
CURATED_PRESET_ADDITIONS = {
    "essential": {
        "bsi:macos-sys-2-4-a10",
        "cis:cis-apple-ios-26-1-0-0-2-4-3",
        "cis:cis-apple-ios-26-1-0-0-3-4-3",
        "cis:cis-google-android-1-6-0-1-17",
        "vendor:android-001-enforcegoogleplayprotectonmanageddevices",
        "vendor:macos-006-keepgatekeeperassessmentenabled",
        "vendor:windows-0373-enabledomainnetworkfirewall",
        "vendor:windows-0380-enableprivatenetworkfirewall",
        "vendor:windows-0387-enablepublicnetworkfirewall",
    },
    "managed": {
        "bsi:android-enterprise-sys-3-2-4-a2",
        "cis:cis-apple-ios-26-1-0-0-2-2-1-3",
        "cis:cis-apple-ios-26-1-0-0-3-2-1-9",
        "cis:cis-google-android-1-6-0-1-10",
        "vendor:android-002-blockinstallationfromunknownsourcesbydefault",
        "vendor:macos-001-enablefilevaultonmanagedmacs",
        "vendor:macos-002-escrowapersonalrecoverykeyforfilevault",
    },
    "high-assurance": {
        "cis:cis-apple-ios-26-1-0-0-3-2-1-7",
        "cis:cis-apple-macos-26-tahoe-1-0-0-2-3-1-1",
        "cis:cis-google-android-1-6-0-1-12",
        "vendor:android-013-requireaseparateworkprofilesecuritychallenge",
        "vendor:windows-0348-cloudblocklevel",
    },
}


def build_assurance_artifacts() -> None:
    """Generate all assurance artifacts and retain the immutable snapshot pair."""

    schemas = load_mapping_schemas()
    sources, source_index = build_source_provenance()
    corpus_rows = load_corpus()
    recommendation_rows = []
    audit_rows = []
    for source, recommendation in corpus_rows:
        catalog_row, audit_row = project_recommendation(
            source, recommendation, schemas, source_index
        )
        recommendation_rows.append(catalog_row)
        audit_rows.append(audit_row)
    recommendation_rows.sort(key=lambda row: row["id"])
    audit_rows.sort(key=lambda row: row["recommendationId"])
    corpus_digest = canonical_digest(
        {
            "sources": sources,
            "recommendations": [row for _, row in corpus_rows],
        }
    )
    catalog = {
        "schemaVersion": 1,
        "artifactVersion": ARTIFACT_VERSION,
        "generatedBy": "tools/build_relution_import_artifacts.py",
        "corpusDigest": corpus_digest,
        "sourceCheckedAt": CHECKED_AT,
        "freshnessClaim": "none",
        "sources": sources,
        "recommendations": recommendation_rows,
        "summary": catalog_summary(recommendation_rows, audit_rows),
        "reconciliationPath": relative_path(ASSURANCE_RECONCILIATION_PATH),
        "refreshReportPath": "example/recommendation-coverage/source-refresh-report.json",
    }
    presets = build_presets(catalog)
    details = build_details(catalog, corpus_rows)
    write_json(ASSURANCE_CATALOG_PATH, catalog)
    write_json(ASSURANCE_PRESETS_PATH, presets)
    write_json(ASSURANCE_DETAILS_PATH, details)
    write_json(
        ASSURANCE_RECONCILIATION_PATH,
        build_reconciliation(catalog, presets, audit_rows),
    )
    write_source_refresh_report(sources)
    write_snapshot(catalog, presets, details)


def load_corpus() -> list[tuple[str, dict[str, Any]]]:
    """Load every recommendation from every required source catalog."""

    rows = []
    for source, config in sorted(SOURCE_CONFIGS.items()):
        recommendations = read_json(config.recommendation_catalog_path)
        if not isinstance(recommendations, list):
            raise ValueError(f"{source} recommendation catalog must be an array")
        for recommendation in recommendations:
            if not isinstance(recommendation, dict):
                raise ValueError(
                    f"{source} recommendation catalog contains a non-object"
                )
            rows.append((source, recommendation))
    return rows


def project_recommendation(
    source: str,
    recommendation: dict[str, Any],
    schemas: dict[tuple[str, str], MappingSchema],
    source_index: dict[str, dict[str, Any]],
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Project one source row and retain a complete mapping audit."""

    recommendation_id = str(recommendation["id"])
    global_id = f"{source}:{recommendation_id}"
    platform = normalize_platform(str(recommendation["platform"]))
    raw_mapping = recommendation.get("relutionMapping", {})
    exact_mappings = raw_mapping.get("rulesetMappings", [])
    candidates = raw_mapping.get("candidates", [])
    mapping_audits = [
        audit_mapping(
            mapping,
            platform,
            schemas,
            role="exact",
            mapping_id=f"{global_id}#exact-{index:04d}",
        )
        for index, mapping in enumerate(exact_mappings, start=1)
        if isinstance(mapping, dict)
    ]
    mapping_audits.extend(
        audit_mapping(
            mapping,
            platform,
            schemas,
            role="candidate",
            mapping_id=f"{global_id}#candidate-{index:04d}",
        )
        for index, mapping in enumerate(candidates, start=1)
        if isinstance(mapping, dict)
    )
    disposition = disposition_for(recommendation, mapping_audits)
    selectable_mapping = selectable_mapping_for(exact_mappings, mapping_audits)
    applicability = applicability_for(
        platform, recommendation, selectable_mapping, schemas
    )
    constraints = constraints_for(selectable_mapping)
    parameters = parameters_for(global_id, raw_mapping)
    source_ids = source_ids_for(source, recommendation, source_index)
    provenance = provenance_for(source, recommendation_id, source_ids, source_index)
    selectable = bool(
        disposition in {"supported", "parameter"}
        and selectable_mapping is not None
        and applicability["predicates"]
        and not applicability["unresolvedRequirements"]
        and constraints
        and provenance["evidence"]
    )
    reasons = disposition_reasons(
        recommendation, disposition, mapping_audits, selectable_mapping
    )
    row: dict[str, Any] = {
        "id": global_id,
        "sourceId": source_ids[0] if source_ids else None,
        "sourceFamily": source,
        "sourceRecommendationId": recommendation_id,
        "detailReference": {
            "endpoint": "/api/assurance/detail",
            "recommendationId": global_id,
            "detailsPath": "example/recommendation-coverage/assurance-details.json",
            "lookupId": global_id,
            "snapshotScoped": True,
        },
        "title": str(recommendation.get("title", recommendation_id)),
        "platform": platform,
        "disposition": disposition,
        "selectable": selectable,
        "applicability": applicability,
        "constraints": constraints,
        "parameters": parameters,
        "provenance": provenance,
        "dispositionReasons": reasons,
        "rationale": rationale_for(recommendation),
        "impact": optional_text(recommendation.get("impact")),
        "prerequisites": prerequisites_for(recommendation),
        "requirementStrength": requirement_strength(recommendation),
        "errata": errata_for(recommendation),
        "refresh": refresh_for_sources(source_ids, source_index),
    }
    if selectable_mapping is not None:
        row["mapping"] = public_mapping(selectable_mapping, recommendation_id)
    audit_row = {
        "recommendationId": global_id,
        "declaredMappingStatus": raw_mapping.get("status", "none"),
        "disposition": disposition,
        "selectable": selectable,
        "mappingCounts": {
            "exactDeclared": len(exact_mappings),
            "candidatesDeclared": len(candidates),
            "settingsDeclared": sum(len(row["settings"]) for row in mapping_audits),
        },
        "mappings": mapping_audits,
        "suppressionTrace": [],
    }
    return row, audit_row


def build_presets(catalog: dict[str, Any]) -> dict[str, Any]:
    """Build inherited, explicitly curated CampusWeave assurance profiles."""

    catalog_digest = canonical_digest(catalog)
    recommendations = catalog["recommendations"]
    by_id = {row["id"]: row for row in recommendations}
    missing = sorted(
        recommendation_id
        for identifiers in CURATED_PRESET_ADDITIONS.values()
        for recommendation_id in identifiers
        if recommendation_id not in by_id
    )
    if missing:
        raise ValueError(f"Curated assurance recommendations are missing: {missing}")
    essential_candidates = curated_selectable(by_id, "essential")
    managed_candidates = curated_selectable(by_id, "managed")
    high_candidates = curated_selectable(by_id, "high-assurance")
    essential = conflict_free(essential_candidates, {})
    state = selected_value_state(essential)
    managed_additions = conflict_free(managed_candidates, state)
    high_state = selected_value_state([*essential, *managed_additions])
    high_additions = conflict_free(high_candidates, high_state)
    effective = {
        "essential": essential,
        "managed": [*essential, *managed_additions],
        "high-assurance": [*essential, *managed_additions, *high_additions],
    }
    presets = []
    inherited: set[str] = set()
    for (
        preset_id,
        title,
        parent,
        description,
        rationale,
        impact,
        prerequisites,
        review,
    ) in (
        (
            "essential",
            "Essential assurance",
            None,
            "CampusWeave limited-disruption profile of explicitly reviewed firewall, platform-integrity, and threat-scanning controls.",
            "Establish basic endpoint defenses using only source-backed, schema-validated settings from the curated list.",
            "Can change firewall traffic handling, Gatekeeper assessment, or device threat scanning.",
            [
                "Validate device applicability and test the generated plan before assignment."
            ],
            False,
        ),
        (
            "managed",
            "Managed assurance",
            "essential",
            "CampusWeave managed-device profile that inherits Essential and adds explicitly reviewed encryption, recovery, passcode, and developer-mode controls.",
            "Add controls whose operational cost is appropriate only after ownership, support, and recovery responsibilities are assigned.",
            "Can require stronger passcodes, disable developer capabilities, and change disk-encryption and recovery-key handling.",
            [
                "Complete Essential validation and confirm managed-device ownership, FileVault recovery escrow, and support readiness."
            ],
            False,
        ),
        (
            "high-assurance",
            "High assurance",
            "managed",
            "CampusWeave restrictive profile that inherits Managed and adds only explicitly reviewed restrictive controls.",
            "Require explicit operational review before using the most restrictive CampusWeave profile.",
            "Restrictive controls can interrupt access, recovery, enrollment, or critical workflows.",
            [
                "Document a readiness review, recovery path, exception ownership, and deployment rollback plan."
            ],
            True,
        ),
    ):
        effective_ids = {row["id"] for row in effective[preset_id]}
        additions = [row for row in effective[preset_id] if row["id"] not in inherited]
        presets.append(
            {
                "id": preset_id,
                "version": "1.0.0",
                "title": title,
                "description": description,
                "rationale": rationale,
                "impact": impact,
                "prerequisites": prerequisites,
                "requiresReadinessReview": review,
                "profileOrigin": "campusweave",
                "authorityClaim": "none",
                "inherits": parent,
                "selections": [preset_selection(row) for row in additions],
                "exclusions": [
                    {
                        "recommendationId": row["id"],
                        "reason": exclusion_reason(row, preset_id),
                    }
                    for row in recommendations
                    if row["id"] not in effective_ids
                ],
            }
        )
        inherited = effective_ids
    return {
        "schemaVersion": 1,
        "artifactVersion": ARTIFACT_VERSION,
        "catalogArtifactVersion": catalog["artifactVersion"],
        "catalogDigest": catalog_digest,
        "presets": presets,
    }


def curated_selectable(
    by_id: dict[str, dict[str, Any]], preset_id: str
) -> list[dict[str, Any]]:
    """Return curated rows only when their complete evidence remains selectable."""

    return [
        by_id[recommendation_id]
        for recommendation_id in sorted(CURATED_PRESET_ADDITIONS[preset_id])
        if by_id[recommendation_id]["selectable"]
    ]


def conflict_free(
    candidates: list[dict[str, Any]],
    existing: dict[tuple[str, str, str], Any],
) -> list[dict[str, Any]]:
    """Choose stable source mappings that introduce no target/path conflict."""

    state = dict(existing)
    selected = []
    for row in sorted(candidates, key=lambda item: item["id"]):
        family = row["mapping"]["family"]
        target = row["mapping"]["target"]
        values = {
            (family, target, json_pointer(path)): value
            for path, value in flatten_values(row["mapping"]["values"]).items()
        }
        if any(key in state and state[key] != value for key, value in values.items()):
            continue
        state.update(values)
        selected.append(row)
    return selected


def selected_value_state(rows: list[dict[str, Any]]) -> dict[tuple[str, str, str], Any]:
    """Build the mapping-value state inherited by the next preset."""

    return {
        (row["mapping"]["family"], row["mapping"]["target"], json_pointer(path)): value
        for row in rows
        for path, value in flatten_values(row["mapping"]["values"]).items()
    }


def preset_selection(row: dict[str, Any]) -> dict[str, Any]:
    """Build one fixed-value selection with per-setting rationale metadata."""

    fixed_values = {
        json_pointer(path): value
        for path, value in flatten_values(row["mapping"]["values"]).items()
    }
    rationale = row["rationale"] or f"Exact values from {row['id']}."
    return {
        "recommendationId": row["id"],
        "fixedValues": fixed_values,
        "parameterDefaults": {},
        "settingRationales": {path: rationale for path in fixed_values},
        "overrideJustifications": {path: None for path in fixed_values},
    }


def exclusion_reason(row: dict[str, Any], preset_id: str) -> str:
    """Explain why a source row is absent from one preset's effective selection."""

    if row["id"] in CURATED_PRESET_ADDITIONS[preset_id] and not row["selectable"]:
        return "Curated candidate failed closed because its source, applicability, mapping, or constraint evidence is incomplete."
    if not row["selectable"]:
        return f"{row['disposition']}: {row['dispositionReasons'][0]}"
    return f"Not included in the explicitly curated CampusWeave {preset_id} profile or conflicts with an inherited fixed value."


def build_reconciliation(
    catalog: dict[str, Any],
    presets: dict[str, Any],
    audit_rows: list[dict[str, Any]],
) -> dict[str, Any]:
    """Reconcile every source row, declared mapping, setting, and preset decision."""

    suppressions = suppression_index()
    for row in audit_rows:
        row["suppressionTrace"] = suppressions.get(row["recommendationId"], [])
    preset_counts = {}
    catalog_ids = {row["id"] for row in catalog["recommendations"]}
    inherited: set[str] = set()
    for preset in presets["presets"]:
        selected = {row["recommendationId"] for row in preset["selections"]}
        effective = inherited | selected
        excluded = {row["recommendationId"] for row in preset["exclusions"]}
        if effective | excluded != catalog_ids or effective & excluded:
            raise ValueError(f"Preset {preset['id']} does not reconcile the catalog")
        preset_counts[preset["id"]] = {
            "inherited": len(inherited),
            "selectedHere": len(selected),
            "effectiveSelected": len(effective),
            "excluded": len(excluded),
        }
        inherited = effective
    return {
        "schemaVersion": 1,
        "artifactVersion": ARTIFACT_VERSION,
        "catalogDigest": presets["catalogDigest"],
        "recommendationCount": len(audit_rows),
        "mappingCount": sum(
            row["mappingCounts"]["exactDeclared"]
            + row["mappingCounts"]["candidatesDeclared"]
            for row in audit_rows
        ),
        "settingCount": sum(
            row["mappingCounts"]["settingsDeclared"] for row in audit_rows
        ),
        "presetReconciliation": preset_counts,
        "recommendations": audit_rows,
    }


def build_details(
    catalog: dict[str, Any], corpus_rows: list[tuple[str, dict[str, Any]]]
) -> dict[str, Any]:
    """Keep immutable complete normalized records outside the initial catalog payload."""

    catalog_by_id = {row["id"]: row for row in catalog["recommendations"]}
    rows = [
        {
            "id": f"{source}:{recommendation['id']}",
            "sourceId": catalog_by_id[f"{source}:{recommendation['id']}"]["sourceId"],
            "sourceRecommendationId": recommendation["id"],
            "record": recommendation,
        }
        for source, recommendation in corpus_rows
    ]
    rows.sort(key=lambda row: row["id"])
    return {
        "schemaVersion": 1,
        "artifactVersion": ARTIFACT_VERSION,
        "catalogDigest": canonical_digest(catalog),
        "recommendations": rows,
    }


def suppression_index() -> dict[str, list[dict[str, Any]]]:
    """Index generated baseline suppressions by source-qualified rule id."""

    result: dict[str, list[dict[str, Any]]] = {}
    consolidated_root = (
        REPO_ROOT / "example" / "relution-baseline-templates" / "consolidated"
    )
    for path in sorted(consolidated_root.glob("*.json")):
        template = read_json(path)
        for suppression in template.get("consolidation", {}).get(
            "suppressedConflictRules", []
        ):
            source = suppression.get("source")
            rule_id = suppression.get(
                "sourceRecommendationId", suppression.get("ruleId")
            )
            if isinstance(source, str) and isinstance(rule_id, str):
                result.setdefault(f"{source}:{rule_id}", []).append(
                    {**suppression, "templatePath": relative_path(path)}
                )
    return result


def catalog_summary(
    recommendations: list[dict[str, Any]], audits: list[dict[str, Any]]
) -> dict[str, Any]:
    """Summarize the full disposition and mapping audit."""

    disposition_counts = Counter(row["disposition"] for row in recommendations)
    outcome_counts = Counter(
        mapping["outcome"] for row in audits for mapping in row["mappings"]
    )
    return {
        "totalRecommendations": len(recommendations),
        "selectableRecommendations": sum(row["selectable"] for row in recommendations),
        "byDisposition": {key: disposition_counts.get(key, 0) for key in DISPOSITIONS},
        "declaredMappings": sum(len(row["mappings"]) for row in audits),
        "declaredSettings": sum(
            len(mapping["settings"]) for row in audits for mapping in row["mappings"]
        ),
        "mappingAuditOutcomes": dict(sorted(outcome_counts.items())),
    }


def write_snapshot(
    catalog: dict[str, Any], presets: dict[str, Any], details: dict[str, Any]
) -> None:
    """Append one immutable digest-addressed assurance snapshot and update its index."""

    snapshot_digest = canonical_digest({"catalog": catalog, "presets": presets})
    snapshot_root = ASSURANCE_SNAPSHOT_ROOT / snapshot_digest
    snapshot_root.mkdir(parents=True, exist_ok=True)
    write_json(snapshot_root / "assurance-catalog.json", catalog)
    write_json(snapshot_root / "assurance-presets.json", presets)
    write_json(snapshot_root / "assurance-details.json", details)
    existing = (
        read_json(ASSURANCE_SNAPSHOT_INDEX_PATH)
        if ASSURANCE_SNAPSHOT_INDEX_PATH.exists()
        else {"entries": []}
    )
    entry = {
        "snapshotDigest": snapshot_digest,
        "artifactVersion": catalog["artifactVersion"],
        "corpusDigest": catalog["corpusDigest"],
        "catalogDigest": presets["catalogDigest"],
        "catalogPath": relative_path(snapshot_root / "assurance-catalog.json"),
        "presetsPath": relative_path(snapshot_root / "assurance-presets.json"),
        "detailsPath": relative_path(snapshot_root / "assurance-details.json"),
        "detailsDigest": canonical_digest(details),
        "sourceCheckedAt": catalog["sourceCheckedAt"],
        "status": "retained",
    }
    entries = [
        row
        for row in existing.get("entries", [])
        if row.get("snapshotDigest") != snapshot_digest
    ]
    entries.append(entry)
    entries.sort(key=lambda row: row["snapshotDigest"])
    write_json(
        ASSURANCE_SNAPSHOT_INDEX_PATH,
        {
            "schemaVersion": 1,
            "currentSnapshotDigest": snapshot_digest,
            "entries": entries,
        },
    )


def relative_path(path: Path) -> str:
    """Return a repository-relative POSIX artifact path."""

    return path.relative_to(REPO_ROOT).as_posix()
