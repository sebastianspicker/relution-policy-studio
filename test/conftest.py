from pathlib import Path
from shutil import rmtree


def pytest_sessionfinish() -> None:
    """Remove Python bytecode caches created by local pytest runs."""
    root = Path(__file__).resolve().parents[1]
    for path in (root / "test", root / "tools"):
        for cache_dir in path.rglob("__pycache__"):
            rmtree(cache_dir)
