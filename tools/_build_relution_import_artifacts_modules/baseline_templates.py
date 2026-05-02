BASELINE_TEMPLATE_ROOT = REPO_ROOT / "example" / "relution-baseline-templates"
BASELINE_TEMPLATE_SOURCE_ROOT = BASELINE_TEMPLATE_ROOT / "sources"
BASELINE_TEMPLATE_CONSOLIDATED_ROOT = BASELINE_TEMPLATE_ROOT / "consolidated"
BASELINE_TEMPLATE_MODULAR_ROOT = BASELINE_TEMPLATE_ROOT / "modular"
BASELINE_TEMPLATE_TIERED_ROOT = BASELINE_TEMPLATE_ROOT / "tiered"
BASELINE_TEMPLATE_INDEX_PATH = BASELINE_TEMPLATE_ROOT / "index.json"
BASELINE_TEMPLATE_PLATFORMS = ("WINDOWS", "MACOS", "IOS", "ANDROID_ENTERPRISE")
SOURCE_PRECEDENCE = ("bsi", "cis", "vendor")
BASELINE_TIERS = (1, 2, 3)
MULTI_INSTANCE_CONSOLIDATED_TARGETS = {
    ("relution-native", "WINDOWS_CUSTOM_CSP"),
}
MACOS_IMPORT_CONFLICT_PREFERENCES = (
    {
        "preferred": ("apple-schema-profile", "profile:com.apple.mobiledevice.passwordpolicy"),
        "suppressed": ("relution-native", "IOS_PASSCODE"),
        "reason": "Relution imports the macOS password policy profile as the server-side passcode singleton.",
    },
    {
        "preferred": ("apple-schema-profile", "profile:com.apple.security.firewall"),
        "suppressed": ("relution-native", "MACOS_FIREWALL"),
        "reason": "Relution imports the macOS firewall profile as the server-side firewall singleton.",
    },
    {
        "preferred": ("relution-native", "MACOS_RESTRICTION"),
        "suppressed": ("apple-schema-profile", "profile:com.apple.applicationaccess"),
        "reason": "Relution treats macOS restrictions and the application access payload as conflicting server singletons; the BSI native restriction mapping has precedence.",
    },
    {
        "preferred": ("relution-native", "MACOS_SCREENSAVER"),
        "suppressed": ("apple-schema-profile", "profile:com.apple.screensaver"),
        "reason": "Relution imports the macOS screensaver profile as the server-side screensaver singleton; the BSI native screensaver mapping has precedence.",
    },
)
IOS_IMPORT_CONFLICT_PREFERENCES = (
    {
        "preferred": ("relution-native", "IOS_PASSCODE"),
        "suppressed": ("apple-schema-profile", "profile:com.apple.mobiledevice.passwordpolicy"),
        "reason": "Relution treats the iOS password policy profile and native passcode setting as conflicting server singletons; the BSI native passcode mapping has precedence.",
    },
    {
        "preferred": ("relution-native", "IOS_RESTRICTION"),
        "suppressed": ("apple-schema-profile", "profile:com.apple.applicationaccess"),
        "reason": "Relution treats the iOS application access payload and native restrictions as conflicting server singletons; the BSI native restriction mapping has precedence.",
    },
)
NON_IMPORTABLE_CONSOLIDATED_TARGETS = {
    ("IOS", "relution-native", "IOS_WIFI"): "IOS_WIFI requires organization-specific ssid, encryptionType, and proxyType values; disableAssociationMACRandomization is retained as informational guidance instead of an importable singleton.",
}


def write_baseline_templates() -> None:
    if BASELINE_TEMPLATE_ROOT.exists():
        shutil.rmtree(BASELINE_TEMPLATE_ROOT)

    source_templates_by_platform = {platform: {} for platform in BASELINE_TEMPLATE_PLATFORMS}
    for source in SOURCE_PRECEDENCE:
        config = SOURCE_CONFIGS[source]
        ruleset = read_json(config.ruleset_path)
        for platform in BASELINE_TEMPLATE_PLATFORMS:
            template = source_platform_template(config, ruleset, platform)
            source_templates_by_platform[platform][source] = template

    consolidated_entries = []
    modular_bundle_entries = []
    modular_entries = []
    tiered_consolidated_entries = []
    tiered_modular_bundle_entries = []
    tiered_modular_entries = []
    for platform in BASELINE_TEMPLATE_PLATFORMS:
        template = consolidated_platform_template(platform, source_templates_by_platform[platform])
        path = BASELINE_TEMPLATE_CONSOLIDATED_ROOT / f"{platform_slug(platform)}-full.json"
        write_json(path, template)
        consolidated_entries.append(index_entry(path, template, platform=platform))
        bundle_template = modular_bundle_template(platform, template)
        bundle_path = BASELINE_TEMPLATE_MODULAR_ROOT / f"{platform_slug(platform)}-modules.json"
        write_json(bundle_path, bundle_template)
        modular_bundle_entries.append(index_entry(bundle_path, bundle_template, platform=platform))
        for module_template in modular_target_templates(platform, template):
            module_path = (
                BASELINE_TEMPLATE_MODULAR_ROOT
                / platform_slug(platform)
                / f"{module_template['baselineTemplate']['module']['slug']}.json"
            )
            write_json(module_path, module_template)
            modular_entries.append(index_entry(module_path, module_template, platform=platform))
        for tier in BASELINE_TIERS:
            tier_template = tiered_consolidated_platform_template(platform, source_templates_by_platform[platform], tier)
            tier_root = BASELINE_TEMPLATE_TIERED_ROOT / platform_slug(platform)
            tier_path = tier_root / f"tier-{tier}-full.json"
            write_json(tier_path, tier_template)
            tiered_consolidated_entries.append(index_entry(tier_path, tier_template, platform=platform))
            tier_bundle_template = tiered_modular_bundle_template(platform, tier_template, tier)
            tier_bundle_path = tier_root / f"tier-{tier}-modules.json"
            write_json(tier_bundle_path, tier_bundle_template)
            tiered_modular_bundle_entries.append(index_entry(tier_bundle_path, tier_bundle_template, platform=platform))
            for tier_module_template in tiered_modular_target_templates(platform, tier_template, tier):
                tier_module_path = tier_root / f"tier-{tier}" / f"{tier_module_template['baselineTemplate']['module']['slug']}.json"
                write_json(tier_module_path, tier_module_template)
                tiered_modular_entries.append(index_entry(tier_module_path, tier_module_template, platform=platform))

    write_json(
        BASELINE_TEMPLATE_INDEX_PATH,
        {
            "version": 1,
            "name": "Relution Baseline Import Templates",
            "generatedAt": generated_timestamp(),
            "format": "relution-ruleset-json",
            "platforms": [platform_slug(platform) for platform in BASELINE_TEMPLATE_PLATFORMS],
            "consolidatedTemplates": consolidated_entries,
            "modularBundleTemplates": modular_bundle_entries,
            "modularTemplates": modular_entries,
            "tieredConsolidatedTemplates": tiered_consolidated_entries,
            "tieredModularBundleTemplates": tiered_modular_bundle_entries,
            "tieredModularTemplates": tiered_modular_entries,
        },
    )


def source_platform_template(config: SourceConfig, ruleset: dict[str, Any], platform: str) -> dict[str, Any]:
    policies = [dict(policy) for policy in ruleset.get("policies", []) if policy.get("platform") == platform]
    if not policies:
        policies = [
            {
                "platform": platform,
                "name": f"{platform_label(platform)} {config.label} Baseline",
                "description": f"No {config.label} recommendations are currently harvested for {platform_label(platform)}.",
                "rules": [],
            }
        ]
    return {
        "version": 1,
        "name": f"{platform_label(platform)} {config.label} Baseline Template",
        "verifiedAsOf": ruleset.get("verifiedAsOf"),
        "sourceIndexPath": ruleset.get("sourceIndexPath"),
        "recommendationCatalogPath": ruleset.get("recommendationCatalogPath"),
        "baselineTemplate": {
            "version": 1,
            "kind": "source-platform",
            "source": config.source,
            "platform": platform,
            "sourceRulesetPath": relative_path(config.ruleset_path),
            "generatedAt": generated_timestamp(),
        },
        "policies": policies,
    }


def consolidated_platform_template(platform: str, source_templates: dict[str, dict[str, Any]]) -> dict[str, Any]:
    informational_rules = []
    for source in SOURCE_PRECEDENCE:
        template = source_templates[source]
        for policy in template.get("policies", []):
            if policy.get("platform") != platform:
                continue
            for rule in policy.get("rules", []):
                if not isinstance(rule, dict):
                    continue
                if not is_actionable_rule(rule):
                    informational_rules.append(source_informational_rule(source, rule))

    actionable_entries = source_actionable_entries(platform, source_templates)
    consolidated = consolidate_actionable_entries(platform, actionable_entries)
    policies = [
        {
            "platform": platform,
            "name": f"{platform_label(platform)} Full Baseline",
            "description": "Generated from BSI, CIS, and vendor guidance. BSI exact mappings take precedence; lower-priority conflicts stay informational.",
            "rules": informational_rules + consolidated["rules"] + consolidated["suppressedRules"],
        }
    ]
    return {
        "version": 1,
        "name": f"{platform_label(platform)} Full Baseline Template",
        "verifiedAsOf": verified_as_of_by_source(source_templates),
        "baselineTemplate": {
            "version": 1,
            "kind": "consolidated-platform",
            "platform": platform,
            "generatedAt": generated_timestamp(),
        },
        "consolidation": {
            "platform": platform,
            "sources": list(SOURCE_PRECEDENCE),
            "precedence": list(SOURCE_PRECEDENCE),
            "sourceReferences": source_references(),
            "actionableRuleCounts": consolidated["actionableRuleCounts"],
            "informationalRuleCounts": informational_counts_by_source(informational_rules),
            "suppressedConflictRules": consolidated["suppressedConflictRules"],
        },
        "policies": policies,
    }


def modular_bundle_template(platform: str, full_template: dict[str, Any]) -> dict[str, Any]:
    module_policies = [module_policy(platform, key, rules) for key, rules in grouped_actionable_rules(full_template)]
    return {
        "version": 1,
        "name": f"{platform_label(platform)} Modular Baseline Template",
        "verifiedAsOf": full_template.get("verifiedAsOf"),
        "baselineTemplate": {
            "version": 1,
            "kind": "modular-platform",
            "platform": platform,
            "generatedAt": generated_timestamp(),
        },
        "consolidation": full_template.get("consolidation"),
        "policies": module_policies,
    }


def modular_target_templates(platform: str, full_template: dict[str, Any]) -> list[dict[str, Any]]:
    templates = []
    for key, rules in grouped_actionable_rules(full_template):
        module = module_metadata(key)
        policy = module_policy(platform, key, rules)
        templates.append(
            {
                "version": 1,
                "name": f"{policy['name']} Module Template",
                "verifiedAsOf": full_template.get("verifiedAsOf"),
                "baselineTemplate": {
                    "version": 1,
                    "kind": "modular-target",
                    "platform": platform,
                    "module": module,
                    "generatedAt": generated_timestamp(),
                },
                "consolidation": {
                    "platform": platform,
                    "sources": full_template.get("consolidation", {}).get("sources", []),
                    "precedence": full_template.get("consolidation", {}).get("precedence", []),
                    "sourceReferences": full_template.get("consolidation", {}).get("sourceReferences", {}),
                },
                "policies": [policy],
            }
        )
    return templates


def grouped_actionable_rules(template: dict[str, Any]) -> list[tuple[tuple[str, str], list[dict[str, Any]]]]:
    grouped: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for policy in template.get("policies", []):
        for rule in policy.get("rules", []):
            if not isinstance(rule, dict) or not is_actionable_rule(rule):
                continue
            mapping = first_rule_mapping(rule)
            if mapping is None:
                continue
            key = (str(mapping.get("kind")), mapping_target(mapping) or "")
            grouped.setdefault(key, []).append(rule)
    return sorted(grouped.items(), key=lambda item: item[0])


def module_policy(platform: str, key: tuple[str, str], rules: list[dict[str, Any]], tier: int | None = None) -> dict[str, Any]:
    module = module_metadata(key)
    tier_prefix = "" if tier is None else f"Tier {tier} "
    tier_sentence = "" if tier is None else f" {tier_label(tier)}."
    return {
        "platform": platform,
        "name": f"{platform_label(platform)} {tier_prefix}Baseline - {module['label']}",
        "description": f"Modular {platform_label(platform)} baseline block for {module['target']}.{tier_sentence} Generated from the consolidated non-conflicting baseline.",
        "rules": rules,
    }


def module_metadata(key: tuple[str, str]) -> dict[str, str]:
    kind, target = key
    return {
        "kind": kind,
        "target": target,
        "slug": slugify(f"{kind}-{target}"),
        "label": target_label(target),
    }


def first_rule_mapping(rule: dict[str, Any]) -> dict[str, Any] | None:
    mappings = rule.get("mappings")
    if not isinstance(mappings, list):
        return None
    for mapping in mappings:
        if isinstance(mapping, dict):
            return mapping
    return None


def consolidate_actionable_entries(platform: str, entries: list[dict[str, Any]]) -> dict[str, Any]:
    grouped: dict[tuple[str, str], list[dict[str, Any]]] = {}
    multi_instance_rules = []
    suppressed_rules = []
    suppressed_metadata = []
    actionable_counts = {source: 0 for source in SOURCE_PRECEDENCE}

    for entry in sorted(entries, key=actionable_entry_sort_key):
        key = (entry["mapping"]["kind"], mapping_target(entry["mapping"]) or "")
        if key in MULTI_INSTANCE_CONSOLIDATED_TARGETS:
            multi_instance_rules.append(consolidated_rule_from_entries(platform, key, [entry], entry["source"], entry["rule"]["id"]))
            actionable_counts[entry["source"]] += 1
            continue
        grouped.setdefault(key, []).append(entry)

    grouped, import_conflict_suppressed_rules, import_conflict_metadata = suppress_import_conflicting_entries(platform, grouped)
    suppressed_rules.extend(import_conflict_suppressed_rules)
    suppressed_metadata.extend(import_conflict_metadata)
    grouped, non_importable_suppressed_rules, non_importable_metadata = suppress_non_importable_entries(platform, grouped)
    suppressed_rules.extend(non_importable_suppressed_rules)
    suppressed_metadata.extend(non_importable_metadata)

    consolidated_rules = []
    for key, group_entries in sorted(grouped.items(), key=lambda item: item[0]):
        accepted = []
        merged_paths: dict[tuple[str, ...], Any] = {}
        for entry in sorted(group_entries, key=actionable_entry_sort_key):
            flattened = flatten_values(entry["mapping"].get("values", {}))
            conflicts = [
                path
                for path, value in flattened.items()
                if path in merged_paths and stable_json(merged_paths[path]) != stable_json(value)
            ]
            if conflicts:
                suppressed_rule = suppressed_conflict_rule(entry, key, conflicts)
                suppressed_rules.append(suppressed_rule)
                suppressed_metadata.append(suppressed_rule["conflict"])
                continue
            accepted.append(entry)
            for path, value in flattened.items():
                merged_paths[path] = value
        if accepted:
            consolidated_rules.append(consolidated_rule_from_entries(platform, key, accepted, None, None))
            for entry in accepted:
                actionable_counts[entry["source"]] += 1

    return {
        "rules": sorted(consolidated_rules + multi_instance_rules, key=lambda rule: rule["id"]),
        "suppressedRules": sorted(suppressed_rules, key=lambda rule: rule["id"]),
        "suppressedConflictRules": sorted(suppressed_metadata, key=lambda entry: entry["ruleId"]),
        "actionableRuleCounts": actionable_counts,
    }


def actionable_entries_for_rule(source: str, rule: dict[str, Any]) -> list[dict[str, Any]]:
    entries = []
    for mapping in rule.get("mappings", []):
        if not isinstance(mapping, dict) or mapping_target(mapping) is None:
            continue
        entries.append({"source": source, "rule": rule, "mapping": mapping})
    return entries


def suppress_import_conflicting_entries(
    platform: str,
    grouped: dict[tuple[str, str], list[dict[str, Any]]],
) -> tuple[dict[tuple[str, str], list[dict[str, Any]]], list[dict[str, Any]], list[dict[str, Any]]]:
    preferences = ()
    if platform == "MACOS":
        preferences = MACOS_IMPORT_CONFLICT_PREFERENCES
    elif platform == "IOS":
        preferences = IOS_IMPORT_CONFLICT_PREFERENCES
    if not preferences:
        return grouped, [], []

    suppressed_rules = []
    suppressed_metadata = []
    filtered = dict(grouped)
    for preference in preferences:
        preferred_key = preference["preferred"]
        suppressed_key = preference["suppressed"]
        if preferred_key not in filtered or suppressed_key not in filtered:
            continue
        for entry in filtered.pop(suppressed_key):
            suppressed_rule = suppressed_import_conflict_rule(entry, suppressed_key, preferred_key, preference["reason"])
            suppressed_rules.append(suppressed_rule)
            suppressed_metadata.append(suppressed_rule["conflict"])
    return filtered, suppressed_rules, suppressed_metadata


def suppress_non_importable_entries(
    platform: str,
    grouped: dict[tuple[str, str], list[dict[str, Any]]],
) -> tuple[dict[tuple[str, str], list[dict[str, Any]]], list[dict[str, Any]], list[dict[str, Any]]]:
    suppressed_rules = []
    suppressed_metadata = []
    filtered = dict(grouped)
    for key in list(filtered):
        reason = NON_IMPORTABLE_CONSOLIDATED_TARGETS.get((platform, key[0], key[1]))
        if reason is None:
            continue
        for entry in filtered.pop(key):
            suppressed_rule = suppressed_non_importable_rule(entry, key, reason)
            suppressed_rules.append(suppressed_rule)
            suppressed_metadata.append(suppressed_rule["conflict"])
    return filtered, suppressed_rules, suppressed_metadata


def consolidated_rule_from_entries(
    platform: str,
    key: tuple[str, str],
    entries: list[dict[str, Any]],
    forced_source: str | None,
    forced_rule_id: str | None,
) -> dict[str, Any]:
    mapping_kind, target = key
    flattened: dict[tuple[str, ...], Any] = {}
    for entry in entries:
        flattened.update(flatten_values(entry["mapping"].get("values", {})))
    mapping: dict[str, Any] = {"kind": mapping_kind, "values": inflate_values(flattened)}
    if mapping_kind == "relution-native":
        mapping["type"] = target
    elif mapping_kind == "apple-mobileconfig":
        mapping["payloadType"] = target
    elif mapping_kind == "apple-schema-profile":
        mapping["schemaId"] = target
    else:
        mapping["type"] = target
    source_part = forced_source or "merged"
    rule_part = forced_rule_id or target
    return {
        "id": slugify(f"consolidated-{platform}-{mapping_kind}-{source_part}-{rule_part}"),
        "title": f"Consolidated Relution aggregate: {target}",
        "informational": False,
        "reason": f"Consolidates exact mappings from {', '.join(unique_preserving_order(entry['source'] for entry in entries))}.",
        "sourceIds": unique_preserving_order(source_id for entry in entries for source_id in entry["rule"].get("sourceIds", [])),
        "sourceRules": [
            {"source": entry["source"], "ruleId": entry["rule"]["id"], "title": entry["rule"].get("title", "")}
            for entry in entries
        ],
        "mappings": [mapping],
    }


def suppressed_import_conflict_rule(
    entry: dict[str, Any],
    suppressed_key: tuple[str, str],
    preferred_key: tuple[str, str],
    reason: str,
) -> dict[str, Any]:
    source = entry["source"]
    rule = entry["rule"]
    conflict = {
        "source": source,
        "ruleId": rule["id"],
        "target": suppressed_key[1],
        "preferredTarget": preferred_key[1],
        "reason": reason,
    }
    return {
        **source_informational_rule(source, rule),
        "id": slugify(f"suppressed-import-conflict-{source}-{rule['id']}"),
        "title": f"Suppressed import conflict: {rule.get('title', rule['id'])}",
        "conflict": conflict,
    }


def suppressed_non_importable_rule(entry: dict[str, Any], key: tuple[str, str], reason: str) -> dict[str, Any]:
    source = entry["source"]
    rule = entry["rule"]
    conflict = {
        "source": source,
        "ruleId": rule["id"],
        "target": key[1],
        "reason": reason,
    }
    return {
        **source_informational_rule(source, rule),
        "id": slugify(f"suppressed-non-importable-{source}-{rule['id']}"),
        "title": f"Suppressed non-importable mapping: {rule.get('title', rule['id'])}",
        "conflict": conflict,
    }


def suppressed_conflict_rule(entry: dict[str, Any], key: tuple[str, str], conflicts: list[tuple[str, ...]]) -> dict[str, Any]:
    source = entry["source"]
    rule = entry["rule"]
    target = key[1]
    conflict = {
        "source": source,
        "ruleId": rule["id"],
        "target": target,
        "conflictingPaths": [path_to_string(path) for path in sorted(conflicts)],
        "reason": "Suppressed from consolidated import because a higher-precedence exact mapping already set a different value.",
    }
    return {
        **source_informational_rule(source, rule),
        "id": slugify(f"suppressed-{source}-{rule['id']}"),
        "title": f"Suppressed conflict: {rule.get('title', rule['id'])}",
        "conflict": conflict,
    }


def source_informational_rule(source: str, rule: dict[str, Any]) -> dict[str, Any]:
    copied = dict(rule)
    copied["id"] = f"{source}:{rule.get('id', '')}"
    copied["informational"] = True
    copied["mappings"] = []
    copied["source"] = source
    return copied


def is_actionable_rule(rule: dict[str, Any]) -> bool:
    return rule.get("informational") is not True and isinstance(rule.get("mappings"), list) and len(rule["mappings"]) > 0


def actionable_entry_sort_key(entry: dict[str, Any]) -> tuple[int, str, str]:
    return (SOURCE_PRECEDENCE.index(entry["source"]), entry["rule"].get("id", ""), stable_json(entry["mapping"].get("values", {})))


def informational_counts_by_source(rules: list[dict[str, Any]]) -> dict[str, int]:
    counts = {source: 0 for source in SOURCE_PRECEDENCE}
    for rule in rules:
        source = str(rule.get("source", ""))
        if source in counts:
            counts[source] += 1
    return counts


def verified_as_of_by_source(source_templates: dict[str, dict[str, Any]]) -> dict[str, Any]:
    return {source: template.get("verifiedAsOf") for source, template in source_templates.items()}


def source_references() -> dict[str, dict[str, str]]:
    return {
        source: {
            "baselinePath": relative_path(config.baseline_path),
            "recommendationCatalogPath": relative_path(config.recommendation_catalog_path),
            "rulesetPath": relative_path(config.ruleset_path),
        }
        for source, config in SOURCE_CONFIGS.items()
    }


def index_entry(path: Path, template: dict[str, Any], *, platform: str, source: str | None = None) -> dict[str, Any]:
    rules = [rule for policy in template.get("policies", []) for rule in policy.get("rules", [])]
    entry = {
        "path": relative_path(path),
        "platform": platform,
        "policyCount": len(template.get("policies", [])),
        "ruleCount": len(rules),
        "actionableRuleCount": len([rule for rule in rules if is_actionable_rule(rule)]),
        "informationalRuleCount": len([rule for rule in rules if not is_actionable_rule(rule)]),
    }
    if source is not None:
        entry["source"] = source
    baseline_template = template.get("baselineTemplate")
    if isinstance(baseline_template, dict) and isinstance(baseline_template.get("module"), dict):
        entry["module"] = baseline_template["module"]
    if isinstance(baseline_template, dict) and isinstance(baseline_template.get("tier"), int):
        entry["tier"] = baseline_template["tier"]
        entry["tierLabel"] = baseline_template.get("tierLabel")
        entry["securityLevel"] = baseline_template.get("securityLevel")
        entry["tierSourcePolicy"] = baseline_template.get("tierSourcePolicy")
        entry["tierCoverage"] = baseline_template.get("tierCoverage")
    if isinstance(template.get("consolidation"), dict):
        entry["suppressedConflictRuleCount"] = len(template["consolidation"].get("suppressedConflictRules", []))
    return entry


def platform_label(platform: str) -> str:
    return {
        "WINDOWS": "Windows",
        "MACOS": "macOS",
        "IOS": "iOS",
        "ANDROID_ENTERPRISE": "Android Enterprise",
    }[platform]


def platform_slug(platform: str) -> str:
    return platform.lower().replace("_", "-")


def target_label(target: str) -> str:
    if target.startswith("profile:"):
        return target.removeprefix("profile:").replace("com.apple.", "Apple ").replace(".", " ").title()
    if target.startswith("com.apple."):
        return target.replace("com.apple.", "Apple ").replace(".", " ").title()
    if target.startswith("IOS_"):
        return "iOS " + target.removeprefix("IOS_").replace("_", " ").title()
    if target.startswith("IPADOS_"):
        return "iPadOS " + target.removeprefix("IPADOS_").replace("_", " ").title()
    if target.startswith("MACOS_"):
        return "macOS " + target.removeprefix("MACOS_").replace("_", " ").title()
    return target.replace("_", " ").title()


def generated_timestamp() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
