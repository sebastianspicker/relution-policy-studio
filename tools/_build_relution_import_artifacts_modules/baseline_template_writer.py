"""Write baseline template artifacts and indexes to disk."""

from __future__ import annotations

import shutil

from .artifact_pipeline import SOURCE_CONFIGS
from .artifact_io import read_json, write_json
from .baseline_templates import (
    BASELINE_TEMPLATE_CONSOLIDATED_ROOT,
    BASELINE_TEMPLATE_INDEX_PATH,
    BASELINE_TEMPLATE_MODULAR_ROOT,
    BASELINE_TEMPLATE_PLATFORMS,
    BASELINE_TEMPLATE_ROOT,
    BASELINE_TEMPLATE_TIERED_ROOT,
    BASELINE_TIERS,
    SOURCE_PRECEDENCE,
    consolidated_platform_template,
    generated_timestamp,
    index_entry,
    modular_bundle_template,
    modular_target_templates,
    platform_slug,
    source_platform_template,
)
from .tiered_baseline_templates import (
    tiered_consolidated_platform_template,
    tiered_modular_bundle_template,
    tiered_modular_target_templates,
)


def write_baseline_templates() -> None:
    """Regenerate all baseline template files and the template index."""

    if BASELINE_TEMPLATE_ROOT.exists():
        shutil.rmtree(BASELINE_TEMPLATE_ROOT)

    write_baseline_template_index(
        write_platform_baseline_templates(source_templates_by_platform())
    )


def source_templates_by_platform() -> dict[str, dict[str, dict]]:
    """Return source templates grouped by target platform and source."""

    templates_by_platform = {platform: {} for platform in BASELINE_TEMPLATE_PLATFORMS}
    for source in SOURCE_PRECEDENCE:
        config = SOURCE_CONFIGS[source]
        ruleset = read_json(config.ruleset_path)
        for platform in BASELINE_TEMPLATE_PLATFORMS:
            template = source_platform_template(config, ruleset, platform)
            templates_by_platform[platform][source] = template
    return templates_by_platform


def empty_template_index_entries() -> dict[str, list[dict]]:
    """Return an empty index payload for every baseline template family."""

    return {
        "consolidatedTemplates": [],
        "modularBundleTemplates": [],
        "modularTemplates": [],
        "tieredConsolidatedTemplates": [],
        "tieredModularBundleTemplates": [],
        "tieredModularTemplates": [],
    }


def write_platform_baseline_templates(
    source_templates: dict[str, dict[str, dict]],
) -> dict[str, list[dict]]:
    """Write consolidated, modular, and tiered templates for every platform."""

    entries = empty_template_index_entries()
    for platform in BASELINE_TEMPLATE_PLATFORMS:
        template = consolidated_platform_template(platform, source_templates[platform])
        path = (
            BASELINE_TEMPLATE_CONSOLIDATED_ROOT / f"{platform_slug(platform)}-full.json"
        )
        write_json(path, template)
        entries["consolidatedTemplates"].append(
            index_entry(path, template, platform=platform)
        )
        bundle_template = modular_bundle_template(platform, template)
        bundle_path = (
            BASELINE_TEMPLATE_MODULAR_ROOT / f"{platform_slug(platform)}-modules.json"
        )
        write_json(bundle_path, bundle_template)
        entries["modularBundleTemplates"].append(
            index_entry(bundle_path, bundle_template, platform=platform)
        )
        write_modular_platform_templates(platform, template, entries)
        for tier in BASELINE_TIERS:
            write_tiered_platform_templates(
                platform, tier, source_templates[platform], entries
            )
    return entries


def write_modular_platform_templates(
    platform: str, template: dict, entries: dict[str, list[dict]]
) -> None:
    """Write per-module baseline templates and append their index rows."""

    for module_template in modular_target_templates(platform, template):
        module_path = (
            BASELINE_TEMPLATE_MODULAR_ROOT
            / platform_slug(platform)
            / f"{module_template['baselineTemplate']['module']['slug']}.json"
        )
        write_json(module_path, module_template)
        entries["modularTemplates"].append(
            index_entry(module_path, module_template, platform=platform)
        )


def write_tiered_platform_templates(
    platform: str,
    tier: str,
    source_templates: dict[str, dict],
    entries: dict[str, list[dict]],
) -> None:
    """Write one platform/tier template family and append index rows."""

    tier_template = tiered_consolidated_platform_template(
        platform, source_templates, tier
    )
    tier_root = BASELINE_TEMPLATE_TIERED_ROOT / platform_slug(platform)
    tier_path = tier_root / f"tier-{tier}-full.json"
    write_json(tier_path, tier_template)
    entries["tieredConsolidatedTemplates"].append(
        index_entry(tier_path, tier_template, platform=platform)
    )
    tier_bundle_template = tiered_modular_bundle_template(platform, tier_template, tier)
    tier_bundle_path = tier_root / f"tier-{tier}-modules.json"
    write_json(tier_bundle_path, tier_bundle_template)
    entries["tieredModularBundleTemplates"].append(
        index_entry(tier_bundle_path, tier_bundle_template, platform=platform)
    )
    for tier_module_template in tiered_modular_target_templates(
        platform, tier_template, tier
    ):
        tier_module_path = (
            tier_root
            / f"tier-{tier}"
            / f"{tier_module_template['baselineTemplate']['module']['slug']}.json"
        )
        write_json(tier_module_path, tier_module_template)
        entries["tieredModularTemplates"].append(
            index_entry(tier_module_path, tier_module_template, platform=platform)
        )


def write_baseline_template_index(entries: dict[str, list[dict]]) -> None:
    """Write the baseline template index from generated template entries."""

    write_json(
        BASELINE_TEMPLATE_INDEX_PATH,
        {
            "version": 1,
            "name": "Relution Baseline Import Templates",
            "generatedAt": generated_timestamp(),
            "format": "relution-ruleset-json",
            "platforms": [
                platform_slug(platform) for platform in BASELINE_TEMPLATE_PLATFORMS
            ],
            **entries,
        },
    )
