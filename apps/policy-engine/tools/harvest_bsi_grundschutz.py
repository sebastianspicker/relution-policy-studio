#!/usr/bin/env python3
"""Launch the offline BSI Grundschutz harvest pipeline."""

import argparse
import sys

from _harvest_bsi_grundschutz_modules.bsi_harvest_pipeline import main

sys.dont_write_bytecode = True

if __name__ == "__main__":
    argparse.ArgumentParser(
        description="Build BSI outputs from checked-in Grundschutz source artifacts."
    ).parse_args()
    main()
