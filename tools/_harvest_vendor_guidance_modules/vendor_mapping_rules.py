

def build_windows_recommendation(
    index: int,
    row: dict[str, Any],
    help_by_title: dict[str, str],
    field_index: dict[str, list[dict[str, Any]]],
    windows_rexp_evidence: dict[frozenset[str], list[dict[str, Any]]],
) -> dict[str, Any]:
    title = str(row["title"])
    section = str(row["section"])
    recommendation_id = f"windows-{index:04d}-{compact_slug(title)}"
    exact = WINDOWS_EXACT_BY_ID.get(recommendation_id)
    help_text = help_by_title.get(title)
    source_ids = ["microsoft-intune-windows-mdm-baseline-settings"]
    reason_source = "microsoft-intune-windows-mdm-baseline-settings"
    if help_text:
        source_ids.append("microsoft-windows-11-24h2-security-baseline-zip")
        reason = normalize_text(help_text)
        reason_source = "microsoft-windows-11-24h2-security-baseline-zip"
    else:
        reason = "Microsoft lists this as a default setting in the current Windows 11 version 25H2 Intune MDM baseline for managed Windows devices."
    semantic_evidence_sources = vendor_semantic_evidence_sources_for(
        recommendation_id,
        "WINDOWS",
        title,
        section,
        reason,
        row["recommendedValue"],
        extra_texts=(str(row.get("parentTitle") or ""),),
    )
    semantic_concepts = semantic_concepts_for("WINDOWS", semantic_evidence_sources)
    semantic_candidates = semantic_candidates_for("WINDOWS", semantic_concepts)

    inferred_exact = None
    rexp_exact = None
    if exact is None:
        rexp_exact = windows_custom_csp_mapping_for(
            title,
            row["recommendedValue"],
            windows_rexp_evidence,
            parent_title=str(row.get("parentTitle") or ""),
        )
    if exact is None and rexp_exact is None:
        inferred_exact = infer_exact_boolean_mapping(
            "WINDOWS",
            title,
            row["recommendedValue"],
            field_index,
            section=section,
            extra_texts=(reason,),
            allowed_kinds={"relution-native"},
        )
    mapping = None if exact is None else (exact["type"], exact["values"])
    if mapping is None and rexp_exact is not None and isinstance(rexp_exact.get("type"), str):
        mapping = (rexp_exact["type"], rexp_exact["values"])
    if mapping is None and inferred_exact is not None and isinstance(inferred_exact.get("type"), str):
        mapping = (inferred_exact["type"], inferred_exact["values"])
    matched_candidates = shared_mapping_candidates(
        "WINDOWS",
        title,
        section,
        field_index,
        mapping,
        recommended_value=row["recommendedValue"],
        extra_texts=(reason,),
        allowed_kinds={"relution-native"},
    )
    candidates = merge_candidate_lists(matched_candidates, semantic_candidates)
    ruleset_mappings = []
    if exact is not None:
        ruleset_mappings.append({"kind": "relution-native", "type": exact["type"], "values": exact["values"]})
    elif rexp_exact is not None:
        ruleset_mappings.append(rexp_exact)
    elif inferred_exact is not None:
        ruleset_mappings.append(inferred_exact)
    semantic_metadata = semantic_metadata_for(semantic_evidence_sources, semantic_concepts)
    return {
        "id": recommendation_id,
        "platform": "WINDOWS",
        "sourceIds": source_ids,
        "title": title,
        "section": section,
        "recommendedValue": row["recommendedValue"],
        "reason": reason,
        "reasonSource": reason_source,
        "vendor": {"baseline": WINDOWS_BASELINE_NAME, "parentTitle": row.get("parentTitle")},
        "relutionMapping": {
            "status": vendor_mapping_status(ruleset_mappings, matched_candidates, semantic_candidates),
            "mergeableInImportableRuleset": bool(ruleset_mappings),
            "candidates": candidates,
            "rulesetMappings": ruleset_mappings,
            "notes": [],
        },
        **semantic_metadata,
    }


def vendor_semantic_evidence_sources_for(
    recommendation_id: str,
    platform: str,
    title: str,
    section: str,
    reason: str,
    recommended_value: Any,
    *,
    extra_texts: tuple[str, ...] = (),
) -> list[dict[str, Any]]:
    sources = [
        ("vendor-title", title, 0.9),
        ("vendor-section", section, 0.78),
        ("vendor-reason", reason, 0.74),
        ("vendor-recommended-value", str(recommended_value), 0.62),
        ("vendor-platform", platform, 0.45),
        *[(f"vendor-context-{index}", text, 0.58) for index, text in enumerate(extra_texts, start=1)],
    ]
    return [
        {
            "source": source,
            "sourceId": recommendation_id,
            "text": text,
            "confidence": confidence,
        }
        for source, text, confidence in sources
        if normalize_text(text)
    ]


def semantic_metadata_for(evidence_sources: list[dict[str, Any]], semantic_concepts: list[dict[str, Any]]) -> dict[str, Any]:
    if semantic_concepts:
        return {"semanticConcepts": semantic_concepts}
    return {"semanticNoConceptReason": semantic_no_concept_reason(evidence_sources)}


def vendor_mapping_status(
    ruleset_mappings: list[dict[str, Any]],
    matched_candidates: list[dict[str, Any]],
    semantic_candidates: list[dict[str, Any]],
) -> str:
    if ruleset_mappings:
        return "exact"
    if matched_candidates:
        return "suggested"
    if semantic_candidates:
        return "partial"
    return "none"


def workbook_help_by_title() -> dict[str, str]:
    help_by_title: dict[str, str] = {}
    for row in read_json(WINDOWS_WORKBOOK_PATH):
        title = row.get("Policy Setting Name")
        help_text = row.get("Help Text")
        if isinstance(title, str) and isinstance(help_text, str) and help_text.strip():
            help_by_title.setdefault(title, help_text)
    return help_by_title


def build_field_index() -> dict[str, list[dict[str, Any]]]:
    bundle = read_json(TEMPLATE_BUNDLE_PATH)
    indexed: dict[str, list[dict[str, Any]]] = {"ANDROID": [], "MACOS": [], "WINDOWS": []}
    for config in bundle["configurationTypes"]:
        target_type = str(config["type"])
        platforms = set(config.get("platforms", []))
        logical_platforms = []
        if "ANDROID_ENTERPRISE" in platforms or target_type.startswith("ANDROID_ENTERPRISE"):
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
    query_tokens = tokenize(f"{section} {title}")
    scored = []
    for field in field_index.get(platform, []):
        score = len(query_tokens & field["tokens"])
        if score > 0:
            scored.append((score, field["target"], field["fieldPaths"][0], field))
    scored.sort(key=lambda entry: (-entry[0], entry[1], entry[2]))
    candidates = [
        {"kind": "relution-native", "target": field["target"], "fieldPaths": field["fieldPaths"]}
        for _, _, _, field in scored[:5]
    ]
    if isinstance(exact_mapping, tuple):
        target, values = exact_mapping
        for path in flatten_value_paths(values):
            exact_candidate = {"kind": "relution-native", "target": target, "fieldPaths": [path]}
            candidates = [exact_candidate, *[candidate for candidate in candidates if candidate != exact_candidate]]
    return candidates[:5]


def flatten_value_paths(value: Any, prefix: tuple[str, ...] = ()) -> list[str]:
    if isinstance(value, dict):
        paths = []
        for key in sorted(value):
            paths.extend(flatten_value_paths(value[key], (*prefix, str(key))))
        return paths
    return [".".join(prefix)]


def build_baseline_summary(sources: list[dict[str, Any]], recommendations: list[dict[str, Any]]) -> dict[str, Any]:
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
                    "note": "As verified on 2026-04-23, Microsoft's current Windows release tracking page lists 26H1 as available, but the latest named Windows client security baseline I verified remains the 25H2 baseline package.",
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
                "note": "Google does not publish a single Microsoft-style Android enterprise baseline package. This catalog uses an equivalent stack of official Android Enterprise guidance.",
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
                "note": "Apple does not publish a single Microsoft-style macOS security baseline package. This catalog uses an equivalent stack of Apple Platform Deployment and Apple Platform Security guidance.",
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
        "settingBundleCatalogPath": "example/vendor-references/vendor-relution-settings-catalog.json",
    }


def source_roles(sources: list[dict[str, Any]], scope: str) -> list[dict[str, str]]:
    roles = []
    for source in sources:
        if scope in source.get("scope", []):
            roles.append({"sourceId": str(source["id"]), "role": str(source.get("type", "reference"))})
    return roles


def update_readme(output_vendor_dir: Path, sources: list[dict[str, Any]], recommendations: list[dict[str, Any]]) -> None:
    readme_path = output_vendor_dir / "README.md"
    source_readme_path = VENDOR_DIR / "README.md"
    if not readme_path.exists() and output_vendor_dir != VENDOR_DIR and source_readme_path.exists():
        shutil.copy2(source_readme_path, readme_path)
    if not readme_path.exists():
        return
    counts: dict[str, int] = {}
    for recommendation in recommendations:
        platform = str(recommendation["platform"])
        counts[platform] = counts.get(platform, 0) + 1
    readme = readme_path.read_text(encoding="utf8")
    readme = re.sub(r"Sources harvested: `\d+`", f"Sources harvested: `{len(sources)}`", readme)
    readme = re.sub(r"Recommendations extracted: `\d+`", f"Recommendations extracted: `{len(recommendations)}`", readme)
    for platform in ("WINDOWS", "ANDROID", "MACOS"):
        readme = re.sub(rf"`{platform}`: `\d+`", f"`{platform}`: `{counts.get(platform, 0)}`", readme)
    if "tools/harvest_vendor_guidance.py" not in readme:
        readme = readme.replace(
            "This folder contains the current vendor-specific OS guidance corpus",
            "This folder contains the current vendor-specific OS guidance corpus",
        )
        readme = readme.replace(
            "- `vendor-recommendations.json`: normalized recommendation catalog with reason text and Relution mapping metadata for every harvested recommendation.",
            "- `vendor-recommendations.json`: normalized recommendation catalog with reason text and Relution mapping metadata for every harvested recommendation.\n"
            "- `tools/harvest_vendor_guidance.py`: repo-local stdlib harvester that can regenerate vendor source artifacts offline from saved downloads and derived baseline rows.",
        )
    readme_path.write_text(readme, encoding="utf8")


def tokenize(value: str) -> set[str]:
    spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", value)
    return {token for token in re.split(r"[^a-z0-9]+", spaced.lower()) if len(token) > 2}


def compact_slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())[:48]


def normalize_text(value: str) -> str:
    return " ".join(value.split())


def relative_output_path(path: Path, output_vendor_dir: Path) -> str:
    return path.relative_to(output_vendor_dir.parents[1]).as_posix()


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf8"))


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf8")


if __name__ == "__main__":
    main()
