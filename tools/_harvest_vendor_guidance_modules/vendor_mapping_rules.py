"""Map harvested vendor guidance records to Relution recommendations."""

from __future__ import annotations

import json
import re
import shutil
from pathlib import Path
from typing import Any

from recommendation_mapping import (
    infer_exact_boolean_mapping,
    mapping_candidates as shared_mapping_candidates,
    semantic_candidates_for,
    semantic_concepts_for,
    semantic_evidence_source_records,
    semantic_metadata_for,
    windows_custom_csp_mapping_for,
)

from _harvest_vendor_guidance_modules.common import (
    TEMPLATE_BUNDLE_PATH,
    VENDOR_DIR,
    VENDOR_VERIFIED_AS_OF,
    WINDOWS_BASELINE_NAME,
    WINDOWS_EXACT_BY_ID,
    WINDOWS_WORKBOOK_PATH,
    merge_candidate_lists,
)


def build_windows_recommendation(
    index: int,
    row: dict[str, Any],
    help_by_title: dict[str, str],
    field_index: dict[str, list[dict[str, Any]]],
    windows_rexp_evidence: dict[frozenset[str], list[dict[str, Any]]],
) -> dict[str, Any]:
    """Build one normalized Windows vendor recommendation with mapping metadata."""

    title = str(row["title"])
    section = str(row["section"])
    recommendation_id = f"windows-{index:04d}-{compact_slug(title)}"
    exact = WINDOWS_EXACT_BY_ID.get(recommendation_id)
    source_context = windows_source_context(title, help_by_title)
    semantic_evidence_sources = windows_semantic_evidence_sources(
        recommendation_id, title, section, row, source_context["reason"]
    )
    semantic_concepts = semantic_concepts_for("WINDOWS", semantic_evidence_sources)
    semantic_candidates = semantic_candidates_for("WINDOWS", semantic_concepts)
    mapping_context = windows_mapping_context(
        {
            "row": row,
            "title": title,
            "section": section,
            "reason": source_context["reason"],
            "exact": exact,
            "fieldIndex": field_index,
            "windowsRexpEvidence": windows_rexp_evidence,
            "semanticCandidates": semantic_candidates,
        }
    )
    semantic_metadata = semantic_metadata_for(
        semantic_evidence_sources, semantic_concepts
    )
    return {
        "id": recommendation_id,
        "platform": "WINDOWS",
        "sourceIds": source_context["sourceIds"],
        "title": title,
        "section": section,
        "recommendedValue": row["recommendedValue"],
        "reason": source_context["reason"],
        "reasonSource": source_context["reasonSource"],
        "vendor": {
            "baseline": WINDOWS_BASELINE_NAME,
            "parentTitle": row.get("parentTitle"),
        },
        "relutionMapping": vendor_relution_mapping(
            mapping_context["rulesetMappings"],
            mapping_context["matchedCandidates"],
            semantic_candidates,
            mapping_context["candidates"],
        ),
        **semantic_metadata,
    }


def windows_source_context(title: str, help_by_title: dict[str, str]) -> dict[str, Any]:
    """Select source ids and reason text for a Windows baseline row."""

    help_text = help_by_title.get(title)
    source_ids = ["microsoft-intune-windows-mdm-baseline-settings"]
    if help_text:
        source_ids.append("microsoft-windows-11-24h2-security-baseline-zip")
        return {
            "sourceIds": source_ids,
            "reason": normalize_text(help_text),
            "reasonSource": "microsoft-windows-11-24h2-security-baseline-zip",
        }
    return {
        "sourceIds": source_ids,
        "reason": (
            "Microsoft lists this as a default setting in the current Windows 11 version "
            "25H2 Intune MDM baseline for managed Windows devices."
        ),
        "reasonSource": "microsoft-intune-windows-mdm-baseline-settings",
    }


def windows_semantic_evidence_sources(
    recommendation_id: str,
    title: str,
    section: str,
    row: dict[str, Any],
    reason: str,
) -> list[dict[str, Any]]:
    """Build semantic evidence sources for Windows vendor mapping."""

    return vendor_semantic_evidence_sources_for(
        recommendation_id,
        {
            "platform": "WINDOWS",
            "title": title,
            "section": section,
            "reason": reason,
            "recommendedValue": row["recommendedValue"],
            "extraTexts": (str(row.get("parentTitle") or ""),),
        },
    )


def windows_mapping_context(context: dict[str, Any]) -> dict[str, Any]:
    """Resolve exact, inferred, and semantic Windows mapping candidates."""

    rexp_exact, inferred_exact = inferred_windows_exact_mappings(context)
    mapping = windows_mapping_tuple(context["exact"], rexp_exact, inferred_exact)
    matched_candidates = shared_mapping_candidates(
        "WINDOWS",
        context["title"],
        context["section"],
        context["fieldIndex"],
        {
            "exactMapping": mapping,
            "recommendedValue": context["row"]["recommendedValue"],
            "extraTexts": (context["reason"],),
            "allowedKinds": {"relution-native"},
        },
    )
    return {
        "matchedCandidates": matched_candidates,
        "candidates": merge_candidate_lists(
            matched_candidates, context["semanticCandidates"]
        ),
        "rulesetMappings": windows_ruleset_mappings(
            context["exact"], rexp_exact, inferred_exact
        ),
    }


def inferred_windows_exact_mappings(
    context: dict[str, Any],
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    """Infer exact Windows mappings from REXP evidence or boolean fields."""

    row = context["row"]
    exact = context["exact"]
    if exact is not None:
        return None, None
    rexp_exact = windows_custom_csp_mapping_for(
        context["title"],
        row["recommendedValue"],
        context["windowsRexpEvidence"],
        parent_title=str(row.get("parentTitle") or ""),
    )
    if rexp_exact is not None:
        return rexp_exact, None
    return None, infer_exact_boolean_mapping(
        "WINDOWS",
        context["title"],
        row["recommendedValue"],
        context["fieldIndex"],
        {
            "section": context["section"],
            "extraTexts": (context["reason"],),
            "allowedKinds": {"relution-native"},
        },
    )


def windows_mapping_tuple(
    exact: dict[str, Any] | None,
    rexp_exact: dict[str, Any] | None,
    inferred_exact: dict[str, Any] | None,
) -> tuple[Any, Any] | None:
    """Return the exact mapping tuple used by the shared candidate scorer."""

    if exact is not None:
        return exact["type"], exact["values"]
    if rexp_exact is not None and isinstance(rexp_exact.get("type"), str):
        return rexp_exact["type"], rexp_exact["values"]
    if inferred_exact is not None and isinstance(inferred_exact.get("type"), str):
        return inferred_exact["type"], inferred_exact["values"]
    return None


def windows_ruleset_mappings(
    exact: dict[str, Any] | None,
    rexp_exact: dict[str, Any] | None,
    inferred_exact: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    """Return importable Windows ruleset mappings in precedence order."""

    if exact is not None:
        return [
            {
                "kind": "relution-native",
                "type": exact["type"],
                "values": exact["values"],
            }
        ]
    if rexp_exact is not None:
        return [rexp_exact]
    return [] if inferred_exact is None else [inferred_exact]


def vendor_semantic_evidence_sources_for(
    recommendation_id: str, options: dict[str, Any]
) -> list[dict[str, Any]]:
    """Build semantic evidence rows for vendor recommendation text."""

    sources = [
        ("vendor-title", options["title"], 0.9),
        ("vendor-section", options["section"], 0.78),
        ("vendor-reason", options["reason"], 0.74),
        ("vendor-recommended-value", str(options["recommendedValue"]), 0.62),
        ("vendor-platform", options["platform"], 0.45),
        *[
            (f"vendor-context-{index}", text, 0.58)
            for index, text in enumerate(options.get("extraTexts", ()), start=1)
        ],
    ]
    return semantic_evidence_source_records(recommendation_id, sources, normalize_text)


def vendor_relution_mapping(
    ruleset_mappings: list[dict[str, Any]],
    matched_candidates: list[dict[str, Any]],
    semantic_candidates: list[dict[str, Any]],
    candidates: list[dict[str, Any]],
) -> dict[str, Any]:
    """Build the Relution mapping envelope for a vendor recommendation."""

    return {
        "status": vendor_mapping_status(
            ruleset_mappings, matched_candidates, semantic_candidates
        ),
        "mergeableInImportableRuleset": bool(ruleset_mappings),
        "candidates": candidates,
        "rulesetMappings": ruleset_mappings,
        "notes": [],
    }


def vendor_mapping_status(
    ruleset_mappings: list[dict[str, Any]],
    matched_candidates: list[dict[str, Any]],
    semantic_candidates: list[dict[str, Any]],
) -> str:
    """Classify mapping status from exact, matched, and semantic candidates."""

    if ruleset_mappings:
        return "exact"
    if matched_candidates:
        return "suggested"
    if semantic_candidates:
        return "partial"
    return "none"


def workbook_help_by_title() -> dict[str, str]:
    """Load Windows workbook help text keyed by policy setting title."""

    help_by_title: dict[str, str] = {}
    for row in read_json(WINDOWS_WORKBOOK_PATH):
        title = row.get("Policy Setting Name")
        help_text = row.get("Help Text")
        if isinstance(title, str) and isinstance(help_text, str) and help_text.strip():
            help_by_title.setdefault(title, help_text)
    return help_by_title


def build_field_index() -> dict[str, list[dict[str, Any]]]:
    """Build a simple searchable Relution field index from template metadata."""

    bundle = read_json(TEMPLATE_BUNDLE_PATH)
    indexed: dict[str, list[dict[str, Any]]] = {
        "ANDROID": [],
        "MACOS": [],
        "WINDOWS": [],
    }
    for config in bundle["configurationTypes"]:
        target_type = str(config["type"])
        platforms = set(config.get("platforms", []))
        logical_platforms = []
        if "ANDROID_ENTERPRISE" in platforms or target_type.startswith(
            "ANDROID_ENTERPRISE"
        ):
            logical_platforms.append("ANDROID")
        if "MACOS" in platforms or target_type.startswith(("MACOS", "APPLE_")):
            logical_platforms.append("MACOS")
        if "WINDOWS" in platforms or target_type.startswith("WINDOWS"):
            logical_platforms.append("WINDOWS")
        for field in config.get("fields", []):
            path = str(field.get("path", ""))
            if path in {"uuid", "type"} or not path:
                continue
            label = str(field.get("label", path))
            entry = {
                "kind": "relution-native",
                "target": target_type,
                "fieldPaths": [path],
                "tokens": tokenize(f"{target_type} {path} {label}"),
            }
            for platform in logical_platforms:
                indexed[platform].append(entry)
    return indexed


def mapping_candidates(
    platform: str,
    title: str,
    section: str,
    field_index: dict[str, list[dict[str, Any]]],
    exact_mapping: Any,
) -> list[dict[str, Any]]:
    """Return scored field candidates plus exact mapping fields when present."""

    query_tokens = tokenize(f"{section} {title}")
    scored = []
    for field in field_index.get(platform, []):
        score = len(query_tokens & field["tokens"])
        if score > 0:
            scored.append((score, field["target"], field["fieldPaths"][0], field))
    scored.sort(key=lambda entry: (-entry[0], entry[1], entry[2]))
    candidates = [
        {
            "kind": "relution-native",
            "target": field["target"],
            "fieldPaths": field["fieldPaths"],
        }
        for _, _, _, field in scored[:5]
    ]
    if isinstance(exact_mapping, tuple):
        target, values = exact_mapping
        for path in flatten_value_paths(values):
            exact_candidate = {
                "kind": "relution-native",
                "target": target,
                "fieldPaths": [path],
            }
            candidates = [
                exact_candidate,
                *[
                    candidate
                    for candidate in candidates
                    if candidate != exact_candidate
                ],
            ]
    return candidates[:5]


def flatten_value_paths(value: Any, prefix: tuple[str, ...] = ()) -> list[str]:
    """Return dotted paths for each leaf in a mapping value tree."""

    if isinstance(value, dict):
        paths = []
        for key in sorted(value):
            paths.extend(flatten_value_paths(value[key], (*prefix, str(key))))
        return paths
    return [".".join(prefix)]


def build_baseline_summary(
    sources: list[dict[str, Any]], recommendations: list[dict[str, Any]]
) -> dict[str, Any]:
    """Build the vendor baseline summary artifact."""

    counts: dict[str, int] = {}
    for recommendation in recommendations:
        platform = str(recommendation["platform"])
        counts[platform] = counts.get(platform, 0) + 1
    return {
        "verifiedAsOf": VENDOR_VERIFIED_AS_OF,
        "sourceIndexPath": "example/vendor-references/sources.json",
        "downloadManifestPath": "example/vendor-references/downloads/manifest.json",
        "guidanceModel": {
            "windows": {
                "model": "named-security-baseline",
                "currentPrimarySourceId": "microsoft-windows-11-25h2-security-baseline",
                "currentPrimaryVersion": "Windows 11 version 25H2",
                "currentPrimaryPublishedDate": "2025-09-30",
                "toolkitSourceId": "microsoft-security-compliance-toolkit-guide",
                "baselineLagContext": {
                    "currentWindowsReleaseSourceId": "microsoft-windows-11-release-information",
                    "currentWindowsRelease": "Windows 11 26H1",
                    "currentWindowsReleaseAvailableDate": "2026-02-10",
                    "note": (
                        "As verified on 2026-04-23, Microsoft's current Windows release "
                        "tracking page lists 26H1 as available, but the latest named "
                        "Windows client security baseline I verified remains the 25H2 "
                        "baseline package."
                    ),
                },
            },
            "android": {
                "model": "equivalent-vendor-guidance-stack",
                "currentPrimarySourceId": "google-android-enterprise-feature-list",
                "currentPrimaryVersion": "Android Enterprise feature list",
                "currentPrimaryPublishedDate": "2026-04-21",
                "supportingSourceIds": [
                    "google-android-management-security-posture",
                    "google-android-enterprise-system-updates",
                    "google-play-protect-managed-devices",
                    "google-android-enterprise-feature-drop-2025",
                    "google-android-security-best-practices",
                ],
                "note": (
                    "Google does not publish a single Microsoft-style Android enterprise baseline "
                    "package. This catalog uses an equivalent stack of official Android Enterprise "
                    "guidance."
                ),
            },
            "macos": {
                "model": "equivalent-vendor-guidance-stack",
                "currentPrimarySourceId": "apple-platform-deployment",
                "currentPrimaryVersion": "Apple Platform Deployment February 2026",
                "currentPrimaryPublishedDate": "2026-02",
                "supportingSourceIds": [
                    "apple-platform-deployment-whats-new",
                    "apple-platform-security",
                    "apple-startup-security-macos",
                    "apple-managing-filevault-macos",
                    "apple-gatekeeper-runtime-protection-macos",
                ],
                "note": (
                    "Apple does not publish a single Microsoft-style macOS security baseline "
                    "package. This catalog uses an equivalent stack of Apple Platform Deployment "
                    "and Apple Platform Security guidance."
                ),
            },
        },
        "platforms": {
            "windows": {
                "relutionPlatforms": ["WINDOWS"],
                "recommendationCount": counts.get("WINDOWS", 0),
                "vendorGuidance": source_roles(sources, "windows"),
            },
            "android": {
                "relutionPlatforms": ["ANDROID_ENTERPRISE"],
                "recommendationCount": counts.get("ANDROID", 0),
                "vendorGuidance": source_roles(sources, "android"),
            },
            "macos": {
                "relutionPlatforms": ["MACOS"],
                "recommendationCount": counts.get("MACOS", 0),
                "vendorGuidance": source_roles(sources, "macos"),
            },
        },
        "recommendationCatalogPath": "example/vendor-references/vendor-recommendations.json",
        "importableRulesetPath": "example/vendor-references/vendor-relution-ruleset.json",
        "settingBundleCatalogPath": (
            "example/vendor-references/vendor-relution-settings-catalog.json"
        ),
    }


def source_roles(sources: list[dict[str, Any]], scope: str) -> list[dict[str, str]]:
    """Return source ids and roles that apply to one guidance scope."""

    roles = []
    for source in sources:
        if scope in source.get("scope", []):
            roles.append(
                {
                    "sourceId": str(source["id"]),
                    "role": str(source.get("type", "reference")),
                }
            )
    return roles


def update_readme(
    output_vendor_dir: Path,
    sources: list[dict[str, Any]],
    recommendations: list[dict[str, Any]],
) -> None:
    """Refresh vendor README counts and harvester documentation bullets."""

    readme_path = output_vendor_dir / "README.md"
    source_readme_path = VENDOR_DIR / "README.md"
    if (
        not readme_path.exists()
        and output_vendor_dir != VENDOR_DIR
        and source_readme_path.exists()
    ):
        shutil.copy2(source_readme_path, readme_path)
    if not readme_path.exists():
        return
    counts: dict[str, int] = {}
    for recommendation in recommendations:
        platform = str(recommendation["platform"])
        counts[platform] = counts.get(platform, 0) + 1
    readme = readme_path.read_text(encoding="utf8")
    readme = re.sub(
        r"Sources harvested: `\d+`", f"Sources harvested: `{len(sources)}`", readme
    )
    readme = re.sub(
        r"Recommendations extracted: `\d+`",
        f"Recommendations extracted: `{len(recommendations)}`",
        readme,
    )
    for platform in ("WINDOWS", "ANDROID", "MACOS"):
        readme = re.sub(
            rf"`{platform}`: `\d+`",
            f"`{platform}`: `{counts.get(platform, 0)}`",
            readme,
        )
    if "tools/harvest_vendor_guidance.py" not in readme:
        readme = readme.replace(
            "This folder contains the current vendor-specific OS guidance corpus",
            "This folder contains the current vendor-specific OS guidance corpus",
        )
        readme = readme.replace(
            (
                "- `vendor-recommendations.json`: normalized recommendation catalog with reason "
                "text and Relution mapping metadata for every harvested recommendation."
            ),
            (
                "- `vendor-recommendations.json`: normalized recommendation catalog with reason "
                "text and Relution mapping metadata for every harvested recommendation.\n"
                "- `tools/harvest_vendor_guidance.py`: repo-local stdlib harvester that can "
                "regenerate vendor source artifacts offline from saved downloads and derived "
                "baseline rows."
            ),
        )
    readme_path.write_text(readme, encoding="utf8")


def tokenize(value: str) -> set[str]:
    """Tokenize vendor and Relution field text for simple matching."""

    spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", value)
    return {
        token for token in re.split(r"[^a-z0-9]+", spaced.lower()) if len(token) > 2
    }


def compact_slug(value: str) -> str:
    """Build a compact alphanumeric id suffix from a title."""

    return re.sub(r"[^a-z0-9]+", "", value.lower())[:48]


def normalize_text(value: str) -> str:
    """Collapse whitespace in vendor source text."""

    return " ".join(value.split())


def relative_output_path(path: Path, output_vendor_dir: Path) -> str:
    """Return a path relative to the generated example root."""

    return path.relative_to(output_vendor_dir.parents[1]).as_posix()


def read_json(path: Path) -> Any:
    """Read a UTF-8 JSON artifact from disk."""

    return json.loads(path.read_text(encoding="utf8"))


def write_json(path: Path, payload: Any) -> None:
    """Write a deterministic UTF-8 JSON artifact."""

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf8"
    )
