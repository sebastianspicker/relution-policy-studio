

def mapping_for(
    platform: str,
    requirement_id: str,
    requirement: dict[str, Any],
    field_index: dict[str, list[Any]],
    apple_mobileconfig_evidence: dict[str, dict[str, Any]],
    semantic_candidates: list[dict[str, Any]],
) -> dict[str, Any]:
    mapping = MAPPING_RULES.get((platform, requirement_id))
    inferred_candidates = []
    android_exact_mappings = []
    android_candidates = []
    apple_exact_mappings = []
    apple_mobileconfig_candidates = []
    if requirement.get("status") != "retired":
        extra_texts = (
            str(requirement.get("requirementText", "")),
            str(requirement.get("category", "")),
        )
        android_exact_mappings = android_relution_analog_mappings_for(
            platform,
            str(requirement.get("title", "")),
            None,
        )
        android_candidates = android_relution_candidates_for(
            platform,
            str(requirement.get("title", "")),
            extra_texts=extra_texts,
        )
        apple_exact_mappings = apple_schema_analog_mappings_for(
            platform,
            str(requirement.get("title", "")),
            None,
            extra_texts=extra_texts,
        )
        apple_mobileconfig_candidates = apple_mobileconfig_candidates_for(
            platform,
            str(requirement.get("title", "")),
            extra_texts=extra_texts,
            evidence_index=apple_mobileconfig_evidence,
        )
        inferred_candidates = mapping_candidates(
            platform,
            str(requirement.get("title", "")),
            str(requirement.get("category", "")),
            field_index,
            None,
            extra_texts=(str(requirement.get("requirementText", "")),),
            limit=5,
        )
    if mapping is None:
        if android_exact_mappings:
            return {
                "status": "exact",
                "mergeableInImportableRuleset": True,
                "candidates": merge_candidates([candidate_from_mapping(entry) for entry in android_exact_mappings], [*semantic_candidates, *android_candidates, *inferred_candidates]),
                "rulesetMappings": android_exact_mappings,
                "notes": ["Curated Android Enterprise analogs cover this enforceable BSI requirement through Relution native policy settings."],
            }
        if apple_exact_mappings:
            return {
                "status": "exact",
                "mergeableInImportableRuleset": True,
                "candidates": merge_candidates([candidate_from_mapping(entry) for entry in apple_exact_mappings], [*semantic_candidates, *apple_mobileconfig_candidates, *inferred_candidates]),
                "rulesetMappings": apple_exact_mappings,
                "notes": ["Curated Apple profile analogs cover this enforceable requirement through Relution APPLE_MOBILECONFIG-backed schema profiles."],
            }
        if android_candidates:
            return {
                "status": "partial",
                "mergeableInImportableRuleset": False,
                "candidates": merge_candidates(android_candidates, [*semantic_candidates, *inferred_candidates]),
                "rulesetMappings": [],
                "notes": ["Bilingual Android Enterprise setting matching found related Relution settings, but the BSI requirement is broader or lacks concrete enforceable values."],
            }
        if inferred_candidates:
            return {
                "status": "partial",
                "mergeableInImportableRuleset": False,
                "candidates": merge_candidates(inferred_candidates, [*semantic_candidates, *apple_mobileconfig_candidates, *android_candidates]),
                "rulesetMappings": [],
                "notes": ["Bilingual setting-name matching found related Relution/Apple settings, but the BSI requirement is broader or lacks a concrete enforceable value."],
            }
        if apple_mobileconfig_candidates:
            return {
                "status": "partial",
                "mergeableInImportableRuleset": False,
                "candidates": merge_candidates(apple_mobileconfig_candidates, semantic_candidates),
                "rulesetMappings": [],
                "notes": ["Relution can import a related Apple .mobileconfig payload, but the BSI requirement needs organization-specific values before it can be exact."],
            }
        if semantic_candidates:
            return {
                "status": "partial",
                "mergeableInImportableRuleset": False,
                "candidates": semantic_candidates,
                "rulesetMappings": [],
                "notes": ["BSI/GS++ concept matching found related Relution targets, but exact remediation requires concrete values and scoped policy decisions."],
            }
        return {
            "status": "none",
            "mergeableInImportableRuleset": False,
            "candidates": [],
            "rulesetMappings": [],
            "notes": [],
        }
    if mapping["status"] != "exact" and android_exact_mappings:
        return {
            "status": "exact",
            "mergeableInImportableRuleset": True,
            "candidates": merge_candidates([*mapping["candidates"], *[candidate_from_mapping(entry) for entry in android_exact_mappings]], [*semantic_candidates, *android_candidates, *inferred_candidates]),
            "rulesetMappings": android_exact_mappings,
            "notes": ["Curated Android Enterprise analogs cover this enforceable BSI requirement through Relution native policy settings."],
        }
    if mapping["status"] != "exact" and apple_exact_mappings:
        return {
            "status": "exact",
            "mergeableInImportableRuleset": True,
            "candidates": merge_candidates([*mapping["candidates"], *[candidate_from_mapping(entry) for entry in apple_exact_mappings]], [*semantic_candidates, *apple_mobileconfig_candidates, *inferred_candidates]),
            "rulesetMappings": apple_exact_mappings,
            "notes": ["Curated Apple profile analogs cover this enforceable requirement through Relution APPLE_MOBILECONFIG-backed schema profiles."],
        }
    notes = mapping["notes"]
    if mapping["status"] == "none" and semantic_candidates:
        notes = ["BSI/GS++ concept matching found related Relution targets, but exact remediation requires concrete values and scoped policy decisions."]
    return {
        "status": "partial" if mapping["status"] == "none" and semantic_candidates else mapping["status"],
        "mergeableInImportableRuleset": mapping["mergeableInImportableRuleset"],
        "candidates": merge_candidates(mapping["candidates"], [*semantic_candidates, *android_candidates, *apple_mobileconfig_candidates, *inferred_candidates]),
        "rulesetMappings": mapping["rulesetMappings"],
        "notes": notes,
        **extra_relution_mapping_metadata(mapping),
    }


def candidate_from_mapping(mapping: dict[str, Any]) -> dict[str, Any]:
    if mapping.get("kind") == "relution-native":
        target = str(mapping.get("type", ""))
    elif mapping.get("kind") == "apple-schema-profile":
        target = str(mapping.get("schemaId", ""))
    else:
        target = str(mapping.get("payloadType", ""))
    candidate: dict[str, Any] = {
        "kind": mapping.get("kind", ""),
        "target": target,
        "fieldPaths": flatten_value_paths(mapping.get("values", {})),
    }
    if isinstance(mapping.get("match"), dict):
        candidate["match"] = mapping["match"]
    return candidate


def merge_candidates(existing: list[dict[str, Any]], inferred: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    seen: dict[tuple[str, str], dict[str, Any]] = {}
    ordered_existing = sorted(existing, key=candidate_sort_key) if any("semanticConceptId" in candidate for candidate in existing) else existing
    for candidate in [*ordered_existing, *sorted(inferred, key=candidate_sort_key)]:
        key = (str(candidate.get("kind", "")), str(candidate.get("target", "")))
        if key in seen:
            merge_candidate_field_paths(seen[key], candidate)
            continue
        stored = dict(candidate)
        stored["fieldPaths"] = [
            str(path)
            for path in candidate.get("fieldPaths", [])
            if isinstance(path, str)
        ]
        seen[key] = stored
        merged.append(stored)
    return merged[:8]


def candidate_sort_key(candidate: dict[str, Any]) -> tuple[int, int, str, str]:
    match = candidate.get("match", {})
    compatibility = str(match.get("valueCompatibility", "")) if isinstance(match, dict) else ""
    score = int(match.get("score", 0)) if isinstance(match, dict) else 0
    concept_id = str(candidate.get("semanticConceptId", ""))
    if compatibility in {"curated-analog", "curated-android-analog"}:
        band = 0
    elif compatibility == "concept-candidate":
        band = 3 if concept_id in MANAGEMENT_SUPPORT_CONCEPT_IDS else 2
    else:
        band = 1
    return (band, -score, str(candidate.get("kind", "")), str(candidate.get("target", "")))


def merge_candidate_field_paths(existing: dict[str, Any], duplicate: dict[str, Any]) -> None:
    paths = [
        str(path)
        for path in existing.get("fieldPaths", [])
        if isinstance(path, str)
    ]
    seen = set(paths)
    for path in duplicate.get("fieldPaths", []):
        if not isinstance(path, str) or path in seen:
            continue
        seen.add(path)
        paths.append(path)
    existing["fieldPaths"] = paths


def build_ruleset(recommendations: list[dict[str, Any]]) -> dict[str, Any]:
    policies = []
    for platform in PLATFORM_TARGETS:
        platform_recommendations = [entry for entry in recommendations if entry["platform"] == platform.platform and entry["status"] == "active"]
        policies.append(
            {
                "platform": platform.platform,
                "name": platform.policy_name,
                "description": platform.policy_description,
                "rules": [
                    {
                        "id": entry["id"],
                        "title": f'{entry["requirementId"]} {entry["title"]}',
                        "informational": entry["relutionMapping"]["status"] != "exact",
                        "reason": entry["reason"],
                        "section": entry["category"],
                        "recommendedValue": entry["requirementText"],
                        "sourceIds": entry["sourceIds"],
                        "mappingStatus": entry["relutionMapping"]["status"],
                        "grundschutzKompendium": entry.get("grundschutzKompendium"),
                        "grundschutzPlusPlus": entry.get("grundschutzPlusPlus"),
                        "semanticConcepts": entry.get("semanticConcepts", []),
                        "semanticNoConceptReason": entry.get("semanticNoConceptReason"),
                        "mappings": entry["relutionMapping"]["rulesetMappings"],
                    }
                    for entry in platform_recommendations
                ],
            }
        )
    return {
        "version": 1,
        "name": "BSI Grundschutz OS Baseline",
        "verifiedAsOf": "2026-04-24",
        "sourceIndexPath": "example/bsi-references/sources.json",
        "recommendationCatalogPath": "example/bsi-references/bsi-recommendations.json",
        "policies": policies,
    }


def update_baseline_summary(
    recommendations: list[dict[str, Any]],
    plusplus_systematics: dict[str, Any],
    checklist_comparison: dict[str, Any],
) -> None:
    baseline = json.loads(BASELINE_PATH.read_text(encoding="utf8"))
    counts_by_platform: dict[str, int] = {}
    for recommendation in recommendations:
        counts_by_platform[recommendation["platform"]] = counts_by_platform.get(recommendation["platform"], 0) + 1
    baseline["recommendationCatalogPath"] = "example/bsi-references/bsi-recommendations.json"
    baseline["importableRulesetPath"] = "example/bsi-references/bsi-relution-ruleset.json"
    baseline["recommendationCounts"] = {
        "total": len(recommendations),
        "active": sum(1 for entry in recommendations if entry["status"] == "active"),
        "retired": sum(1 for entry in recommendations if entry["status"] == "retired"),
        "byPlatform": counts_by_platform,
    }
    baseline["downloadCount"] = len(json.loads((BSI_DIR / "downloads" / "manifest.json").read_text(encoding="utf8")))
    baseline["grundschutzKompendiumChecklists"] = {
        "comparisonPath": relative_repo_path(CHECKLIST_COMPARISON_PATH),
        "individualWorkbookCount": checklist_comparison["individualWorkbookCount"],
        "individualRequirementCount": checklist_comparison["individualRequirementCount"],
        "policyRelevantRequirementCount": checklist_comparison["policyRelevantRequirementCount"],
        "sourceDirectory": checklist_comparison["sourceDirectory"],
        "consolidatedThreatWorkbookPath": checklist_comparison["consolidatedThreatWorkbookPath"],
    }
    baseline["grundschutzPlusPlus"] = {
        "systematicsPath": relative_repo_path(GS_PLUSPLUS_SYSTEMATICS_PATH),
        "catalogTitle": plusplus_systematics["catalog"]["title"],
        "catalogVersion": plusplus_systematics["catalog"]["version"],
        "catalogLastModified": plusplus_systematics["catalog"]["lastModified"],
        "methodDocument": plusplus_systematics["methodology"]["documentTitle"],
        "methodVersion": plusplus_systematics["methodology"]["documentVersion"],
        "methodDate": plusplus_systematics["methodology"]["documentDate"],
        "status": plusplus_systematics["methodology"]["status"],
        "controlCount": plusplus_systematics["counts"]["controls"],
        "practiceGroupCount": plusplus_systematics["counts"]["practiceGroups"],
        "policyRelevantControlCount": len(plusplus_systematics["policyRelevantControlIds"]),
        "modalVerbDefinitions": plusplus_systematics["methodology"]["modalVerbDefinitions"],
        "policyEditorUse": plusplus_systematics["methodology"]["policyEditorUse"],
    }
    write_json(BASELINE_PATH, baseline)


def update_readme() -> None:
    readme = README_PATH.read_text(encoding="utf8")
    if "bsi-recommendations.json" in readme and "bsi-relution-ruleset.json" in readme:
        return
    insertion = """
- `bsi-recommendations.json`: per-platform BSI Grundschutz recommendation catalog derived from the saved DocBook XML and checklist workbook, including threat linkage, errata overlays, and Relution mapping metadata.
- `bsi-relution-ruleset.json`: importable Relution ruleset built from the active BSI requirements. Only exact Relution mappings are actionable; the rest stay informational with preserved metadata.
- `tools/harvest_bsi_grundschutz.py`: reproducible extractor for the local BSI XML/XLSX/text corpus.
""".strip()
    readme = readme.replace(
        "- `bsi-relution-baseline.json`: consolidated 2023 baseline plus 2025 errata/checklist layer, normalized for Relution-oriented consumption",
        "- `bsi-relution-baseline.json`: consolidated 2023 baseline plus 2025 errata/checklist layer, normalized for Relution-oriented consumption\n"
        + insertion,
    )
    README_PATH.write_text(readme, encoding="utf8")


def collect_direct_blocks(section: ET.Element) -> list[str]:
    blocks: list[str] = []
    for child in section:
        tag = local_name(child.tag)
        if tag == "title":
            continue
        if tag == "para":
            text = normalize_space("".join(child.itertext()))
            if text:
                blocks.append(text)
            continue
        if tag in {"itemizedlist", "orderedlist"}:
            for item in child.findall("db:listitem", DOCBOOK_NS):
                text = normalize_space("".join(item.itertext()))
                if text:
                    blocks.append(f"- {text}")
    return blocks


def first_part(control: dict[str, Any], name: str) -> dict[str, Any]:
    for part in control.get("parts", []):
        if isinstance(part, dict) and part.get("name") == name:
            return part
    return {}


def prop_value(props: Any, name: str) -> str | None:
    values = prop_values(props, name)
    return values[0] if values else None


def prop_values(props: Any, name: str) -> list[str]:
    if not isinstance(props, list):
        return []
    return [
        normalize_space(str(prop.get("value", "")))
        for prop in props
        if isinstance(prop, dict) and prop.get("name") == name and normalize_space(str(prop.get("value", "")))
    ]


def prop_remark(props: Any, name: str) -> str:
    if not isinstance(props, list):
        return ""
    for prop in props:
        if isinstance(prop, dict) and prop.get("name") == name:
            return normalize_space(str(prop.get("remarks", "")))
    return ""


def split_values(values: list[str]) -> list[str]:
    split = []
    for value in values:
        split.extend(normalize_space(part) for part in value.split(",") if normalize_space(part))
    return unique_preserving_order(split)


def count_values(values: Any) -> dict[str, int]:
    counts: dict[str, int] = {}
    for value in values:
        if value is None:
            continue
        key = str(value)
        counts[key] = counts.get(key, 0) + 1
    return dict(sorted(counts.items()))


def natural_control_sort_key(control_id: str) -> tuple[Any, ...]:
    parts: list[Any] = []
    for part in re.split(r"(\d+)", control_id):
        if part.isdigit():
            parts.append(int(part))
        elif part:
            parts.append(part)
    return tuple(parts)


def normalize_for_match(text: str) -> str:
    normalized = text.lower()
    normalized = normalized.replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
    normalized = re.sub(r"[^a-z0-9]+", " ", normalized)
    return normalize_space(normalized)


def token_set(text: str) -> set[str]:
    return {
        token
        for token in normalize_for_match(text).split()
        if len(token) >= 5 and token not in GS_PLUSPLUS_STOPWORDS
    }


def shorten(text: str, max_length: int) -> str:
    normalized = normalize_space(text)
    if len(normalized) <= max_length:
        return normalized
    return normalized[: max_length - 1].rstrip() + "…"


def relative_repo_path(path: Path) -> str:
    return path.resolve().relative_to(REPO_ROOT).as_posix()


def local_name(tag: str) -> str:
    return tag.split("}", 1)[1] if "}" in tag else tag


def normalize_space(text: str) -> str:
    return " ".join(text.split())


def slugify(value: str) -> str:
    slug = value.lower().replace(".", "-").replace("_", "-")
    slug = re.sub(r"[^a-z0-9-]+", "-", slug)
    slug = re.sub(r"-{2,}", "-", slug)
    return slug.strip("-")


def unique_preserving_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        ordered.append(value)
    return ordered


def write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf8")


if __name__ == "__main__":
    main()
