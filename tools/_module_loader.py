from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import ModuleType
from typing import Any

sys.dont_write_bytecode = True


def load_tool_modules(target_globals: dict[str, Any], module_dir: Path, module_names: list[str]) -> None:
    """Load split script modules into one namespace.

    The artifact generators started as single-file scripts and were later split
    to stay under the repository line budget. They still share constants and
    helper functions intentionally, so this loader preserves script-style global
    visibility without turning the tools directory into an import package.
    """
    entry_file = target_globals.get("__file__")
    shared_globals = {
        key: value
        for key, value in target_globals.items()
        if not key.startswith("__")
    }
    loaded_modules: list[ModuleType] = []
    for index, module_name in enumerate(module_names):
        module_path = module_dir / module_name
        module = load_tool_module(module_dir.name, index, module_path, shared_globals, entry_file)
        loaded_modules.append(module)
        exported_globals = {
            key: value
            for key, value in module.__dict__.items()
            if not key.startswith("__") and key != "annotations"
        }
        shared_globals.update(exported_globals)
        for loaded_module in loaded_modules:
            loaded_module.__dict__.update(exported_globals)
        target_globals.update(exported_globals)


def load_tool_module(
    module_dir_name: str,
    index: int,
    module_path: Path,
    shared_globals: dict[str, Any],
    entry_file: object,
) -> ModuleType:
    module_name = f"_relution_tool_module_{module_dir_name}_{index}_{module_path.stem}"
    spec = importlib.util.spec_from_file_location(module_name, module_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load tool module: {module_path}")
    module = importlib.util.module_from_spec(spec)
    module.__dict__.update(shared_globals)
    if isinstance(entry_file, str):
        module.__dict__["__file__"] = entry_file
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module
