"""Shared JSON, path, and Relution settings file helpers."""

from __future__ import annotations

import json
import re
import shutil
from pathlib import Path
from typing import Any

from recommendation_mapping import (
    semantic_concepts_for,
    split_identifier,
    unique_preserving_order,
)

from .artifact_paths import REPO_ROOT, SourceConfig

SOURCE_CONFIG: dict[str, dict[str, Any]] = {
    "bsi": {
        "policyNames": {
            "WINDOWS": "Windows BSI Grundschutz",
            "MACOS": "macOS BSI Grundschutz",
            "IOS": "iOS BSI Grundschutz",
            "ANDROID_ENTERPRISE": "Android BSI Grundschutz",
        },
        "policyDescription": (
            "Generated from the active BSI requirement catalog with exact Relution "
            "aggregates and preserved informational metadata."
        ),
        "titleIdField": "requirementId",
        "reasonFields": ("reason", "requirementText", "title"),
        "recommendedValueField": "requirementText",
        "settingsCatalogReadmeLine": (
            "- `bsi-relution-settings-catalog.json`: machine-readable catalog of exact "
            "Relution setting bundles, their provenance, and any explicit variant groups."
        ),
        "rulesetReadmeAnchor": (
            "- `bsi-relution-ruleset.json`: importable Relution ruleset built from the "
            "active BSI requirements. Only exact Relution mappings are actionable; the rest "
            "stay informational with preserved metadata."
        ),
    },
    "cis": {
        "policyNames": {
            "WINDOWS": "Windows CIS Benchmarks",
            "MACOS": "macOS CIS Benchmarks",
            "IOS": "iOS CIS Benchmarks",
            "ANDROID_ENTERPRISE": "Android CIS Benchmarks",
        },
        "policyDescription": (
            "Generated from the harvested CIS benchmark catalog with exact Relution "
            "aggregates and preserved informational metadata."
        ),
        "titleIdField": "recommendationId",
        "reasonFields": ("rationale", "description", "title"),
        "recommendedValueField": "recommendedValue",
        "settingsCatalogReadmeLine": (
            "- `cis-relution-settings-catalog.json`: machine-readable catalog of exact "
            "Relution setting bundles, their provenance, and any explicit variant groups."
        ),
        "rulesetReadmeAnchor": (
            "- `cis-relution-ruleset.json`: importable Relution ruleset that preserves "
            "every recommendation as informational metadata and adds only conflict-safe "
            "aggregate exact mappings."
        ),
    },
    "vendor": {
        "policyNames": {
            "WINDOWS": "Windows Vendor Guidance",
            "MACOS": "macOS Vendor Guidance",
            "IOS": "iOS Vendor Guidance",
            "ANDROID_ENTERPRISE": "Android Vendor Guidance",
        },
        "policyDescription": (
            "Generated from the harvested vendor recommendation catalog with exact Relution "
            "aggregates and preserved informational metadata."
        ),
        "titleIdField": None,
        "reasonFields": ("reason", "title"),
        "recommendedValueField": "recommendedValue",
        "settingsCatalogReadmeLine": (
            "- `vendor-relution-settings-catalog.json`: machine-readable catalog of exact "
            "Relution setting bundles, their provenance, and any explicit variant groups."
        ),
        "rulesetReadmeAnchor": (
            "- `vendor-relution-ruleset.json`: importable ruleset JSON for this repo’s "
            "ruleset importer. Recommendation-level rules are retained as informational "
            "metadata, and merge-safe exact mappings are emitted as actionable aggregate "
            "rules."
        ),
    },
}


def build_informational_rule(
    source: str, recommendation: dict[str, Any]
) -> dict[str, Any]:
    """Create a non-actionable ruleset row that preserves recommendation metadata."""

    rule: dict[str, Any] = {
        "id": recommendation["id"],
        "title": informational_title(source, recommendation),
        "informational": True,
        "reason": informational_reason(source, recommendation),
        "recommendedValue": informational_value(source, recommendation),
        "sourceIds": list(recommendation.get("sourceIds", [])),
        "mappingStatus": recommendation.get("relutionMapping", {}).get("status"),
        "mappings": [],
    }
    if source == "bsi":
        rule["section"] = recommendation.get("category")
        if isinstance(recommendation.get("grundschutzKompendium"), dict):
            rule["grundschutzKompendium"] = recommendation["grundschutzKompendium"]
        if isinstance(recommendation.get("grundschutzPlusPlus"), dict):
            rule["grundschutzPlusPlus"] = recommendation["grundschutzPlusPlus"]
        if isinstance(recommendation.get("semanticConcepts"), list):
            rule["semanticConcepts"] = recommendation["semanticConcepts"]
        if isinstance(recommendation.get("semanticNoConceptReason"), str):
            rule["semanticNoConceptReason"] = recommendation["semanticNoConceptReason"]
    if source == "cis":
        rule["assessmentStatus"] = recommendation.get("assessmentStatus")
        if isinstance(recommendation.get("semanticConcepts"), list):
            rule["semanticConcepts"] = recommendation["semanticConcepts"]
        if isinstance(recommendation.get("semanticNoConceptReason"), str):
            rule["semanticNoConceptReason"] = recommendation["semanticNoConceptReason"]
    if source == "vendor":
        rule["section"] = recommendation.get("section")
    return rule


def build_aggregate_rule(bundle: dict[str, Any]) -> dict[str, Any]:
    """Create an actionable aggregate rule from an exact settings bundle."""

    details = dict(bundle["details"])
    details.pop("type", None)
    variant_id = bundle.get("variantId")
    title_suffix = f" ({variant_id})" if variant_id else ""
    return {
        "id": f"{bundle['bundleId']}-aggregate",
        "title": f"Relution aggregate: {bundle['targetType']}{title_suffix}",
        "informational": False,
        "reason": (
            "Aggregates exact Relution mappings from "
            f"{', '.join(bundle['derivedFromRecommendationIds'])}."
        ),
        "sourceIds": bundle["sourceIds"],
        "mappings": [
            {
                "kind": "relution-native",
                "type": bundle["targetType"],
                "values": details,
            }
        ],
        **({"variantId": variant_id} if variant_id else {}),
    }


def policy_name(
    source: str, platform: str, variant_ids: list[str] | None = None
) -> str:
    """Return the generated policy name for a source/platform variant."""

    base = SOURCE_CONFIG[source]["policyNames"][platform]
    if not variant_ids:
        return base
    return f"{base} ({', '.join(variant_ids)})"


def policy_description(source: str, variant_ids: list[str] | None) -> str:
    """Return the generated policy description with variant context."""

    description = SOURCE_CONFIG[source]["policyDescription"]
    if not variant_ids:
        return description
    return f"{description} Variant selection: {', '.join(variant_ids)}."


def informational_title(source: str, recommendation: dict[str, Any]) -> str:
    """Return the ruleset title for an informational recommendation rule."""

    title_id_field = SOURCE_CONFIG[source]["titleIdField"]
    if isinstance(title_id_field, str):
        return f"{recommendation[title_id_field]} {recommendation['title']}"
    return recommendation["title"]


def informational_reason(source: str, recommendation: dict[str, Any]) -> str:
    """Return the first configured explanatory text for a recommendation."""

    for field in SOURCE_CONFIG[source]["reasonFields"]:
        value = recommendation.get(field)
        if value:
            return value
    return recommendation["title"]


def informational_value(source: str, recommendation: dict[str, Any]) -> Any:
    """Return the source-specific recommended value field."""

    return recommendation.get(SOURCE_CONFIG[source]["recommendedValueField"])


def write_settings_files(
    config: SourceConfig, settings_catalog: dict[str, Any]
) -> None:
    """Write import-ready setting bundle JSON files under the source root."""

    settings_root = config.root / "relution-settings"
    if settings_root.exists():
        shutil.rmtree(settings_root)
    for bundle in settings_catalog["bundles"]:
        path = resolve_relative(bundle["importFilePath"], root=settings_root)
        path.parent.mkdir(parents=True, exist_ok=True)
        write_json(path, bundle["details"])


def update_baseline_summary(config: SourceConfig, baseline: dict[str, Any]) -> None:
    """Add generated artifact references to a baseline summary and write it."""

    baseline["recommendationCatalogPath"] = relative_path(
        config.recommendation_catalog_path
    )
    baseline["importableRulesetPath"] = relative_path(config.ruleset_path)
    baseline["settingBundleCatalogPath"] = relative_path(config.settings_catalog_path)
    write_json(config.baseline_path, baseline)


def update_readme(config: SourceConfig) -> None:
    """Ensure the source README references generated ruleset and setting artifacts."""

    readme = config.readme_path.read_text(encoding="utf8")
    settings_line = settings_catalog_readme_line(config.source)
    bundle_dir_line = settings_directory_readme_line()
    if settings_line not in readme or bundle_dir_line not in readme:
        anchor = ruleset_readme_anchor(config.source)
        replacement = f"{anchor}\n{settings_line}\n{bundle_dir_line}"
        readme = readme.replace(anchor, replacement)
    config.readme_path.write_text(readme, encoding="utf8")


def settings_catalog_readme_line(source: str) -> str:
    """Return the README bullet for a source settings catalog."""

    return SOURCE_CONFIG[source]["settingsCatalogReadmeLine"]


def settings_directory_readme_line() -> str:
    """Return the shared README bullet for import-ready setting bundles."""

    return (
        "- `relution-settings/`: import-ready plain setting JSON bundles grouped by "
        "Relution platform and template type for the editor's `Apply JSON` flow."
    )


def ruleset_readme_anchor(source: str) -> str:
    """Return the existing README ruleset bullet used as insertion anchor."""

    return SOURCE_CONFIG[source]["rulesetReadmeAnchor"]


def variant_id_from_signature(signature: tuple[tuple[str, str], ...]) -> str:
    """Build a stable variant id from a bundle value signature."""

    parts = []
    for path, serialized_value in signature:
        value = json.loads(serialized_value)
        parts.append(
            f"{slugify(path.replace('.', '-'))}-{slugify(stringify_value(value))}"
        )
    return slugify("-".join(parts))


def normalize_policy_platform(platform: str) -> str:
    """Normalize Android policy variants to the Android Enterprise platform key."""

    return "ANDROID_ENTERPRISE" if platform == "ANDROID" else platform


def unique_single_value(values: Any) -> str:
    """Return one unique value or a slash-joined list of unique values."""

    unique_values = unique_preserving_order(values)
    if len(unique_values) == 1:
        return unique_values[0]
    return "/".join(unique_values)


def semantic_concept_ids_for_target_spec(
    platform: str, spec: dict[str, Any]
) -> list[str]:
    """Infer semantic concept ids from a target specification."""

    concepts = semantic_concepts_for(
        platform,
        [
            {
                "source": "mapping-target",
                "text": semantic_target_spec_text(spec),
                "sourceId": str(spec.get("target", "")),
            }
        ],
    )
    return [
        str(concept["id"]) for concept in concepts if isinstance(concept.get("id"), str)
    ]


def semantic_target_spec_text(spec: dict[str, Any]) -> str:
    """Collect target, field, match, and value text for semantic classification."""

    match = spec.get("match")
    matched_terms = []
    if isinstance(match, dict):
        matched_terms = [
            str(term) for term in match.get("matchedTerms", []) if isinstance(term, str)
        ]
    field_paths = [
        str(path) for path in spec.get("fieldPaths", []) if isinstance(path, str)
    ]
    values = [
        stringify_value(value)
        for value in flatten_values(spec.get("values", {})).values()
    ]
    return " ".join(
        [
            " ".join(matched_terms),
            split_camel_text(str(spec.get("target", ""))),
            " ".join(split_camel_text(path) for path in field_paths),
            " ".join(split_camel_text(value) for value in values),
        ]
    )


def flatten_values(
    value: Any, prefix: tuple[str, ...] = ()
) -> dict[tuple[str, ...], Any]:
    """Flatten nested mapping values into tuple paths."""

    if not isinstance(value, dict):
        return {prefix: value}
    flattened: dict[tuple[str, ...], Any] = {}
    for key in sorted(value):
        child = value[key]
        child_prefix = prefix + (str(key),)
        if isinstance(child, dict):
            flattened.update(flatten_values(child, child_prefix))
            continue
        flattened[child_prefix] = child
    return flattened


def split_camel_text(value: str) -> str:
    """Split identifier text into human-readable words."""

    return " ".join(split_identifier(value))


def path_to_string(path: tuple[str, ...]) -> str:
    """Render a flattened value path as dotted text."""

    return ".".join(path)


def update_plan_payload(
    *,
    metadata: dict[str, Any],
    inputs: dict[str, Path],
    rows: list[dict[str, Any]],
    summary: dict[str, Any],
) -> dict[str, Any]:
    """Build the common review-gated update-plan artifact envelope."""
    return {
        "version": 1,
        **metadata,
        "inputs": {name: relative_path(path) for name, path in inputs.items()},
        "rows": rows,
        "summary": summary,
    }


def update_plan_inputs(
    primary_name: str,
    primary_path: Path,
    shared_paths: tuple[Path, Path, Path],
) -> dict[str, Path]:
    """Build common input paths for review-gated update-plan artifacts."""
    (
        exact_mapping_reference_path,
        mapping_candidate_review_path,
        manual_promotion_ledger_path,
    ) = shared_paths
    return {
        primary_name: primary_path,
        "exactMappingReferencePath": exact_mapping_reference_path,
        "mappingCandidateReviewPath": mapping_candidate_review_path,
        "manualPromotionLedgerPath": manual_promotion_ledger_path,
    }


def stringify_value(value: Any) -> str:
    """Render primitive values in stable text form for ids and semantics."""

    if isinstance(value, bool):
        return "true" if value else "false"
    if value is None:
        return "null"
    return str(value)


def stable_json(value: Any) -> str:
    """Serialize a value deterministically for signature comparisons."""

    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def relative_path(path: Path) -> str:
    """Return a repository-relative POSIX path."""

    return path.relative_to(REPO_ROOT).as_posix()


def resolve_relative(path: str, root: Path | None = None) -> Path:
    """Resolve a repo-relative path and optionally enforce an output root."""

    resolved = (REPO_ROOT / Path(path)).resolve()
    if root is not None:
        resolved_root = root.resolve()
        if resolved != resolved_root and resolved_root not in resolved.parents:
            raise ValueError(f"Path escapes expected root: {path}")
    return resolved


def slugify(value: str) -> str:
    """Convert free text into a lowercase artifact id segment."""

    slug = value.lower().replace("_", "-")
    slug = re.sub(r"[^a-z0-9-]+", "-", slug)
    slug = re.sub(r"-{2,}", "-", slug)
    return slug.strip("-")


def read_json(path: Path) -> Any:
    """Read a UTF-8 JSON artifact from disk."""

    return json.loads(path.read_text(encoding="utf8"))


def write_json(path: Path, payload: Any) -> None:
    """Write a deterministic UTF-8 JSON artifact."""

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf8"
    )
