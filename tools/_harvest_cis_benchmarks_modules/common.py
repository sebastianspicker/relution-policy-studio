"""Shared CIS benchmark metadata and parsing constants."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
CIS_DIR = REPO_ROOT / "example" / "cis-references"
PDF_DIR = CIS_DIR / "downloads" / "pdf"
README_PATH = CIS_DIR / "README.md"

POWERSHELL_COMMAND_START_RE = re.compile(
    r"\b(?:Get|Set|New|Remove)-[A-Z][A-Za-z0-9]+\b"
)
POWERSHELL_STOP_MARKERS = (
    " Note:",
    " Warning:",
    " Default Value:",
    " References:",
    " This ",
    " Additional Information:",
)


def extract_powershell_commands(text: str) -> list[str]:
    """Extract bounded PowerShell command snippets from remediation text."""

    commands: list[str] = []
    for match in POWERSHELL_COMMAND_START_RE.finditer(text):
        end = len(text)
        next_command = POWERSHELL_COMMAND_START_RE.search(text, match.end())
        if next_command is not None:
            end = min(end, next_command.start())
        for marker in POWERSHELL_STOP_MARKERS:
            marker_index = text.find(marker, match.start())
            if marker_index != -1:
                end = min(end, marker_index)
        candidate = normalize_space(text[match.start() : end]).rstrip(".")
        if candidate:
            commands.append(candidate)
    return unique_preserving_order(commands)


def build_helper_fallback(
    recommendation_id: str, options: dict[str, Any]
) -> dict[str, Any]:
    """Build a structured helper fallback row for non-importable CIS guidance."""

    payload: dict[str, Any] = {
        "id": slugify(
            f"{recommendation_id}-{options['method']}-{options.get('index', 1)}"
        ),
        "role": options["role"],
        "method": options["method"],
        "title": options["title"],
        "rawText": str(options["rawText"]).strip(),
        "commands": options.get("commands") or [],
    }
    if options.get("groupPolicyPaths"):
        payload["groupPolicyPaths"] = options["groupPolicyPaths"]
    if options.get("registryPaths"):
        payload["registryPaths"] = options["registryPaths"]
    if options.get("profilePayloadType") is not None:
        payload["profilePayloadType"] = options["profilePayloadType"]
    if options.get("profileKeys"):
        payload["profileKeys"] = options["profileKeys"]
    return payload


def extract_excerpt(text: str, needle: str, radius: int = 220) -> str:
    """Return a bounded excerpt around a marker string."""

    index = text.find(needle)
    if index == -1:
        return text.strip()
    start = max(0, index - radius)
    end = min(len(text), index + len(needle) + radius)
    return text[start:end].strip()


def trim_at_markers(text: str, markers: tuple[str, ...]) -> str:
    """Trim text at the earliest marker, if any marker appears."""

    end = len(text)
    for marker in markers:
        index = text.find(marker)
        if index != -1:
            end = min(end, index)
    return text[:end]


def is_terminal_stop_line(line: str) -> bool:
    """Return whether a parsed line starts a non-recommendation appendix block."""

    return any(
        line.startswith(prefix)
        for prefix in (
            "The output",
            "Software Update Tool",
            "Software Update found",
            "Finding available software",
            "Note:",
            "Or run the following command",
            "example:",
            "Example:",
            "Profile Method:",
            "Graphical Method:",
            "Default Value:",
            "References:",
            "CIS Controls:",
        )
    )


def unique_profile_keys(keys: list[dict[str, str]]) -> list[dict[str, str]]:
    """Deduplicate profile key/value entries while preserving source order."""

    seen = set()
    unique: list[dict[str, str]] = []
    for entry in keys:
        marker = (entry["key"], entry["value"])
        if marker in seen:
            continue
        seen.add(marker)
        unique.append(entry)
    return unique


def unique_preserving_order(values: list[str]) -> list[str]:
    """Return non-empty strings in first-seen order."""

    return list(dict.fromkeys(value for value in values if value))


def normalize_space(value: str) -> str:
    """Collapse all whitespace in a string to single spaces."""

    return " ".join(value.split())


def slugify(value: str) -> str:
    """Create a stable lowercase id segment from CIS text."""

    slug = value.lower().replace(".", "-").replace("_", "-")
    slug = re.sub(r"[^a-z0-9-]+", "-", slug)
    slug = re.sub(r"-{2,}", "-", slug)
    return slug.strip("-")


def write_json(path: Path, payload: Any) -> None:
    """Write pretty UTF-8 JSON with the repository's trailing newline convention."""

    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf8"
    )


@dataclass(frozen=True)
class BenchmarkDetails:
    """Version and OS-family metadata extracted from a CIS benchmark."""

    os_family: str
    version: str
    document_date: str


@dataclass(frozen=True)
class BenchmarkSpec:
    """Checked-in CIS benchmark source and target-platform metadata."""

    benchmark_id: str
    file_name: str
    benchmark_title: str
    platform: str
    family_source_id: str
    management_surface: str
    details: BenchmarkDetails

    @property
    def os_family(self) -> str:
        """Operating-system family covered by the benchmark."""

        return self.details.os_family

    @property
    def version(self) -> str:
        """Version string published for the benchmark document."""

        return self.details.version

    @property
    def document_date(self) -> str:
        """Publication date recorded for the benchmark document."""

        return self.details.document_date

    @property
    def source_pdf_path(self) -> str:
        """Repository-relative path to the benchmark PDF fixture."""

        return f"example/cis-references/downloads/pdf/{self.file_name}"

    @property
    def path(self) -> Path:
        """Filesystem path to the checked-in benchmark PDF fixture."""

        return PDF_DIR / self.file_name


BENCHMARKS: tuple[BenchmarkSpec, ...] = (
    BenchmarkSpec(
        benchmark_id="cis-apple-ios-17-ipados-17-intune-1-0-0",
        file_name="CIS_Apple_iOS_17_and_iPadOS_17_Intune_Benchmark_v1.0.0.pdf",
        benchmark_title="CIS Apple iOS 17 and iPadOS 17 Intune Benchmark",
        platform="IOS",
        family_source_id="cis-apple-ios-family",
        management_surface="MICROSOFT_INTUNE",
        details=BenchmarkDetails(
            os_family="IOS", version="1.0.0", document_date="2024-04-04"
        ),
    ),
    BenchmarkSpec(
        benchmark_id="cis-apple-ios-18-2-0-0",
        file_name="CIS_Apple_iOS_18_Benchmark_v2.0.0.pdf",
        benchmark_title="CIS Apple iOS 18 Benchmark",
        platform="IOS",
        family_source_id="cis-apple-ios-family",
        management_surface="APPLE_CONFIGURATION_PROFILE",
        details=BenchmarkDetails(
            os_family="IOS", version="2.0.0", document_date="2026-01-12"
        ),
    ),
    BenchmarkSpec(
        benchmark_id="cis-apple-ios-26-1-0-0",
        file_name="CIS_Apple_iOS_26_Benchmark_v1.0.0.pdf",
        benchmark_title="CIS Apple iOS 26 Benchmark",
        platform="IOS",
        family_source_id="cis-apple-ios-family",
        management_surface="APPLE_CONFIGURATION_PROFILE",
        details=BenchmarkDetails(
            os_family="IOS", version="1.0.0", document_date="2026-03-06"
        ),
    ),
    BenchmarkSpec(
        benchmark_id="cis-apple-ipados-18-2-0-0",
        file_name="CIS_Apple_iPadOS_18_Benchmark_v2.0.0.pdf",
        benchmark_title="CIS Apple iPadOS 18 Benchmark",
        platform="IOS",
        family_source_id="cis-apple-ios-family",
        management_surface="APPLE_CONFIGURATION_PROFILE",
        details=BenchmarkDetails(
            os_family="IOS", version="2.0.0", document_date="2026-01-12"
        ),
    ),
    BenchmarkSpec(
        benchmark_id="cis-apple-ipados-26-1-0-0",
        file_name="CIS_Apple_iPadOS_26_Benchmark_v1.0.0.pdf",
        benchmark_title="CIS Apple iPadOS 26 Benchmark",
        platform="IOS",
        family_source_id="cis-apple-ios-family",
        management_surface="APPLE_CONFIGURATION_PROFILE",
        details=BenchmarkDetails(
            os_family="IOS", version="1.0.0", document_date="2026-03-06"
        ),
    ),
    BenchmarkSpec(
        benchmark_id="cis-apple-macos-15-sequoia-2-0-0",
        file_name="CIS_Apple_macOS_15.0_Sequoia_Benchmark_v2.0.0.pdf",
        benchmark_title="CIS Apple macOS 15.0 Sequoia Benchmark",
        platform="MACOS",
        family_source_id="cis-apple-macos-family",
        management_surface="APPLE_CONFIGURATION_PROFILE",
        details=BenchmarkDetails(
            os_family="MACOS", version="2.0.0", document_date="2026-01-12"
        ),
    ),
    BenchmarkSpec(
        benchmark_id="cis-apple-macos-26-tahoe-1-0-0",
        file_name="CIS_Apple_macOS_26_Tahoe_Benchmark_v1.0.0.pdf",
        benchmark_title="CIS Apple macOS 26 Tahoe Benchmark",
        platform="MACOS",
        family_source_id="cis-apple-macos-family",
        management_surface="APPLE_CONFIGURATION_PROFILE",
        details=BenchmarkDetails(
            os_family="MACOS", version="1.0.0", document_date="2026-03-06"
        ),
    ),
    BenchmarkSpec(
        benchmark_id="cis-google-android-1-6-0",
        file_name="CIS_Google_Android_Benchmark_v1.6.0.pdf",
        benchmark_title="CIS Google Android Benchmark",
        platform="ANDROID_ENTERPRISE",
        family_source_id="cis-google-android-family",
        management_surface="ANDROID_MANUAL",
        details=BenchmarkDetails(
            os_family="ANDROID", version="1.6.0", document_date="2025-09-30"
        ),
    ),
    BenchmarkSpec(
        benchmark_id="cis-microsoft-defender-antivirus-1-0-0",
        file_name="CIS_Microsoft_Defender_Antivirus_Benchmark_v1.0.0.pdf",
        benchmark_title="CIS Microsoft Defender Antivirus Benchmark",
        platform="WINDOWS",
        family_source_id="cis-windows-desktop-family",
        management_surface="WINDOWS_GROUP_POLICY",
        details=BenchmarkDetails(
            os_family="WINDOWS", version="1.0.0", document_date="2025-11-26"
        ),
    ),
    BenchmarkSpec(
        benchmark_id="cis-microsoft-windows-11-standalone-5-0-0",
        file_name="CIS_Microsoft_Windows_11_Stand-alone_Benchmark_v5.0.0.pdf",
        benchmark_title="CIS Microsoft Windows 11 Stand-alone Benchmark",
        platform="WINDOWS",
        family_source_id="cis-windows-desktop-family",
        management_surface="WINDOWS_STANDALONE",
        details=BenchmarkDetails(
            os_family="WINDOWS", version="5.0.0", document_date="2026-03-25"
        ),
    ),
)
