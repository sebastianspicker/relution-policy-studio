"""Tier baseline metadata and coverage helpers."""

from typing import Any

from .baseline_template_support import generated_timestamp
from .mapping_exact_targets import mapping_target
from .baseline_template_modules import tier_label


def baseline_template_metadata(kind: str, platform: str, tier: int, coverage: str, extra: dict[str, Any] | None = None) -> dict[str, Any]:
    """Return shared metadata for a generated tiered template."""
    metadata = {"version": 1, "kind": kind, "platform": platform, "tier": tier, "tierLabel": tier_label(tier), "securityLevel": tier_security_level(tier), "tierSourcePolicy": "bsi-cis-vendor", "tierCoverage": coverage}
    if extra is not None:
        metadata.update(extra)
    metadata["generatedAt"] = generated_timestamp()
    return metadata


def actionable_entry_key(entry: dict[str, Any]) -> tuple[str, str]:
    """Return the mapping identity used to compare actionable entries."""
    return entry["mapping"]["kind"], mapping_target(entry["mapping"]) or ""


def tier_security_level(tier: int) -> str:
    """Return the semantic security level label for a baseline tier."""
    return {1: "grundschutz", 2: "standard-hardening", 3: "basis"}[tier]


def tier_coverage(tier: int, consolidated: dict[str, Any]) -> str:
    """Return whether a tier adds distinct CIS/vendor coverage."""
    if tier == 3:
        return "distinct"
    counts = consolidated.get("actionableRuleCounts", {})
    return "distinct" if any(counts.get(source, 0) > 0 for source in ("cis", "vendor")) else "inherited"


def module_tier_coverage(rules: list[dict[str, Any]]) -> str:
    """Return whether a module contains non-BSI tier coverage."""
    for rule in rules:
        for source_rule in rule.get("sourceRules", []):
            if source_rule.get("source") in {"cis", "vendor"}:
                return "distinct"
    return "inherited"
