from __future__ import annotations

import ast
import unittest
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parents[1]
PRODUCT = ROOT / "campusweave"
SCRIPTS = ROOT / "scripts"
EXPECTED_ADAPTERS = {
    "campusweave_runtime.py",
    "render_relution_openapi.py",
    "validate_machine_docs.py",
    "relution_curl.zsh",
}
ALLOWED_PACKAGE_EDGES = {
    "root": {"server"},
    "commands": {
        "commands",
        "contracts",
        "json_snapshot",
        "openapi",
        "planning",
        "private_artifacts",
        "profiles",
        "resources",
        "targets",
    },
    "contracts": {"json_snapshot", "openapi", "resources"},
    "json_snapshot": set(),
    "openapi": {"json_snapshot"},
    "planning": {"private_artifacts"},
    "private_artifacts": {"json_snapshot"},
    "profiles": {"json_snapshot", "resources"},
    "resources": set(),
    "server": {"json_snapshot", "private_artifacts", "resources", "workbench"},
    "targets": {"contracts", "openapi", "private_artifacts", "profiles"},
    "workbench": {"json_snapshot", "planning", "private_artifacts", "profiles", "resources"},
}


def python_files(root: Path) -> list[Path]:
    return sorted(path for path in root.rglob("*.py") if "__pycache__" not in path.parts)


def product_group(path: Path) -> str:
    relative = path.relative_to(PRODUCT)
    if len(relative.parts) > 1:
        return relative.parts[0]
    return "root" if path.name in {"__init__.py", "__main__.py"} else path.stem


def module_parts(path: Path) -> list[str]:
    relative = path.relative_to(ROOT).with_suffix("")
    parts = list(relative.parts)
    return parts[:-1] if parts[-1] == "__init__" else parts


def internal_imports(path: Path, tree: ast.AST) -> set[str]:
    """Return imported top-level CampusWeave packages for one product file."""
    imports: set[str] = set()
    package = module_parts(path)
    base = package if path.name == "__init__.py" else package[:-1]
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imports.update(_absolute_imports(alias.name for alias in node.names))
        elif isinstance(node, ast.ImportFrom):
            imports.update(_from_imports(node, base))
    return imports


def _absolute_imports(names: Iterable[str]) -> set[str]:
    return {
        name.split(".")[1]
        for name in names
        if isinstance(name, str) and name.startswith("campusweave.")
    }


def _from_imports(node: ast.ImportFrom, base: list[str]) -> set[str]:
    anchor = base[: len(base) - max(node.level - 1, 0)]
    if node.module:
        absolute = anchor + node.module.split(".") if node.level else node.module.split(".")
        return {absolute[1]} if len(absolute) > 1 and absolute[0] == "campusweave" else set()
    return {
        alias.name.split(".")[0]
        for alias in node.names
        if anchor == ["campusweave"] and not alias.name.startswith("_")
    }


def find_cycles(graph: dict[str, set[str]]) -> list[list[str]]:
    active: list[str] = []
    finished: set[str] = set()
    cycles: list[list[str]] = []

    def visit(node: str) -> None:
        if node in finished:
            return
        if node in active:
            cycles.append([*active[active.index(node) :], node])
            return
        active.append(node)
        for dependency in sorted(graph[node]):
            visit(dependency)
        active.pop()
        finished.add(node)

    for node in sorted(graph):
        visit(node)
    return cycles


class ArchitectureGuardTests(unittest.TestCase):
    def test_only_the_four_script_adapters_remain(self) -> None:
        self.assertEqual(
            {path.name for path in SCRIPTS.iterdir() if path.is_file()}, EXPECTED_ADAPTERS
        )
        self.assertEqual(
            {path.name for path in SCRIPTS.glob("*.py")}, EXPECTED_ADAPTERS - {"relution_curl.zsh"}
        )

    def test_script_adapters_import_only_package_commands(self) -> None:
        failures: list[str] = []
        for path in SCRIPTS.glob("*.py"):
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    failures.append(f"{path.name} uses import instead of a command adapter import")
                elif isinstance(node, ast.ImportFrom) and not (
                    node.module and node.module.startswith("campusweave.commands.")
                ):
                    failures.append(
                        f"{path.name} imports {node.module!r}, not campusweave.commands"
                    )
        self.assertEqual(failures, [])

    def test_product_boundaries_forbid_dynamic_imports_path_mutation_and_domain_clis(self) -> None:
        failures: list[str] = []
        for path in python_files(PRODUCT):
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
            in_commands = path.is_relative_to(PRODUCT / "commands")
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        if alias.name == "argparse" and not in_commands:
                            failures.append(
                                f"{path.relative_to(ROOT)} imports argparse outside commands"
                            )
                        if alias.name == "importlib" or alias.name.startswith("importlib."):
                            failures.append(f"{path.relative_to(ROOT)} imports importlib")
                        if alias.name == "scripts":
                            failures.append(f"{path.relative_to(ROOT)} imports scripts")
                elif isinstance(node, ast.ImportFrom):
                    if node.module and (
                        node.module == "importlib" or node.module.startswith("importlib.")
                    ):
                        failures.append(f"{path.relative_to(ROOT)} imports importlib")
                    if node.module and node.module.startswith("scripts"):
                        failures.append(f"{path.relative_to(ROOT)} imports scripts")
                elif isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name):
                    if node.value.id == "sys" and node.attr == "path":
                        failures.append(f"{path.relative_to(ROOT)} accesses sys.path")
        self.assertEqual(failures, [])

    def test_internal_package_graph_uses_allowed_acyclic_edges(self) -> None:
        graph = {group: set() for group in ALLOWED_PACKAGE_EDGES}
        failures: list[str] = []
        for path in python_files(PRODUCT):
            source = product_group(path)
            self.assertIn(source, graph, f"unowned package layer: {path.relative_to(ROOT)}")
            for target in internal_imports(path, ast.parse(path.read_text(encoding="utf-8"))):
                if target == source:
                    continue
                if target not in graph:
                    failures.append(f"{path.relative_to(ROOT)} imports unowned package {target}")
                    continue
                graph[source].add(target)
                if target not in ALLOWED_PACKAGE_EDGES[source]:
                    failures.append(f"{source} -> {target} is not an allowed dependency edge")
        self.assertEqual(failures, [])
        self.assertEqual(find_cycles(graph), [])

    def test_source_layout_is_owned_by_one_resource_module(self) -> None:
        offenders = []
        for path in python_files(PRODUCT):
            if path.name == "resources.py":
                continue
            if "Path(__file__).resolve().parents" in path.read_text(encoding="utf-8"):
                offenders.append(str(path.relative_to(ROOT)))
        self.assertEqual(offenders, [])


if __name__ == "__main__":
    unittest.main()
