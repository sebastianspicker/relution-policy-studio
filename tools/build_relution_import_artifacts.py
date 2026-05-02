#!/usr/bin/env python3
from pathlib import Path
import sys

sys.dont_write_bytecode = True
from _module_loader import load_tool_modules

_MODULE_DIR = Path(__file__).resolve().parent / "_build_relution_import_artifacts_modules"
_MODULES = [
    "artifact_pipeline.py",
    "ruleset_builder.py",
    "bsi_mandatory_ledger.py",
    "baseline_templates.py",
    "tiered_baseline_templates.py",
    "artifact_io.py",
    "mapping_review_artifacts.py",
    "relution_mapping_updates.py",
    "semantic_review_candidates.py",
]

load_tool_modules(globals(), _MODULE_DIR, _MODULES)

del load_tool_modules, _MODULES, _MODULE_DIR

if __name__ == "__main__":
    main()
