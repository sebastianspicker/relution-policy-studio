"""PDF page normalization helpers for CIS benchmark parsing."""
from __future__ import annotations

from _harvest_cis_benchmarks_modules.cis_text_collections import normalize_space

def clean_page_lines(page: str) -> list[str]:
    """Remove PDF boilerplate lines while preserving section paragraph gaps."""
    cleaned: list[str] = []
    for raw_line in page.splitlines():
        line = normalize_space(raw_line)
        if not line:
            cleaned.append("")
            continue
        if line in {"Internal Only - General", "Internal Only"}:
            continue
        if line.startswith("Page "):
            continue
        cleaned.append(line)
    while cleaned and cleaned[0] == "":
        cleaned.pop(0)
    while cleaned and cleaned[-1] == "":
        cleaned.pop()
    return cleaned


def flatten_pages(pages: list[list[str]]) -> tuple[list[str], list[int]]:
    """Flatten page lines and record each page's starting line offset."""
    flattened: list[str] = []
    page_starts: list[int] = []
    for page in pages:
        page_starts.append(len(flattened))
        flattened.extend(page)
        flattened.append("")
    return flattened, page_starts
