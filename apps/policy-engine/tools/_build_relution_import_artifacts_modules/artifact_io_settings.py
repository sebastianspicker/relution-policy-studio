"""Generated settings bundles and source documentation writers."""

import shutil
from pathlib import Path
from typing import Any

from .artifact_io_json import write_json
from .artifact_io_paths import relative_path, resolve_relative
from .artifact_io_rule_text import SOURCE_CONFIG
from .artifact_paths import SourceConfig


def write_settings_files(config: SourceConfig, settings_catalog: dict[str, Any]) -> None:
    """Write import-ready setting bundle JSON files under the source root."""
    settings_root = config.root / "relution-settings"
    bundle_paths = setting_bundle_paths(settings_catalog, settings_root)
    if settings_root.exists():
        shutil.rmtree(settings_root)
    for bundle, path in bundle_paths:
        path.parent.mkdir(parents=True, exist_ok=True)
        write_json(path, bundle["details"])


def setting_bundle_paths(settings_catalog: dict[str, Any], settings_root: Path) -> list[tuple[dict[str, Any], Path]]:
    """Validate every output path before replacing the generated settings tree."""
    return [(bundle, resolve_relative(bundle["importFilePath"], root=settings_root)) for bundle in settings_catalog["bundles"]]


def update_baseline_summary(config: SourceConfig, baseline: dict[str, Any]) -> None:
    """Add generated artifact references to a baseline summary and write it."""
    baseline["recommendationCatalogPath"] = relative_path(config.recommendation_catalog_path)
    baseline["importableRulesetPath"] = relative_path(config.ruleset_path)
    baseline["settingBundleCatalogPath"] = relative_path(config.settings_catalog_path)
    write_json(config.baseline_path, baseline)


def update_readme(config: SourceConfig) -> None:
    """Ensure the source README references generated ruleset and setting artifacts."""
    if not config.readme_path.exists():
        return
    readme = config.readme_path.read_text(encoding="utf8")
    settings_line = settings_catalog_readme_line(config.source)
    bundle_dir_line = settings_directory_readme_line()
    if settings_line not in readme or bundle_dir_line not in readme:
        anchor = ruleset_readme_anchor(config.source)
        readme = readme.replace(anchor, f"{anchor}\n{settings_line}\n{bundle_dir_line}")
    config.readme_path.write_text(readme, encoding="utf8")


def settings_catalog_readme_line(source: str) -> str:
    """Return the README bullet for a source settings catalog."""
    return SOURCE_CONFIG[source]["settingsCatalogReadmeLine"]


def settings_directory_readme_line() -> str:
    """Return the shared README bullet for import-ready setting bundles."""
    return "- `relution-settings/`: import-ready plain setting JSON bundles grouped by Relution platform and template type for the editor's `Apply JSON` flow."


def ruleset_readme_anchor(source: str) -> str:
    """Return the existing README ruleset bullet used as insertion anchor."""
    return SOURCE_CONFIG[source]["rulesetReadmeAnchor"]
