

def build_informational_rule(source: str, recommendation: dict[str, Any]) -> dict[str, Any]:
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
    details = dict(bundle["details"])
    details.pop("type", None)
    variant_id = bundle.get("variantId")
    return {
        "id": f"{bundle['bundleId']}-aggregate",
        "title": f"Relution aggregate: {bundle['targetType']}{f' ({variant_id})' if variant_id else ''}",
        "informational": False,
        "reason": f"Aggregates exact Relution mappings from {', '.join(bundle['derivedFromRecommendationIds'])}.",
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


def policy_name(source: str, platform: str, variant_ids: list[str] | None = None) -> str:
    base_names = {
        "bsi": {
            "WINDOWS": "Windows BSI Grundschutz",
            "MACOS": "macOS BSI Grundschutz",
            "IOS": "iOS BSI Grundschutz",
            "ANDROID_ENTERPRISE": "Android BSI Grundschutz",
        },
        "cis": {
            "WINDOWS": "Windows CIS Benchmarks",
            "MACOS": "macOS CIS Benchmarks",
            "IOS": "iOS CIS Benchmarks",
            "ANDROID_ENTERPRISE": "Android CIS Benchmarks",
        },
        "vendor": {
            "WINDOWS": "Windows Vendor Guidance",
            "MACOS": "macOS Vendor Guidance",
            "IOS": "iOS Vendor Guidance",
            "ANDROID_ENTERPRISE": "Android Vendor Guidance",
        },
    }
    base = base_names[source][platform]
    if not variant_ids:
        return base
    return f"{base} ({', '.join(variant_ids)})"


def policy_description(source: str, platform: str, variant_ids: list[str] | None) -> str:
    if source == "bsi":
        description = "Generated from the active BSI requirement catalog with exact Relution aggregates and preserved informational metadata."
    elif source == "cis":
        description = "Generated from the harvested CIS benchmark catalog with exact Relution aggregates and preserved informational metadata."
    else:
        description = "Generated from the harvested vendor recommendation catalog with exact Relution aggregates and preserved informational metadata."
    if not variant_ids:
        return description
    return f"{description} Variant selection: {', '.join(variant_ids)}."


def informational_title(source: str, recommendation: dict[str, Any]) -> str:
    if source == "bsi":
        return f"{recommendation['requirementId']} {recommendation['title']}"
    if source == "cis":
        return f"{recommendation['recommendationId']} {recommendation['title']}"
    return recommendation["title"]


def informational_reason(source: str, recommendation: dict[str, Any]) -> str:
    if source == "bsi":
        return recommendation.get("reason") or recommendation.get("requirementText") or recommendation["title"]
    if source == "cis":
        return recommendation.get("rationale") or recommendation.get("description") or recommendation["title"]
    return recommendation.get("reason") or recommendation["title"]


def informational_value(source: str, recommendation: dict[str, Any]) -> Any:
    if source == "bsi":
        return recommendation.get("requirementText")
    return recommendation.get("recommendedValue")


def write_settings_files(config: SourceConfig, settings_catalog: dict[str, Any]) -> None:
    settings_root = config.root / "relution-settings"
    if settings_root.exists():
        shutil.rmtree(settings_root)
    for bundle in settings_catalog["bundles"]:
        path = resolve_relative(bundle["importFilePath"])
        path.parent.mkdir(parents=True, exist_ok=True)
        write_json(path, bundle["details"])


def update_baseline_summary(config: SourceConfig, baseline: dict[str, Any]) -> None:
    baseline["recommendationCatalogPath"] = relative_path(config.recommendation_catalog_path)
    baseline["importableRulesetPath"] = relative_path(config.ruleset_path)
    baseline["settingBundleCatalogPath"] = relative_path(config.settings_catalog_path)
    write_json(config.baseline_path, baseline)


def update_readme(config: SourceConfig) -> None:
    readme = config.readme_path.read_text(encoding="utf8")
    settings_line = settings_catalog_readme_line(config.source)
    bundle_dir_line = settings_directory_readme_line(config.source)
    if settings_line not in readme or bundle_dir_line not in readme:
        anchor = ruleset_readme_anchor(config.source)
        replacement = f"{anchor}\n{settings_line}\n{bundle_dir_line}"
        readme = readme.replace(anchor, replacement)
    config.readme_path.write_text(readme, encoding="utf8")


def settings_catalog_readme_line(source: str) -> str:
    if source == "bsi":
        return "- `bsi-relution-settings-catalog.json`: machine-readable catalog of exact Relution setting bundles, their provenance, and any explicit variant groups."
    if source == "cis":
        return "- `cis-relution-settings-catalog.json`: machine-readable catalog of exact Relution setting bundles, their provenance, and any explicit variant groups."
    return "- `vendor-relution-settings-catalog.json`: machine-readable catalog of exact Relution setting bundles, their provenance, and any explicit variant groups."


def settings_directory_readme_line(source: str) -> str:
    return "- `relution-settings/`: import-ready plain setting JSON bundles grouped by Relution platform and template type for the editor's `Apply JSON` flow."


def ruleset_readme_anchor(source: str) -> str:
    if source == "bsi":
        return "- `bsi-relution-ruleset.json`: importable Relution ruleset built from the active BSI requirements. Only exact Relution mappings are actionable; the rest stay informational with preserved metadata."
    if source == "cis":
        return "- `cis-relution-ruleset.json`: importable Relution ruleset that preserves every recommendation as informational metadata and adds only conflict-safe aggregate exact mappings."
    return "- `vendor-relution-ruleset.json`: importable ruleset JSON for this repo’s ruleset importer. Recommendation-level rules are retained as informational metadata, and merge-safe exact mappings are emitted as actionable aggregate rules."


def variant_id_from_signature(signature: tuple[tuple[str, str], ...]) -> str:
    parts = []
    for path, serialized_value in signature:
        value = json.loads(serialized_value)
        parts.append(f"{slugify(path.replace('.', '-'))}-{slugify(stringify_value(value))}")
    return slugify("-".join(parts))


def normalize_policy_platform(platform: str) -> str:
    return "ANDROID_ENTERPRISE" if platform == "ANDROID" else platform


def unique_single_value(values: Any) -> str:
    unique_values = unique_preserving_order(values)
    if len(unique_values) == 1:
        return unique_values[0]
    return "/".join(unique_values)


def semantic_concept_ids_for_target_spec(platform: str, spec: dict[str, Any]) -> list[str]:
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
    return [str(concept["id"]) for concept in concepts if isinstance(concept.get("id"), str)]


def semantic_target_spec_text(spec: dict[str, Any]) -> str:
    match = spec.get("match")
    matched_terms = []
    if isinstance(match, dict):
        matched_terms = [str(term) for term in match.get("matchedTerms", []) if isinstance(term, str)]
    field_paths = [str(path) for path in spec.get("fieldPaths", []) if isinstance(path, str)]
    values = [stringify_value(value) for value in flatten_values(spec.get("values", {})).values()]
    return " ".join(
        [
            " ".join(matched_terms),
            split_camel_text(str(spec.get("target", ""))),
            " ".join(split_camel_text(path) for path in field_paths),
            " ".join(split_camel_text(value) for value in values),
        ]
    )


def split_camel_text(value: str) -> str:
    return " ".join(split_identifier(value))


def unique_preserving_order(values: Any) -> list[Any]:
    seen = set()
    unique: list[Any] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        unique.append(value)
    return unique


def path_to_string(path: tuple[str, ...]) -> str:
    return ".".join(path)


def stringify_value(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if value is None:
        return "null"
    return str(value)


def stable_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def relative_path(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


def resolve_relative(path: str) -> Path:
    return REPO_ROOT / Path(path)


def slugify(value: str) -> str:
    slug = value.lower().replace("_", "-")
    slug = re.sub(r"[^a-z0-9-]+", "-", slug)
    slug = re.sub(r"-{2,}", "-", slug)
    return slug.strip("-")


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf8"))


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf8")


if __name__ == "__main__":
    main()
