"""Modular baseline-template grouping and policy builders."""

from typing import Any

from _tooling_text_io import slugify
from .baseline_template_labels import platform_label, target_label
from .baseline_template_support import is_actionable_rule
from .mapping_exact_targets import mapping_target


def grouped_actionable_rules(
    template: dict[str, Any],
) -> list[tuple[tuple[str, str], list[dict[str, Any]]]]:
    """Group actionable rules by mapping kind and Relution target."""
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


def module_policy(
    platform: str,
    key: tuple[str, str],
    rules: list[dict[str, Any]],
    tier: int | None = None,
) -> dict[str, Any]:
    """Build a modular policy block for one target and optional baseline tier."""
    module = module_metadata(key)
    tier_prefix = "" if tier is None else f"Tier {tier} "
    tier_sentence = "" if tier is None else f" {tier_label(tier)}."
    description = (
        f"Modular {platform_label(platform)} baseline block for {module['target']}."
        f"{tier_sentence} Generated from the consolidated non-conflicting baseline."
    )
    return {
        "platform": platform,
        "name": f"{platform_label(platform)} {tier_prefix}Baseline - {module['label']}",
        "description": description,
        "rules": rules,
    }


def module_metadata(key: tuple[str, str]) -> dict[str, str]:
    """Describe a modular template target in stable slug and display forms."""
    kind, target = key
    return {
        "kind": kind,
        "target": target,
        "slug": slugify(f"{kind}-{target}"),
        "label": target_label(target),
    }


def first_rule_mapping(rule: dict[str, Any]) -> dict[str, Any] | None:
    """Return the first structured mapping attached to a generated ruleset rule."""
    mappings = rule.get("mappings")
    if not isinstance(mappings, list):
        return None
    for mapping in mappings:
        if isinstance(mapping, dict):
            return mapping
    return None


def tier_label(tier: int) -> str:
    """Return the generated-template label for a BSI baseline tier."""
    return {
        1: "Tier 1 - most restrictive Grundschutz baseline",
        2: "Tier 2 - strengthened BSI baseline",
        3: "Tier 3 - minimum secure BSI Basis baseline",
    }[tier]
