

def semantic_support_level(exact_target_ids: list[str], candidate_target_ids: list[str]) -> str:
    if exact_target_ids:
        return "exact"
    if candidate_target_ids:
        return "candidate"
    return "concept-only"


def source_recommendation_counts(recommendations: dict[str, dict[str, Any]]) -> dict[str, int]:
    counts = {source: 0 for source in ALL_SOURCES}
    for recommendation in recommendations.values():
        source = str(recommendation.get("_source", ""))
        if source in counts:
            counts[source] += 1
    return counts


def count_by(entries: list[dict[str, Any]], key: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for entry in entries:
        value = str(entry.get(key, ""))
        counts[value] = counts.get(value, 0) + 1
    return counts


def source_coverage_counts(groups: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for group in groups:
        marker = "+".join(str(source) for source in group.get("sources", []))
        counts[marker] = counts.get(marker, 0) + 1
    return counts


def difference_severity_rank(entry: dict[str, Any]) -> int:
    return {"error": 0, "warning": 1, "info": 2}.get(str(entry.get("severity", "")), 9)


def write_unified_analysis_report(payload: dict[str, Any]) -> None:
    summary = payload["summary"]
    lines = [
        "# Unified Recommendation Semantic Analysis",
        "",
        f"Generated: `{payload['generatedAt']}`",
        "",
        "## Summary",
        "",
        f"- Common semantic groups: `{summary['totalCommonGroups']}`",
        f"- Hard contradictions: `{summary['hardContradictions']}`",
        f"- Differences noted: `{summary['differences']}`",
        f"- BSI-authoritative differences: `{summary['bsiAuthoritativeDifferences']}`",
        f"- Source recommendation counts: `{stable_json(summary['sourceRecommendationCounts'])}`",
        "",
        "## BSI Precedence",
        "",
        "BSI is authoritative for interpretation. This report annotates conflicts and differences; it does not rewrite CIS or vendor mappings.",
        "",
        "## Common Groups",
        "",
    ]
    for group in payload["commonGroups"][:30]:
        label = group.get("label", {})
        label_text = label.get("en") if isinstance(label, dict) else ""
        lines.append(
            f"- `{group['platform']}` `{group['conceptId']}`"
            f"{f' - {label_text}' if label_text else ''}: sources `{', '.join(group['sources'])}`, "
            f"recommendations `{stable_json(group['sourceCounts'])}`, shared targets `{len(group['sharedRelutionTargetIds'])}`"
        )
    if not payload["commonGroups"]:
        lines.append("- None.")
    lines.extend(["", "## Hard Contradictions", ""])
    for contradiction in payload["contradictions"][:30]:
        lines.append(
            f"- `{contradiction['platform']}` `{contradiction['target']}` `{contradiction['fieldPath']}`: "
            f"sources `{', '.join(contradiction['sources'])}`. BSI wins; mappings are unchanged."
        )
    if not payload["contradictions"]:
        lines.append("- None detected by conservative exact-value comparison.")
    lines.extend(["", "## Differences", ""])
    for difference in payload["differences"][:40]:
        if difference["type"] == "mapping-support-difference":
            lines.append(
                f"- `{difference['platform']}` `{difference['conceptId']}` support differs: "
                f"`{stable_json(difference['supportBySource'])}`. BSI wins for interpretation."
            )
        elif difference["type"] == "source-coverage-gap":
            lines.append(
                f"- `{difference['platform']}` `{difference['conceptId']}` missing sources: "
                f"`{', '.join(difference['missingSources'])}`. BSI coverage is preserved."
            )
        else:
            lines.append(
                f"- `{difference['platform']}` `{difference.get('target', difference.get('conceptId', ''))}` "
                f"`{difference.get('fieldPath', '')}` differs across `{', '.join(difference['sources'])}`."
            )
    if not payload["differences"]:
        lines.append("- None.")
    UNIFIED_ANALYSIS_REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    UNIFIED_ANALYSIS_REPORT_PATH.write_text("\n".join(lines) + "\n", encoding="utf8")


def add_recommendation_target_link(
    targets: dict[str, dict[str, Any]],
    concepts: dict[str, dict[str, Any]],
    platform: str,
    spec: dict[str, Any],
    recommendation_id: str,
    concept_ids: list[str],
    *,
    link_kind: str,
) -> str:
    target_id = semantic_target_id(platform, str(spec["kind"]), str(spec["target"]), list(spec["fieldPaths"]))
    target = ensure_semantic_target(targets, platform, str(spec["kind"]), str(spec["target"]), list(spec["fieldPaths"]))
    recommendation_key = "exactRecommendationIds" if link_kind == "exact" else "candidateRecommendationIds"
    append_unique(target[recommendation_key], recommendation_id)
    for concept_id in concept_ids:
        if not concept_id:
            continue
        concept = concepts.setdefault(concept_id, empty_semantic_concept(concept_id))
        append_unique(target["conceptIds"], concept_id)
        append_unique(concept["relutionTargetIds"], target_id)
        append_unique(concept["recommendationIds"], recommendation_id)
        append_unique(concept[recommendation_key], recommendation_id)
    return target_id


def target_link_concept_ids(
    targets: dict[str, dict[str, Any]],
    platform: str,
    spec: dict[str, Any],
    raw_semantic_ids: list[str],
) -> list[str]:
    target = ensure_semantic_target(targets, platform, str(spec["kind"]), str(spec["target"]), list(spec["fieldPaths"]))
    target_concept_ids = [str(concept_id) for concept_id in target.get("conceptIds", []) if isinstance(concept_id, str)]
    explicit_concept_id = spec.get("semanticConceptId")
    if isinstance(explicit_concept_id, str) and explicit_concept_id:
        return [explicit_concept_id]
    mapped_concept_ids = semantic_concept_ids_for_target_spec(platform, spec)
    if mapped_concept_ids:
        overlap = [concept_id for concept_id in raw_semantic_ids if concept_id in mapped_concept_ids]
        return unique_preserving_order(overlap or mapped_concept_ids)
    overlap = [concept_id for concept_id in raw_semantic_ids if concept_id in target_concept_ids]
    if overlap:
        return unique_preserving_order(overlap)
    return unique_preserving_order(target_concept_ids)


def ensure_semantic_target(
    targets: dict[str, dict[str, Any]],
    platform: str,
    kind: str,
    target: str,
    field_paths: list[str],
) -> dict[str, Any]:
    target_id = semantic_target_id(platform, kind, target, field_paths)
    return targets.setdefault(
        target_id,
        {
            "id": target_id,
            "platform": platform,
            "kind": kind,
            "target": target,
            "fieldPaths": field_paths,
            "labels": [],
            "conceptIds": [],
            "exactRecommendationIds": [],
            "candidateRecommendationIds": [],
        },
    )


def ensure_semantic_concept(concepts: dict[str, dict[str, Any]], concept: dict[str, Any]) -> dict[str, Any]:
    concept_id = str(concept["id"])
    entry = concepts.setdefault(concept_id, empty_semantic_concept(concept_id))
    label = concept.get("label")
    if isinstance(label, dict):
        entry["label"] = dict(label)
    entry["matchedTerms"] = unique_preserving_order([*entry["matchedTerms"], *[str(term) for term in concept.get("matchedTerms", []) if isinstance(term, str)]])
    return entry


def empty_semantic_concept(concept_id: str) -> dict[str, Any]:
    return {
        "id": concept_id,
        "label": {},
        "matchedTerms": [],
        "relutionTargetIds": [],
        "recommendationIds": [],
        "exactRecommendationIds": [],
        "candidateRecommendationIds": [],
    }


def exact_target_specs(recommendation: dict[str, Any]) -> list[dict[str, Any]]:
    specs = []
    for mapping in exact_mappings(recommendation):
        target = mapping_target(mapping)
        if target is None:
            continue
        specs.append(
            {
                "kind": str(mapping["kind"]),
                "target": target,
                "fieldPaths": flatten_value_paths(mapping.get("values", {})),
                "values": mapping.get("values", {}),
                **({"match": mapping["match"]} if isinstance(mapping.get("match"), dict) else {}),
            }
        )
    return specs


def candidate_target_specs(recommendation: dict[str, Any]) -> list[dict[str, Any]]:
    exact_target_ids = {
        semantic_target_id(normalize_policy_platform(str(recommendation["platform"])), spec["kind"], spec["target"], spec["fieldPaths"])
        for spec in exact_target_specs(recommendation)
    }
    specs = []
    for candidate in recommendation.get("relutionMapping", {}).get("candidates", []):
        if not isinstance(candidate, dict) or not isinstance(candidate.get("target"), str) or not isinstance(candidate.get("kind"), str):
            continue
        spec = {
            "kind": str(candidate["kind"]),
            "target": str(candidate["target"]),
            "fieldPaths": [str(path) for path in candidate.get("fieldPaths", []) if isinstance(path, str)],
            **({"match": candidate["match"]} if isinstance(candidate.get("match"), dict) else {}),
            **({"semanticConceptId": candidate["semanticConceptId"]} if isinstance(candidate.get("semanticConceptId"), str) else {}),
        }
        if semantic_target_id(normalize_policy_platform(str(recommendation["platform"])), spec["kind"], spec["target"], spec["fieldPaths"]) in exact_target_ids:
            continue
        specs.append(spec)
    return specs


def semantic_target_id(platform: str, kind: str, target: str, field_paths: list[str]) -> str:
    path_part = "__".join(field_paths) if field_paths else "target"
    return slugify(f"{platform}-{kind}-{target}-{path_part}")


def append_unique(values: list[Any], value: Any) -> None:
    if value not in values:
        values.append(value)


def build_setting_catalog(config: SourceConfig, recommendations: list[dict[str, Any]], verified_as_of: str | None) -> dict[str, Any]:
    groups: dict[tuple[str, str, str | None], list[dict[str, Any]]] = {}
    non_importable: list[dict[str, Any]] = []

    for recommendation in recommendations:
        importable_mappings = importable_native_mappings(recommendation)
        if not importable_mappings:
            non_importable.append(
                {
                    "recommendationId": recommendation["id"],
                    "mappingStatus": recommendation.get("relutionMapping", {}).get("status", "none"),
                    "candidateTargets": unique_preserving_order(
                        candidate.get("target", "")
                        for candidate in recommendation.get("relutionMapping", {}).get("candidates", [])
                        if isinstance(candidate.get("target"), str) and candidate["target"]
                    ),
                    "notes": list(recommendation.get("relutionMapping", {}).get("notes", [])),
                }
            )
            continue

        for mapping in importable_mappings:
            source_platform = str(recommendation["platform"])
            policy_platform = normalize_policy_platform(source_platform)
            instance_id = multi_instance_id(mapping, recommendation["id"])
            groups.setdefault((policy_platform, mapping["type"], instance_id), []).append(
                {
                    "recommendationId": recommendation["id"],
                    "sourceIds": list(recommendation.get("sourceIds", [])),
                    "sourcePlatform": source_platform,
                    "policyPlatform": policy_platform,
                    "targetType": mapping["type"],
                    "values": mapping["values"],
                }
            )

    bundles: list[dict[str, Any]] = []
    variant_groups: list[dict[str, Any]] = []

    for group_key in sorted(groups, key=lambda item: (PLATFORM_ORDER.get(item[0], 99), item[0], item[1], item[2] or "")):
        policy_platform, target_type, instance_id = group_key
        group_entries = sorted(groups[group_key], key=lambda entry: entry["recommendationId"])
        group_result = build_bundle_group(config, policy_platform, target_type, instance_id, group_entries)
        bundles.extend(group_result["bundles"])
        if group_result["variantGroup"] is not None:
            variant_groups.append(group_result["variantGroup"])

    bundles.sort(
        key=lambda bundle: (
            PLATFORM_ORDER.get(bundle["policyPlatform"], 99),
            bundle["policyPlatform"],
            bundle["targetType"],
            bundle.get("variantId", ""),
        )
    )
    non_importable.sort(key=lambda entry: entry["recommendationId"])

    return {
        "catalog": {
            "version": 1,
            "name": f"{config.label} Relution Setting Bundles",
            "verifiedAsOf": verified_as_of,
            "sourceRecommendationCatalogPath": relative_path(config.recommendation_catalog_path),
            "importableRulesetPath": relative_path(config.ruleset_path),
            "bundles": bundles,
            "variantGroups": variant_groups,
            "nonImportableRecommendations": non_importable,
        }
    }


def importable_native_mappings(recommendation: dict[str, Any]) -> list[dict[str, Any]]:
    mappings = exact_mappings(recommendation)
    return [
        mapping
        for mapping in mappings
        if mapping.get("kind") == "relution-native"
        and isinstance(mapping.get("type"), str)
        and isinstance(mapping.get("values"), dict)
    ]


def multi_instance_id(mapping: dict[str, Any], recommendation_id: str) -> str | None:
    if mapping.get("type") not in MULTI_INSTANCE_TARGET_TYPES:
        return None
    values = mapping.get("values")
    if not isinstance(values, dict):
        return slugify(recommendation_id)
    name = str(values.get("name") or recommendation_id)
    install_sync_ml = str(values.get("installSyncML") or "")
    digest = hashlib.sha256(install_sync_ml.encode("utf8")).hexdigest()[:12]
    return slugify(f"{name}-{digest}")


def exact_mappings(recommendation: dict[str, Any]) -> list[dict[str, Any]]:
    relution_mapping = recommendation.get("relutionMapping", {})
    mappings = relution_mapping.get("rulesetMappings", [])
    if relution_mapping.get("status") != "exact" or not isinstance(mappings, list):
        return []
    exact: list[dict[str, Any]] = []
    for mapping in mappings:
        if not isinstance(mapping, dict) or not isinstance(mapping.get("kind"), str) or not isinstance(mapping.get("values"), dict):
            return []
        exact.append(mapping)
    return exact


def iter_exact_mapping_targets(recommendation: dict[str, Any]) -> list[str]:
    targets = []
    for mapping in exact_mappings(recommendation):
        target = mapping_target(mapping)
        if target is not None:
            targets.append(target)
    return targets


def iter_candidate_mapping_targets(recommendation: dict[str, Any]) -> list[str]:
    exact_targets = set(iter_exact_mapping_targets(recommendation))
    targets = []
    for candidate in recommendation.get("relutionMapping", {}).get("candidates", []):
        if isinstance(candidate, dict) and isinstance(candidate.get("target"), str) and candidate["target"] not in exact_targets:
            targets.append(candidate["target"])
    return targets


def mapping_target(mapping: dict[str, Any]) -> str | None:
    for key in ("type", "payloadType", "schemaId"):
        if isinstance(mapping.get(key), str):
            return mapping[key]
    return None


def build_bundle_group(
    config: SourceConfig,
    policy_platform: str,
    target_type: str,
    instance_id: str | None,
    group_entries: list[dict[str, Any]],
) -> dict[str, Any]:
    flattened_entries = [
        {
            **entry,
            "flattenedValues": flatten_values(entry["values"]),
        }
        for entry in group_entries
    ]
    conflicting_paths = find_conflicting_paths(flattened_entries)
    base_paths = merged_non_conflicting_paths(flattened_entries, conflicting_paths)

    if not conflicting_paths:
        bundle = make_bundle(
            config,
            policy_platform,
            target_type,
            instance_id,
            flattened_entries,
            base_paths,
            variant_id=None,
            merge_strategy="deep-merge",
        )
        return {"bundles": [bundle], "variantGroup": None}

    variant_entries = [
        entry
        for entry in flattened_entries
        if any(path in entry["flattenedValues"] for path in conflicting_paths)
    ]
    variants_by_signature: dict[tuple[tuple[str, str], ...], list[dict[str, Any]]] = {}
    for entry in variant_entries:
        signature = tuple(
            sorted(
                (
                    path_to_string(path),
                    stable_json(entry["flattenedValues"][path]),
                )
                for path in conflicting_paths
                if path in entry["flattenedValues"]
            )
        )
        variants_by_signature.setdefault(signature, []).append(entry)

    bundles: list[dict[str, Any]] = []
    variant_metadata: list[dict[str, Any]] = []
    for signature in sorted(variants_by_signature):
        variant_id = variant_id_from_signature(signature)
        bundle = make_bundle(
            config,
            policy_platform,
            target_type,
            instance_id,
            variants_by_signature[signature],
            base_paths,
            variant_id=variant_id,
            merge_strategy="deep-merge-with-explicit-variants",
        )
        bundles.append(bundle)
        variant_metadata.append(
            {
                "bundleId": bundle["bundleId"],
                "variantId": variant_id,
                "importFilePath": bundle["importFilePath"],
            }
        )

    variant_group = {
        "groupId": slugify(f"{config.source}-{policy_platform}-{target_type}{f'-{instance_id}' if instance_id else ''}-variants"),
        "policyPlatform": policy_platform,
        "targetType": target_type,
        "conflictingPaths": [path_to_string(path) for path in sorted(conflicting_paths)],
        "variants": variant_metadata,
    }
    return {"bundles": bundles, "variantGroup": variant_group}


def make_bundle(
    config: SourceConfig,
    policy_platform: str,
    target_type: str,
    instance_id: str | None,
    entries: list[dict[str, Any]],
    base_paths: dict[tuple[str, ...], Any],
    variant_id: str | None,
    merge_strategy: str,
) -> dict[str, Any]:
    merged_paths = dict(base_paths)
    for entry in entries:
        for path, value in sorted(entry["flattenedValues"].items()):
            merged_paths[path] = value
    details = {"type": target_type, **inflate_values(merged_paths)}
    file_name = f"{target_type}{f'--{instance_id}' if instance_id else ''}{f'--{variant_id}' if variant_id else ''}.json"
    import_file_path = config.root / "relution-settings" / policy_platform / file_name
    return {
        "bundleId": slugify(f"{config.source}-{policy_platform}-{target_type}{f'-{instance_id}' if instance_id else ''}{f'-{variant_id}' if variant_id else ''}"),
        "source": config.source,
        "sourcePlatform": unique_single_value(entry["sourcePlatform"] for entry in entries),
        "policyPlatform": policy_platform,
        "targetType": target_type,
        **({"variantId": variant_id} if variant_id else {}),
        "importFilePath": relative_path(import_file_path),
        "details": details,
        "derivedFromRecommendationIds": unique_preserving_order(entry["recommendationId"] for entry in entries),
        "sourceIds": unique_preserving_order(source_id for entry in entries for source_id in entry["sourceIds"]),
        "mergeStrategy": merge_strategy,
    }


def find_conflicting_paths(entries: list[dict[str, Any]]) -> set[tuple[str, ...]]:
    values_by_path: dict[tuple[str, ...], set[str]] = {}
    for entry in entries:
        for path, value in entry["flattenedValues"].items():
            values_by_path.setdefault(path, set()).add(stable_json(value))
    return {path for path, values in values_by_path.items() if len(values) > 1}


def merged_non_conflicting_paths(entries: list[dict[str, Any]], conflicting_paths: set[tuple[str, ...]]) -> dict[tuple[str, ...], Any]:
    merged: dict[tuple[str, ...], Any] = {}
    for entry in entries:
        for path, value in sorted(entry["flattenedValues"].items()):
            if path in conflicting_paths:
                continue
            merged[path] = value
    return merged


def flatten_values(value: Any, prefix: tuple[str, ...] = ()) -> dict[tuple[str, ...], Any]:
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


def inflate_values(flattened: dict[tuple[str, ...], Any]) -> dict[str, Any]:
    root: dict[str, Any] = {}
    for path in sorted(flattened):
        cursor = root
        for key in path[:-1]:
            cursor = cursor.setdefault(key, {})
        cursor[path[-1]] = flattened[path]
    return root


def build_ruleset(
    config: SourceConfig,
    recommendations: list[dict[str, Any]],
    settings_catalog: dict[str, Any],
    verified_as_of: str | None,
) -> dict[str, Any]:
    informative_entries_by_platform: dict[str, list[dict[str, Any]]] = {}
    for recommendation in recommendations:
        policy_platform = normalize_policy_platform(str(recommendation["platform"]))
        if config.source == "bsi" and recommendation.get("status") != "active":
            continue
        informative_entries_by_platform.setdefault(policy_platform, []).append(recommendation)

    bundles_by_platform: dict[str, list[dict[str, Any]]] = {}
    variant_groups_by_platform: dict[str, list[dict[str, Any]]] = {}
    variant_bundle_ids = {
        variant["bundleId"]
        for group in settings_catalog["variantGroups"]
        for variant in group["variants"]
    }
    for bundle in settings_catalog["bundles"]:
        if bundle["bundleId"] in variant_bundle_ids:
            continue
        bundles_by_platform.setdefault(bundle["policyPlatform"], []).append(bundle)
    for group in settings_catalog["variantGroups"]:
        variant_groups_by_platform.setdefault(group["policyPlatform"], []).append(group)

    non_native_aggregate_rules = build_non_native_aggregate_rules(config, recommendations)

    policies: list[dict[str, Any]] = []
    platforms = sorted(
        informative_entries_by_platform,
        key=lambda platform: (PLATFORM_ORDER.get(platform, 99), platform),
    )

    for platform in platforms:
        informational_rules = [
            build_informational_rule(config.source, recommendation)
            for recommendation in sorted(informative_entries_by_platform[platform], key=lambda entry: entry["id"])
        ]
        base_aggregate_rules = [
            build_aggregate_rule(bundle)
            for bundle in sorted(
                bundles_by_platform.get(platform, []),
                key=lambda bundle: (bundle["targetType"], bundle.get("variantId", "")),
            )
        ]
        extra_aggregate_rules = non_native_aggregate_rules.get(platform, [])
        variant_groups = sorted(
            variant_groups_by_platform.get(platform, []),
            key=lambda group: (group["targetType"], group["groupId"]),
        )
        if not variant_groups:
            policies.append(
                {
                    "platform": platform,
                    "name": policy_name(config.source, platform),
                    "description": policy_description(config.source, platform, None),
                    "rules": informational_rules + base_aggregate_rules + extra_aggregate_rules,
                }
            )
            continue

        variant_options = []
        for group in variant_groups:
            options = []
            for variant in sorted(group["variants"], key=lambda variant: variant["variantId"]):
                bundle = next(bundle for bundle in settings_catalog["bundles"] if bundle["bundleId"] == variant["bundleId"])
                options.append(bundle)
            variant_options.append(options)

        for combination in itertools.product(*variant_options):
            variant_ids = [bundle["variantId"] for bundle in combination if bundle.get("variantId")]
            policies.append(
                {
                    "platform": platform,
                    "name": policy_name(config.source, platform, variant_ids),
                    "description": policy_description(config.source, platform, variant_ids),
                    "rules": informational_rules + base_aggregate_rules + extra_aggregate_rules + [build_aggregate_rule(bundle) for bundle in combination],
                }
            )

    return {
        "version": 1,
        "name": f"{config.label} Relution Ruleset",
        "verifiedAsOf": verified_as_of,
        "sourceIndexPath": relative_path(config.root / "sources.json") if (config.root / "sources.json").exists() else None,
        "recommendationCatalogPath": relative_path(config.recommendation_catalog_path),
        "policies": policies,
    }


def build_non_native_aggregate_rules(
    config: SourceConfig,
    recommendations: list[dict[str, Any]],
) -> dict[str, list[dict[str, Any]]]:
    groups: dict[tuple[str, str, str], list[dict[str, Any]]] = {}
    for recommendation in recommendations:
        if config.source == "bsi" and recommendation.get("status") != "active":
            continue
        policy_platform = normalize_policy_platform(str(recommendation["platform"]))
        for mapping in exact_mappings(recommendation):
            if mapping.get("kind") == "relution-native":
                continue
            target = mapping_target(mapping)
            if target is None:
                continue
            groups.setdefault((policy_platform, str(mapping["kind"]), target), []).append(
                {
                    "mapping": mapping,
                    "recommendationId": recommendation["id"],
                    "sourceIds": list(recommendation.get("sourceIds", [])),
                    "flattenedValues": flatten_values(mapping["values"]),
                }
            )

    rules_by_platform: dict[str, list[dict[str, Any]]] = {}
    for (policy_platform, mapping_kind, target), entries in sorted(groups.items()):
        conflicts = find_conflicting_paths(entries)
        if not conflicts:
            rules_by_platform.setdefault(policy_platform, []).append(
                build_non_native_aggregate_rule(mapping_kind, target, entries, variant_id=None)
            )
            continue
        variant_entries = [
            entry
            for entry in entries
            if any(path in entry["flattenedValues"] for path in conflicts)
        ]
        variants_by_signature: dict[tuple[tuple[str, str], ...], list[dict[str, Any]]] = {}
        for entry in variant_entries:
            signature = tuple(
                sorted(
                    (
                        path_to_string(path),
                        stable_json(entry["flattenedValues"][path]),
                    )
                    for path in conflicts
                    if path in entry["flattenedValues"]
                )
            )
            variants_by_signature.setdefault(signature, []).append(entry)
        for signature in sorted(variants_by_signature):
            rules_by_platform.setdefault(policy_platform, []).append(
                build_non_native_aggregate_rule(
                    mapping_kind,
                    target,
                    variants_by_signature[signature],
                    variant_id=variant_id_from_signature(signature),
                )
            )
    return rules_by_platform


def build_non_native_aggregate_rule(
    mapping_kind: str,
    target: str,
    entries: list[dict[str, Any]],
    variant_id: str | None,
) -> dict[str, Any]:
    merged_paths: dict[tuple[str, ...], Any] = {}
    for entry in entries:
        for path, value in sorted(entry["flattenedValues"].items()):
            merged_paths[path] = value
    values = inflate_values(merged_paths)
    mapping: dict[str, Any] = {"kind": mapping_kind, "values": values}
    if mapping_kind == "apple-mobileconfig":
        mapping["payloadType"] = target
    elif mapping_kind == "apple-schema-profile":
        mapping["schemaId"] = target
    else:
        mapping["type"] = target
    return {
        "id": slugify(f"{mapping_kind}-{target}{f'-{variant_id}' if variant_id else ''}-aggregate"),
        "title": f"Relution aggregate: {target}{f' ({variant_id})' if variant_id else ''}",
        "informational": False,
        "reason": f"Aggregates exact {mapping_kind} mappings from {', '.join(unique_preserving_order(entry['recommendationId'] for entry in entries))}.",
        "sourceIds": unique_preserving_order(source_id for entry in entries for source_id in entry["sourceIds"]),
        "mappings": [mapping],
        **({"variantId": variant_id} if variant_id else {}),
    }
