"""Source-checkout resource locations shared by CampusWeave adapters."""

from pathlib import Path

SOURCE_ROOT = Path(__file__).resolve().parents[1]
RELUTION_ROOT = SOURCE_ROOT / "docs/relution"
REFERENCE_PROFILE = RELUTION_ROOT / "packages/university/desired-state.json"
CONCEPT_MANIFEST = RELUTION_ROOT / "registries/manifest.json"
TARGET_CONTEXT_TEMPLATE = RELUTION_ROOT / "templates/university-runtime-target.json"
GENERATED_CATALOG = RELUTION_ROOT / "generated/API_CATALOG.json"
TARGET_BINDINGS_TEMPLATE = RELUTION_ROOT / "templates/target-bindings.json"
CHANGE_PLAN_TEMPLATE = RELUTION_ROOT / "templates/settings-change-plan.json"
WEB_ROOT = SOURCE_ROOT / "web"
