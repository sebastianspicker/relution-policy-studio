from __future__ import annotations

import json
import re
import unittest
from pathlib import Path
from urllib.parse import unquote


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
MARKDOWN_LINK = re.compile(r"\[[^]]+\]\(([^)]+)\)")
SINGLE_WORD_EMPHASIS = re.compile(
    r"\*\*[A-Za-z0-9_.-]+\*\*|(?<!\*)\*[A-Za-z0-9_.-]+\*(?!\*)"
)
LOCAL_PARTS = {
    "__pycache__",
    "archive",
    "backups",
    "build",
    "dist",
    "evidence",
    "exports",
    "htmlcov",
    "local",
    "node_modules",
    "playwright-report",
    "private",
    "screenshots",
    "test-results",
}


def public_files(pattern: str):
    for path in sorted(REPOSITORY_ROOT.rglob(pattern)):
        relative = path.relative_to(REPOSITORY_ROOT)
        hidden_local_path = (
            bool(relative.parts)
            and relative.parts[0].startswith(".")
            and relative.parts[0] != ".github"
        )
        if (
            path.is_file()
            and not hidden_local_path
            and not path.name.endswith(".local.md")
            and not LOCAL_PARTS.intersection(relative.parts)
        ):
            yield path


class DocumentationTests(unittest.TestCase):
    def test_relative_markdown_links_resolve(self) -> None:
        failures: list[str] = []
        for document in public_files("*.md"):
            text = document.read_text(encoding="utf-8")
            for match in MARKDOWN_LINK.finditer(text):
                destination = match.group(1).strip()
                if destination.startswith(("http://", "https://", "mailto:", "#")):
                    continue
                destination = destination.split("#", 1)[0]
                if destination.startswith("<") and destination.endswith(">"):
                    destination = destination[1:-1]
                target = (document.parent / unquote(destination)).resolve()
                if not target.exists():
                    relative_document = document.relative_to(REPOSITORY_ROOT)
                    failures.append(f"{relative_document}: missing {destination}")
        self.assertEqual(failures, [], "\n".join(failures))

    def test_docs_do_not_put_relution_token_in_process_arguments(self) -> None:
        handbook = "\n".join(
            document.read_text(encoding="utf-8")
            for document in public_files("*.md")
        )
        helper = (REPOSITORY_ROOT / "scripts" / "relution_curl.zsh").read_text(
            encoding="utf-8"
        )

        self.assertNotIn("export RELUTION_API_TOKEN", handbook)
        self.assertNotIn('--header "X-User-Access-Token:', handbook)
        self.assertIn("source scripts/relution_curl.zsh", handbook)
        self.assertIn("relution_curl()", helper)
        self.assertIn("| command curl --disable --config -", helper)
        self.assertNotIn("<<<", helper)

    def test_public_alpha_files_exist(self) -> None:
        required = (
            ".gitignore",
            "CONTRIBUTING.md",
            "README.md",
            "RELEASE_STATUS.md",
            "RELEASING.md",
            "SECURITY.md",
            "SUPPORT.md",
            ".github/ISSUE_TEMPLATE/documentation.yml",
            "docs/releases/0.1.0-alpha.1.md",
            "docs/relution/CAMPUSWEAVE.md",
            "docs/assets/screenshots/campusweave-overview.png",
            "docs/assets/screenshots/campusweave-assignments.png",
            "docs/assets/screenshots/campusweave-mobile.png",
        )
        missing = [path for path in required if not (REPOSITORY_ROOT / path).is_file()]
        self.assertEqual(missing, [])

    def test_private_local_and_test_artifacts_are_ignored(self) -> None:
        patterns = (REPOSITORY_ROOT / ".gitignore").read_text(encoding="utf-8").splitlines()
        required = {
            "token",
            ".env",
            ".DS_Store",
            "__pycache__/",
            ".pytest_cache/",
            ".mypy_cache/",
            ".ruff_cache/",
            ".pyright/",
            "/.venv/",
            "docs/relution/openapi/*.json",
            "docs/relution/observations/",
            "/.local/",
            "/private/",
            "/evidence/",
            "/backups/",
            "/archive/",
            "/screenshots/",
            "/*-ledger.md",
            "/*-remediation.md",
            "/coverage/",
            ".coverage*",
            "/htmlcov/",
            "/playwright-report/",
            "/test-results/",
        }
        self.assertTrue(required.issubset(set(patterns)))

    def test_public_surface_excludes_private_relution_evidence(self) -> None:
        forbidden_directories = (
            REPOSITORY_ROOT / "docs/relution/observations",
            REPOSITORY_ROOT / "docs/relution/archive",
        )
        self.assertEqual([path for path in forbidden_directories if path.exists()], [])
        self.assertEqual(
            list((REPOSITORY_ROOT / "docs/relution/openapi").glob("*.json")),
            [],
        )

    def test_public_product_surface_uses_campusweave_brand(self) -> None:
        required = (
            "README.md",
            "campusweave/__main__.py",
            "web/index.html",
            "docs/relution/CAMPUSWEAVE.md",
        )
        for path in required:
            self.assertIn(
                "CampusWeave",
                (REPOSITORY_ROOT / path).read_text(encoding="utf-8"),
                path,
            )
    def test_target_contract_outputs_stay_local(self) -> None:
        workflow_documents = (
            "README.md",
            "docs/relution/README.md",
            "docs/relution/openapi/README.md",
            "docs/relution/API_OPERATIONS.md",
        )
        for relative_path in workflow_documents:
            text = (REPOSITORY_ROOT / relative_path).read_text(encoding="utf-8")
            self.assertIn(".local/relution-contract", text, relative_path)
            self.assertNotIn(
                "--output docs/relution/generated/API_CATALOG.md",
                text,
                relative_path,
            )
            self.assertNotIn(
                "--json-output docs/relution/generated/API_CATALOG.json",
                text,
                relative_path,
            )

        catalog = json.loads(
            (REPOSITORY_ROOT / "docs/relution/generated/API_CATALOG.json").read_text(
                encoding="utf-8"
            )
        )
        self.assertEqual(catalog["status"], "not_generated")
        self.assertEqual(catalog["operation_count"], 0)
        self.assertIsNone(catalog["source"]["sha256"])

    def test_public_text_follows_release_writing_rules(self) -> None:
        failures: list[str] = []
        text_suffixes = {
            ".css",
            ".html",
            ".js",
            ".json",
            ".md",
            ".mjs",
            ".py",
            ".svg",
            ".yml",
            ".yaml",
            ".zsh",
        }
        prohibited_phrases = (
            "cutting" + "-edge",
            "enterprise" + "-grade",
            "game" + "-changing",
            "power" + "ful",
            "production" + "-ready",
            "revolution" + "ary",
            "seam" + "less",
        )
        for path in public_files("*"):
            if path.suffix not in text_suffixes:
                continue
            text = path.read_text(encoding="utf-8")
            relative = path.relative_to(REPOSITORY_ROOT)
            if chr(0x2014) in text:
                failures.append(f"{relative}: contains an em dash")
            if path.suffix == ".md" and SINGLE_WORD_EMPHASIS.search(text):
                failures.append(f"{relative}: contains single-word emphasis")
            lowered = text.lower()
            for phrase in prohibited_phrases:
                if phrase in lowered:
                    failures.append(f"{relative}: contains prohibited phrase {phrase}")
        self.assertEqual(failures, [], "\n".join(failures))


if __name__ == "__main__":
    unittest.main()
