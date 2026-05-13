def tiered_consolidated_platform_template(platform: str, source_templates: dict[str, dict[str, Any]], tier: int) -> dict[str, Any]:
    actionable_entries = tiered_actionable_entries(platform, source_templates, tier)
    consolidated = consolidate_actionable_entries(platform, actionable_entries)
    coverage = tier_coverage(tier, consolidated)
    policies = [
        {
            "platform": platform,
            "name": f"{platform_label(platform)} Tier {tier} Baseline",
            "description": f"{tier_label(tier)}. Generated from BSI, CIS, and vendor guidance with BSI precedence.",
            "rules": consolidated["rules"] + consolidated["suppressedRules"],
        }
    ]
    return {
        "version": 1,
        "name": f"{platform_label(platform)} Tier {tier} Baseline Template",
        "verifiedAsOf": verified_as_of_by_source(source_templates),
        "baselineTemplate": {
            "version": 1,
            "kind": "tiered-consolidated-platform",
            "platform": platform,
            "tier": tier,
            "tierLabel": tier_label(tier),
            "securityLevel": tier_security_level(tier),
            "tierSourcePolicy": "bsi-cis-vendor",
            "tierCoverage": coverage,
            "generatedAt": generated_timestamp(),
        },
        "consolidation": {
            "platform": platform,
            "sources": list(SOURCE_PRECEDENCE),
            "precedence": list(SOURCE_PRECEDENCE),
            "sourceReferences": source_references(),
            "actionableRuleCounts": consolidated["actionableRuleCounts"],
            "informationalRuleCounts": {source: 0 for source in SOURCE_PRECEDENCE},
            "suppressedConflictRules": consolidated["suppressedConflictRules"],
        },
        "policies": policies,
    }


def tiered_modular_bundle_template(platform: str, full_template: dict[str, Any], tier: int) -> dict[str, Any]:
    module_policies = [module_policy(platform, key, rules, tier=tier) for key, rules in grouped_actionable_rules(full_template)]
    return {
        "version": 1,
        "name": f"{platform_label(platform)} Tier {tier} Modular Baseline Template",
        "verifiedAsOf": full_template.get("verifiedAsOf"),
        "baselineTemplate": {
            "version": 1,
            "kind": "tiered-modular-platform",
            "platform": platform,
            "tier": tier,
            "tierLabel": tier_label(tier),
            "securityLevel": tier_security_level(tier),
            "tierSourcePolicy": "bsi-cis-vendor",
            "tierCoverage": full_template.get("baselineTemplate", {}).get("tierCoverage", "distinct"),
            "generatedAt": generated_timestamp(),
        },
        "consolidation": full_template.get("consolidation"),
        "policies": module_policies,
    }


def tiered_modular_target_templates(platform: str, full_template: dict[str, Any], tier: int) -> list[dict[str, Any]]:
    templates = []
    for key, rules in grouped_actionable_rules(full_template):
        module = module_metadata(key)
        policy = module_policy(platform, key, rules, tier=tier)
        templates.append(
            {
                "version": 1,
                "name": f"{policy['name']} Module Template",
                "verifiedAsOf": full_template.get("verifiedAsOf"),
                "baselineTemplate": {
                    "version": 1,
                    "kind": "tiered-modular-target",
                    "platform": platform,
                    "tier": tier,
                    "tierLabel": tier_label(tier),
                    "securityLevel": tier_security_level(tier),
                    "tierSourcePolicy": "bsi-cis-vendor",
                    "tierCoverage": module_tier_coverage(rules),
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


def source_actionable_entries(platform: str, source_templates: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    actionable_entries = []
    for source in SOURCE_PRECEDENCE:
        template = source_templates[source]
        for policy in template.get("policies", []):
            if policy.get("platform") != platform:
                continue
            for rule in policy.get("rules", []):
                if isinstance(rule, dict) and is_actionable_rule(rule):
                    actionable_entries.extend(actionable_entries_for_rule(source, rule))
    return actionable_entries


def tiered_actionable_entries(platform: str, source_templates: dict[str, dict[str, Any]], tier: int) -> list[dict[str, Any]]:
    entries = source_actionable_entries(platform, source_templates)
    bsi_keys = {actionable_entry_key(entry) for entry in entries if entry["source"] == "bsi"}
    selected = []
    for entry in entries:
        if entry["source"] == "bsi":
            selected.append(entry)
        elif tier == 1:
            selected.append(entry)
        elif tier == 2 and actionable_entry_key(entry) in bsi_keys:
            selected.append(entry)
    return selected


def actionable_entry_key(entry: dict[str, Any]) -> tuple[str, str]:
    return (entry["mapping"]["kind"], mapping_target(entry["mapping"]) or "")


def tier_label(tier: int) -> str:
    return {
        1: "Tier 1 - most restrictive Grundschutz baseline",
        2: "Tier 2 - strengthened BSI baseline",
        3: "Tier 3 - minimum secure BSI Basis baseline",
    }[tier]


def tier_security_level(tier: int) -> str:
    return {
        1: "grundschutz",
        2: "standard-hardening",
        3: "basis",
    }[tier]


def tier_coverage(tier: int, consolidated: dict[str, Any]) -> str:
    if tier == 3:
        return "distinct"
    counts = consolidated.get("actionableRuleCounts", {})
    if any(counts.get(source, 0) > 0 for source in ("cis", "vendor")):
        return "distinct"
    return "inherited"


def module_tier_coverage(rules: list[dict[str, Any]]) -> str:
    for rule in rules:
        for source_rule in rule.get("sourceRules", []):
            if source_rule.get("source") in {"cis", "vendor"}:
                return "distinct"
    return "inherited"
