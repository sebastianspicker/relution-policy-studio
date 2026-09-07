"""Execution workflow for guideline mapping updates."""

from __future__ import annotations

import os
import runpy
import sys
from pathlib import Path

from .contracts import (
    EXPECTED_UPDATE_ARTIFACT_PATHS,
    OFFLINE_SOURCE_COMMANDS,
    REPO_ROOT,
    assert_expected_outputs_written,
    build_command_args,
)


def rebuild_sources_offline(sources: list[str]) -> None:
    """Rebuild selected guideline sources from checked-in inputs."""

    for source in sources:
        script, *args = OFFLINE_SOURCE_COMMANDS[source]
        run_repo_python_tool(script, *args)


def refresh_sources(sources: list[str]) -> None:
    """Refresh selected sources that support online download in this wrapper."""

    unsupported = [source for source in sources if source in {"bsi", "cis"}]
    if unsupported:
        raise SystemExit(
            "Online refresh is currently implemented only for vendor guidance. "
            f"Update checked-in downloads for {', '.join(unsupported)} and rerun with --offline."
        )
    run_repo_python_tool(
        "tools/harvest_vendor_guidance.py", "--refresh", "--defer-artifacts"
    )


def run_build_relution_import_artifacts(sources: list[str]) -> None:
    """Run the import artifact builder with the selected source arguments."""

    run_repo_python_tool(
        "tools/build_relution_import_artifacts.py", *build_command_args(sources)
    )


def verify_expected_outputs() -> None:
    """Verify that the update workflow produced each required artifact."""

    assert_expected_outputs_written(EXPECTED_UPDATE_ARTIFACT_PATHS)


def run_repo_python_tool(script: str, *args: str) -> None:
    """Run a repository Python script with isolated argv and cwd state."""

    previous_argv = sys.argv[:]
    previous_cwd = Path.cwd()
    try:
        os.chdir(REPO_ROOT)
        sys.argv = [script, *args]
        runpy.run_path(str(REPO_ROOT / script), run_name="__main__")
    finally:
        sys.argv = previous_argv
        os.chdir(previous_cwd)
