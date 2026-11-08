#!/usr/bin/env python3
"""Launch the offline CIS benchmark harvest pipeline."""

import argparse
import sys

from _harvest_cis_benchmarks_modules.cis_parser_core import main

sys.dont_write_bytecode = True

if __name__ == "__main__":
    argparse.ArgumentParser(
        description="Build CIS outputs from checked-in benchmark source artifacts."
    ).parse_args()
    main()
