"""Command implementation for the offline institution-policy comparison."""

from __future__ import annotations

import argparse
from pathlib import Path

from .baseline import harvest_relution_baseline_index
from .comparison import compare_indexes
from .constants import (
    BASELINE_TEMPLATE_INDEX_PATH,
    DEFAULT_OUTPUT_ROOT,
)
from .harvest import harvest_institution_policy_index
from .reporting import write_outputs


def main() -> None:
    """Run the policy-vs-baseline comparison CLI."""

    parser = argparse.ArgumentParser(
        description="Compare institution managed-device policy docs with generated Relution baselines."
    )
    parser.add_argument(
        "--institution-root",
        type=Path,
        required=True,
        help="Root containing the institution policy Markdown corpus.",
    )
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT_ROOT)
    args = parser.parse_args()
    if not args.institution_root.is_dir():
        parser.error(
            "--institution-root must name an existing policy corpus; "
            "this repository intentionally does not ship institution policy documents."
        )
    institution_index = harvest_institution_policy_index(args.institution_root)
    baseline_index = harvest_relution_baseline_index(BASELINE_TEMPLATE_INDEX_PATH)
    comparison = compare_indexes(institution_index, baseline_index)
    write_outputs(args.output_root, institution_index, baseline_index, comparison)
