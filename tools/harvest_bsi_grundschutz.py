#!/usr/bin/env python3
"""Compatibility launcher and export facade for BSI Grundschutz harvesting."""

import sys

from _harvest_bsi_grundschutz_modules import main
from _harvest_bsi_grundschutz_modules.checklist_and_plusplus import parse_shared_strings
from _harvest_bsi_grundschutz_modules.source_parsers import (
    ERRATA_TEXT_PATH,
    GS_PLUSPLUS_CATALOG_PATH,
    GS_PLUSPLUS_METHOD_PATH,
    INDIVIDUAL_CHECKLISTS_DIR,
    XLSX_PATH,
    XML_PATH,
    parse_module_description,
    parse_module_threats,
)

sys.dont_write_bytecode = True

__all__ = [
    "ERRATA_TEXT_PATH",
    "GS_PLUSPLUS_CATALOG_PATH",
    "GS_PLUSPLUS_METHOD_PATH",
    "INDIVIDUAL_CHECKLISTS_DIR",
    "XLSX_PATH",
    "XML_PATH",
    "main",
    "parse_module_description",
    "parse_module_threats",
    "parse_shared_strings",
]

if __name__ == "__main__":
    main()
