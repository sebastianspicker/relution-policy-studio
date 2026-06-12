"""Smoke tests for the CIS benchmark generator command."""

from pathlib import Path
from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
import runpy
import sys

from python_tool_helpers import expect, import_tool

REPO_ROOT = Path(__file__).resolve().parents[1]

CIS_BENCHMARKS = import_tool("harvest_cis_benchmarks").BENCHMARKS


def extraction_boundary_error_text(exc: FileNotFoundError | SystemExit) -> str:
    """Return the boundary failure text emitted by the generator smoke run."""

    return str(exc)


def test_cis_generator_command_reaches_pdf_extraction_boundary() -> None:
    """Verify the generator imports and reaches the expected PDF boundary."""

    stdout = StringIO()
    stderr = StringIO()
    boundary_error = ""
    previous_argv = sys.argv[:]
    try:
        sys.argv = ["tools/harvest_cis_benchmarks.py"]
        with redirect_stdout(stdout), redirect_stderr(stderr):
            try:
                runpy.run_path(
                    str(REPO_ROOT / "tools/harvest_cis_benchmarks.py"),
                    run_name="__main__",
                )
            except (FileNotFoundError, SystemExit) as exc:
                boundary_error = extraction_boundary_error_text(exc)
            else:
                raise AssertionError(
                    "expected CIS generator to stop at local PDF extraction boundary"
                )
    finally:
        sys.argv = previous_argv

    combined_output = f"{stdout.getvalue()}\n{stderr.getvalue()}\n{boundary_error}"
    expect("ImportError" not in combined_output)
    expect("ModuleNotFoundError" not in combined_output)
    expect("NameError" not in combined_output)
    expect(
        CIS_BENCHMARKS[0].file_name in combined_output
        or "PyMuPDF is required" in combined_output
    )
