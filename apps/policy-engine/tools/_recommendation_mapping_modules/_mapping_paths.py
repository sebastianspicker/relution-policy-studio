"""Data models and constants for recommendation-to-policy matching."""

from __future__ import annotations

from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
TEMPLATE_BUNDLE_PATH = REPO_ROOT / "data" / "relution-26.1.1" / "template-bundle.json"
APPLE_SCHEMA_CATALOG_PATH = (
    REPO_ROOT / "data" / "apple-device-management" / "catalog.json"
)
APPLE_MOBILECONFIG_EVIDENCE_PATH = (
    REPO_ROOT
    / "example"
    / "vendor-references"
    / "downloads"
    / "derived"
    / "apple-mobileconfig-evidence.json"
)
