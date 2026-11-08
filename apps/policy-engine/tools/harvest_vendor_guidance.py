#!/usr/bin/env python3
"""Compatibility launcher for vendor guidance harvesting."""

import importlib
import sys

sys.dont_write_bytecode = True
main = importlib.import_module("_harvest_vendor_guidance_modules.vendor_sources").main

if __name__ == "__main__":
    main()
