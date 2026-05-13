#!/usr/bin/env python3
from pathlib import Path
import sys

sys.dont_write_bytecode = True
from _module_loader import load_tool_modules

_MODULE_DIR = Path(__file__).resolve().parent / "_harvest_bsi_grundschutz_modules"
_MODULES = [
    "source_parsers.py",
    "checklist_and_plusplus.py",
    "curated_mapping_rules.py",
    "recommendation_rulesets.py",
]

load_tool_modules(globals(), _MODULE_DIR, _MODULES)

del load_tool_modules, _MODULES, _MODULE_DIR

if __name__ == "__main__":
    main()
