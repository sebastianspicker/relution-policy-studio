#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

sys.dont_write_bytecode = True

from build_relution_import_artifacts import build_source_artifacts  # noqa: E402
from recommendation_mapping import (  # noqa: E402
    android_relution_analog_mappings_for,
    android_relution_candidates_for,
    apple_mobileconfig_candidates_for,
    apple_schema_analog_mappings_for,
    build_setting_index,
    flatten_value_paths,
    load_apple_mobileconfig_evidence,
    infer_exact_boolean_mapping,
    load_windows_custom_csp_evidence,
    mapping_candidates,
    semantic_candidates_for,
    semantic_concepts_for,
    semantic_no_concept_reason,
    windows_custom_csp_mapping_for,
)


REPO_ROOT = Path(__file__).resolve().parents[1]
CIS_DIR = REPO_ROOT / "example" / "cis-references"
PDF_DIR = CIS_DIR / "downloads" / "pdf"
SOURCES_PATH = CIS_DIR / "sources.json"
MANIFEST_PATH = CIS_DIR / "downloads" / "manifest.json"
README_PATH = CIS_DIR / "README.md"
BASELINE_PATH = CIS_DIR / "cis-relution-baseline.json"
CATALOG_PATH = CIS_DIR / "cis-recommendations.json"
RULESET_PATH = CIS_DIR / "cis-relution-ruleset.json"
WINDOWS_REXP_EVIDENCE_PATH = REPO_ROOT / "example" / "vendor-references" / "downloads" / "derived" / "windows-relution-csp-evidence.json"

HEADING_ID_RE = re.compile(r"^\d+(?:\.\d+)+\s+")
HEADING_RE = re.compile(r"^(?P<id>\d+(?:\.\d+)+)\s+(?P<title>.+?)\s*\((?P<assessment>Automated|Manual)\)$")
RECOMMENDED_STATE_RE = re.compile(r"The recommended state for this setting is:?\s*(?P<value>.+?)(?:\.(?:\s|$)|$)")
LIST_ITEM_RE = re.compile(r"^\d+\.\s+")
MACOS_METHOD_LABEL_RE = re.compile(r"(Graphical Method:|Terminal Method:|Profile Method:)")
WINDOWS_AUDITPOL_COMMAND_RE = re.compile(r'(auditpol\s+/get\s+/subcategory:"[^"]+")', re.IGNORECASE)
WINDOWS_GROUP_POLICY_PATH_RE = re.compile(
    r"((?:Computer|User) Configuration\\[A-Za-z0-9 .()'’/_-]+(?:\\[A-Za-z0-9 .()'’/_-]+)+)"
)
WINDOWS_REGISTRY_PATH_RE = re.compile(
    r"((?:HKLM|HKCU|HKEY_[A-Z_]+)\\[A-Za-z0-9 .(){}:/_-]+(?:\\[A-Za-z0-9 .(){}:/_-]+)*(?::[A-Za-z0-9 .(){}_-]+)?)"
)
POWERSHELL_COMMAND_START_RE = re.compile(r"\b(?:Get|Set|New|Remove)-[A-Z][A-Za-z0-9]+\b")
MACOS_PROFILE_PAYLOAD_TYPE_RE = re.compile(r"PayloadType(?: string)? is\s+([A-Za-z0-9._-]+)", re.IGNORECASE)
MACOS_PROFILE_KEY_RE = re.compile(
    r"The key to include is\s+([A-Za-z0-9._-]+)\s+\d+\.\s+The key must be set to\s+(.+?)(?=\s+\d+\.\s+|$)",
    re.IGNORECASE,
)

POWERSHELL_STOP_MARKERS = (
    " Note:",
    " Warning:",
    " Default Value:",
    " References:",
    " This ",
    " Additional Information:",
)
TERMINAL_COMMAND_STOP_MARKERS = (
    " The output",
    " Note:",
    " Software Update Tool",
    " Finding available software",
    " Or run the following command",
    " example:",
    " Example:",
    " Profile Method:",
    " Graphical Method:",
    " Default Value:",
    " References:",
    " CIS Controls:",
)

SECTION_ALIASES = {
    "Description:": "description",
    "Rationale:": "rationale",
    "Impact:": "impact",
    "Impact Statement:": "impact",
    "Audit:": "audit",
    "Audit Procedure:": "audit",
    "Remediation:": "remediation",
    "Remediation Procedure:": "remediation",
    "Default Value:": "defaultValue",
    "References:": "references",
    "Additional Information:": "additionalInformation",
    "CIS Controls:": "cisControls",
}


@dataclass(frozen=True)
class BenchmarkSpec:
    benchmark_id: str
    file_name: str
    benchmark_title: str
    platform: str
    os_family: str
    family_source_id: str
    management_surface: str
    version: str
    document_date: str

    @property
    def source_pdf_path(self) -> str:
        return f"example/cis-references/downloads/pdf/{self.file_name}"

    @property
    def path(self) -> Path:
        return PDF_DIR / self.file_name


BENCHMARKS: tuple[BenchmarkSpec, ...] = (
    BenchmarkSpec(
        benchmark_id="cis-apple-ios-17-ipados-17-intune-1-0-0",
        file_name="CIS_Apple_iOS_17_and_iPadOS_17_Intune_Benchmark_v1.0.0.pdf",
        benchmark_title="CIS Apple iOS 17 and iPadOS 17 Intune Benchmark",
        platform="IOS",
        os_family="IOS",
        family_source_id="cis-apple-ios-family",
        management_surface="MICROSOFT_INTUNE",
        version="1.0.0",
        document_date="2024-04-04",
    ),
    BenchmarkSpec(
        benchmark_id="cis-apple-ios-18-2-0-0",
        file_name="CIS_Apple_iOS_18_Benchmark_v2.0.0.pdf",
        benchmark_title="CIS Apple iOS 18 Benchmark",
        platform="IOS",
        os_family="IOS",
        family_source_id="cis-apple-ios-family",
        management_surface="APPLE_CONFIGURATION_PROFILE",
        version="2.0.0",
        document_date="2026-01-12",
    ),
    BenchmarkSpec(
        benchmark_id="cis-apple-ios-26-1-0-0",
        file_name="CIS_Apple_iOS_26_Benchmark_v1.0.0.pdf",
        benchmark_title="CIS Apple iOS 26 Benchmark",
        platform="IOS",
        os_family="IOS",
        family_source_id="cis-apple-ios-family",
        management_surface="APPLE_CONFIGURATION_PROFILE",
        version="1.0.0",
        document_date="2026-03-06",
    ),
    BenchmarkSpec(
        benchmark_id="cis-apple-ipados-18-2-0-0",
        file_name="CIS_Apple_iPadOS_18_Benchmark_v2.0.0.pdf",
        benchmark_title="CIS Apple iPadOS 18 Benchmark",
        platform="IOS",
        os_family="IOS",
        family_source_id="cis-apple-ios-family",
        management_surface="APPLE_CONFIGURATION_PROFILE",
        version="2.0.0",
        document_date="2026-01-12",
    ),
    BenchmarkSpec(
        benchmark_id="cis-apple-ipados-26-1-0-0",
        file_name="CIS_Apple_iPadOS_26_Benchmark_v1.0.0.pdf",
        benchmark_title="CIS Apple iPadOS 26 Benchmark",
        platform="IOS",
        os_family="IOS",
        family_source_id="cis-apple-ios-family",
        management_surface="APPLE_CONFIGURATION_PROFILE",
        version="1.0.0",
        document_date="2026-03-06",
    ),
    BenchmarkSpec(
        benchmark_id="cis-apple-macos-15-sequoia-2-0-0",
        file_name="CIS_Apple_macOS_15.0_Sequoia_Benchmark_v2.0.0.pdf",
        benchmark_title="CIS Apple macOS 15.0 Sequoia Benchmark",
        platform="MACOS",
        os_family="MACOS",
        family_source_id="cis-apple-macos-family",
        management_surface="APPLE_CONFIGURATION_PROFILE",
        version="2.0.0",
        document_date="2026-01-12",
    ),
    BenchmarkSpec(
        benchmark_id="cis-apple-macos-26-tahoe-1-0-0",
        file_name="CIS_Apple_macOS_26_Tahoe_Benchmark_v1.0.0.pdf",
        benchmark_title="CIS Apple macOS 26 Tahoe Benchmark",
        platform="MACOS",
        os_family="MACOS",
        family_source_id="cis-apple-macos-family",
        management_surface="APPLE_CONFIGURATION_PROFILE",
        version="1.0.0",
        document_date="2026-03-06",
    ),
    BenchmarkSpec(
        benchmark_id="cis-google-android-1-6-0",
        file_name="CIS_Google_Android_Benchmark_v1.6.0.pdf",
        benchmark_title="CIS Google Android Benchmark",
        platform="ANDROID_ENTERPRISE",
        os_family="ANDROID",
        family_source_id="cis-google-android-family",
        management_surface="ANDROID_MANUAL",
        version="1.6.0",
        document_date="2025-09-30",
    ),
    BenchmarkSpec(
        benchmark_id="cis-microsoft-defender-antivirus-1-0-0",
        file_name="CIS_Microsoft_Defender_Antivirus_Benchmark_v1.0.0.pdf",
        benchmark_title="CIS Microsoft Defender Antivirus Benchmark",
        platform="WINDOWS",
        os_family="WINDOWS",
        family_source_id="cis-windows-desktop-family",
        management_surface="WINDOWS_GROUP_POLICY",
        version="1.0.0",
        document_date="2025-11-26",
    ),
    BenchmarkSpec(
        benchmark_id="cis-microsoft-windows-11-standalone-5-0-0",
        file_name="CIS_Microsoft_Windows_11_Stand-alone_Benchmark_v5.0.0.pdf",
        benchmark_title="CIS Microsoft Windows 11 Stand-alone Benchmark",
        platform="WINDOWS",
        os_family="WINDOWS",
        family_source_id="cis-windows-desktop-family",
        management_surface="WINDOWS_STANDALONE",
        version="5.0.0",
        document_date="2026-03-25",
    ),
)


def main() -> None:
    sources = {entry["id"]: entry for entry in json.loads(SOURCES_PATH.read_text(encoding="utf8"))}
    field_index = build_setting_index()
    windows_rexp_evidence = load_windows_custom_csp_evidence(WINDOWS_REXP_EVIDENCE_PATH)
    apple_mobileconfig_evidence = load_apple_mobileconfig_evidence()
    recommendations = [
        recommendation
        for benchmark in BENCHMARKS
        for recommendation in parse_benchmark(benchmark, field_index, windows_rexp_evidence, apple_mobileconfig_evidence)
    ]
    write_json(CATALOG_PATH, recommendations)
    write_json(BASELINE_PATH, build_baseline_summary(sources, recommendations))
    build_source_artifacts("cis")
    update_readme()


def parse_benchmark(
    benchmark: BenchmarkSpec,
    field_index: dict[str, list[Any]],
    windows_rexp_evidence: dict[frozenset[str], list[dict[str, Any]]],
    apple_mobileconfig_evidence: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    pdf_text = subprocess.check_output(["pdftotext", "-layout", str(benchmark.path), "-"], text=True)
    pages = [clean_page_lines(page) for page in pdf_text.split("\f")]
    lines, page_starts = flatten_pages(pages)
    starts = detect_recommendation_starts(pages, page_starts)
    recommendations: list[dict[str, Any]] = []
    for index, start in enumerate(starts):
        end_offset = starts[index + 1]["startOffset"] if index + 1 < len(starts) else len(lines)
        block_lines = lines[start["profileOffset"] + 1 : end_offset]
        sections = parse_sections(block_lines)
        recommended_value = infer_recommended_value(start["title"], sections.get("description", ""))
        semantic_evidence_sources = cis_semantic_evidence_sources_for(start["recommendationId"], start["title"], recommended_value, sections)
        semantic_concepts = semantic_concepts_for(benchmark.platform, semantic_evidence_sources)
        semantic_candidates = cis_semantic_candidates_for(
            benchmark.platform,
            start["recommendationId"],
            start["title"],
            semantic_concepts,
        )
        mapping = mapping_for(
            benchmark,
            start["recommendationId"],
            start["title"],
            recommended_value,
            sections,
            field_index,
            windows_rexp_evidence,
            apple_mobileconfig_evidence,
            semantic_candidates,
        )
        helper_fallbacks = extract_helper_fallbacks(benchmark, start["recommendationId"], sections)
        semantic_metadata: dict[str, Any]
        if semantic_concepts:
            semantic_metadata = {"semanticConcepts": semantic_concepts}
        else:
            semantic_metadata = {"semanticNoConceptReason": semantic_no_concept_reason(semantic_evidence_sources)}
        recommendations.append(
            {
                "id": slugify(f"{benchmark.benchmark_id}-{start['recommendationId']}"),
                "platform": benchmark.platform,
                "osFamily": benchmark.os_family,
                "benchmarkId": benchmark.benchmark_id,
                "benchmarkTitle": benchmark.benchmark_title,
                "benchmarkVersion": benchmark.version,
                "benchmarkDate": benchmark.document_date,
                "managementSurface": benchmark.management_surface,
                "sourcePdfPath": benchmark.source_pdf_path,
                "familySourceId": benchmark.family_source_id,
                "sourceIds": [benchmark.benchmark_id, benchmark.family_source_id],
                "recommendationId": start["recommendationId"],
                "title": start["title"],
                "assessmentStatus": start["assessmentStatus"],
                "profileApplicability": sections.get("profileApplicability", []),
                "description": sections.get("description", ""),
                "rationale": sections.get("rationale", ""),
                "impact": sections.get("impact", ""),
                "audit": sections.get("audit", ""),
                "remediation": sections.get("remediation", ""),
                "defaultValue": sections.get("defaultValue", ""),
                "additionalInformation": sections.get("additionalInformation", ""),
                "references": sections.get("references", []),
                "recommendedValue": recommended_value,
                "helperFallbacks": helper_fallbacks,
                "relutionMapping": mapping,
                **semantic_metadata,
            }
        )
    return recommendations


def cis_semantic_evidence_sources_for(
    recommendation_id: str,
    title: str,
    recommended_value: str | None,
    sections: dict[str, Any],
) -> list[dict[str, Any]]:
    sources = [
        ("cis-title", title, 0.9),
        ("cis-description", str(sections.get("description", "")), 0.82),
        ("cis-rationale", str(sections.get("rationale", "")), 0.78),
        ("cis-audit", str(sections.get("audit", "")), 0.7),
        ("cis-remediation", str(sections.get("remediation", "")), 0.7),
        ("cis-default-value", str(sections.get("defaultValue", "")), 0.55),
        ("cis-recommended-value", "" if recommended_value is None else recommended_value, 0.65),
    ]
    return [
        {
            "source": source,
            "sourceId": recommendation_id,
            "text": text,
            "confidence": confidence,
        }
        for source, text, confidence in sources
        if normalize_space(text)
    ]


def cis_semantic_candidates_for(
    platform: str,
    recommendation_id: str,
    title: str,
    semantic_concepts: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if is_windows_helper_only_cis_recommendation(platform, recommendation_id, title):
        return []
    return semantic_candidates_for(platform, semantic_concepts)


def is_windows_helper_only_cis_recommendation(platform: str, recommendation_id: str, title: str) -> bool:
    if platform != "WINDOWS":
        return False
    normalized_title = title.lower()
    return recommendation_id.startswith("2.2.") or recommendation_id.startswith("5.") or "service" in normalized_title


def clean_page_lines(page: str) -> list[str]:
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
    flattened: list[str] = []
    page_starts: list[int] = []
    for page in pages:
        page_starts.append(len(flattened))
        flattened.extend(page)
        flattened.append("")
    return flattened, page_starts


def detect_recommendation_starts(pages: list[list[str]], page_starts: list[int]) -> list[dict[str, Any]]:
    starts: list[dict[str, Any]] = []
    for page_index, page_lines in enumerate(pages):
        for line_index, line in enumerate(page_lines):
            if HEADING_ID_RE.match(line) is None:
                continue
            heading_lines: list[str] = []
            cursor = line_index
            while cursor < len(page_lines) and page_lines[cursor] != "Profile Applicability:" and len(heading_lines) < 6:
                heading_lines.append(page_lines[cursor])
                cursor += 1
            if cursor >= len(page_lines) or page_lines[cursor] != "Profile Applicability:":
                continue
            heading = normalize_space(" ".join(heading_lines))
            match = HEADING_RE.match(heading)
            if match is None:
                continue
            starts.append(
                {
                    "startOffset": page_starts[page_index] + line_index,
                    "profileOffset": page_starts[page_index] + cursor,
                    "recommendationId": match.group("id"),
                    "title": match.group("title"),
                    "assessmentStatus": match.group("assessment"),
                }
            )
    return starts


def parse_sections(block_lines: list[str]) -> dict[str, Any]:
    sections: dict[str, list[str]] = {"profileApplicability": []}
    current = "profileApplicability"
    for raw_line in block_lines:
        line = raw_line.strip()
        if not line:
            if current not in {"profileApplicability", "references"}:
                sections.setdefault(current, []).append("")
            continue
        label = next((candidate for candidate in SECTION_ALIASES if line.startswith(candidate)), None)
        if label is not None:
            current = SECTION_ALIASES[label]
            sections.setdefault(current, [])
            remainder = line[len(label) :].strip()
            if remainder:
                sections[current].append(remainder)
            continue
        sections.setdefault(current, []).append(line)
    return {
        "profileApplicability": parse_profile_lines(sections.get("profileApplicability", [])),
        "description": join_section_text(sections.get("description", [])),
        "rationale": join_section_text(sections.get("rationale", [])),
        "impact": join_section_text(sections.get("impact", [])),
        "audit": join_section_text(sections.get("audit", [])),
        "auditLines": list(sections.get("audit", [])),
        "remediation": join_section_text(sections.get("remediation", [])),
        "remediationLines": list(sections.get("remediation", [])),
        "defaultValue": join_section_text(sections.get("defaultValue", [])),
        "additionalInformation": join_section_text(sections.get("additionalInformation", [])),
        "references": parse_references(sections.get("references", [])),
    }


def parse_profile_lines(lines: list[str]) -> list[str]:
    parsed: list[str] = []
    for line in lines:
        normalized = normalize_space(line)
        if not normalized:
            continue
        parsed.append(normalized.lstrip("• ").strip())
    return parsed


def join_section_text(lines: list[str]) -> str:
    paragraphs: list[str] = []
    buffer: list[str] = []
    for line in lines:
        normalized = normalize_space(line)
        if not normalized:
            if buffer:
                paragraphs.append(" ".join(buffer))
                buffer = []
            continue
        buffer.append(normalized)
    if buffer:
        paragraphs.append(" ".join(buffer))
    return "\n\n".join(paragraphs).strip()


def parse_references(lines: list[str]) -> list[str]:
    references: list[str] = []
    buffer = ""
    for line in lines:
        normalized = normalize_space(line)
        if not normalized:
            continue
        if LIST_ITEM_RE.match(normalized):
            if buffer:
                references.append(buffer)
            buffer = LIST_ITEM_RE.sub("", normalized, count=1)
            continue
        if buffer:
            buffer = f"{buffer} {normalized}".strip()
    if buffer:
        references.append(buffer)
    return references


def infer_recommended_value(title: str, description: str) -> str | None:
    description_match = RECOMMENDED_STATE_RE.search(description)
    if description_match is not None:
        return normalize_space(description_match.group("value")).rstrip(".")
    title_match = re.search(r"is set to ['\"](?P<value>.+?)['\"]", title)
    if title_match is not None:
        return title_match.group("value")
    return None


def extract_helper_fallbacks(benchmark: BenchmarkSpec, recommendation_id: str, sections: dict[str, Any]) -> list[dict[str, Any]]:
    if benchmark.platform == "WINDOWS":
        return extract_windows_helper_fallbacks(recommendation_id, sections.get("audit", ""), sections.get("remediation", ""))
    if benchmark.platform == "MACOS":
        return extract_macos_helper_fallbacks(recommendation_id, sections.get("remediationLines", []))
    return []


def extract_windows_helper_fallbacks(recommendation_id: str, audit_text: str, remediation_text: str) -> list[dict[str, Any]]:
    fallbacks: list[dict[str, Any]] = []
    combined_text = "\n".join([audit_text, remediation_text]).strip()

    auditpol_commands = unique_preserving_order(WINDOWS_AUDITPOL_COMMAND_RE.findall(audit_text))
    if auditpol_commands:
        fallbacks.append(
            build_helper_fallback(
                recommendation_id,
                method="auditpol",
                role="audit",
                title="auditpol.exe",
                raw_text=extract_excerpt(audit_text, auditpol_commands[0]),
                commands=auditpol_commands,
            )
        )

    powershell_commands = extract_powershell_commands(remediation_text)
    if powershell_commands:
        fallbacks.append(
            build_helper_fallback(
                recommendation_id,
                method="powershell",
                role="remediation",
                title="PowerShell",
                raw_text=extract_excerpt(remediation_text, powershell_commands[0]),
                commands=powershell_commands,
            )
        )

    group_policy_paths = unique_preserving_order(WINDOWS_GROUP_POLICY_PATH_RE.findall(combined_text))
    if group_policy_paths:
        fallbacks.append(
            build_helper_fallback(
                recommendation_id,
                method="group-policy-path",
                role="remediation",
                title="Group Policy",
                raw_text=extract_excerpt(combined_text, group_policy_paths[0]),
                group_policy_paths=group_policy_paths,
            )
        )

    registry_paths = unique_preserving_order(WINDOWS_REGISTRY_PATH_RE.findall(combined_text))
    if registry_paths:
        fallbacks.append(
            build_helper_fallback(
                recommendation_id,
                method="registry-reference",
                role="audit",
                title="Registry reference",
                raw_text=extract_excerpt(combined_text, registry_paths[0]),
                registry_paths=registry_paths,
            )
        )

    return fallbacks


def extract_macos_helper_fallbacks(recommendation_id: str, remediation_lines: list[str]) -> list[dict[str, Any]]:
    fallbacks: list[dict[str, Any]] = []
    for index, block in enumerate(split_macos_method_blocks(remediation_lines), start=1):
        if block["label"] == "Terminal Method":
            commands = extract_terminal_commands(block["rawText"])
            if commands:
                fallbacks.append(
                    build_helper_fallback(
                        recommendation_id,
                        method="terminal",
                        role="remediation",
                        title="Terminal Method",
                        raw_text=block["rawText"],
                        commands=commands,
                        index=index,
                    )
                )
        if block["label"] == "Profile Method":
            profile_payload_type = extract_profile_payload_type(block["text"])
            profile_keys = extract_profile_keys(block["text"])
            if profile_payload_type is not None or profile_keys:
                fallbacks.append(
                    build_helper_fallback(
                        recommendation_id,
                        method="profile-method",
                        role="remediation",
                        title="Profile Method",
                        raw_text=block["rawText"],
                        profile_payload_type=profile_payload_type,
                        profile_keys=profile_keys,
                        index=index,
                    )
                )
    return fallbacks


def split_macos_method_blocks(remediation_lines: list[str]) -> list[dict[str, str]]:
    text = "\n".join(line for line in remediation_lines if line)
    matches = list(MACOS_METHOD_LABEL_RE.finditer(text))
    blocks: list[dict[str, str]] = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        raw_text = text[match.end() : end].strip()
        if not raw_text:
            continue
        blocks.append(
            {
                "label": match.group(1).removesuffix(":"),
                "text": normalize_space(raw_text),
                "rawText": raw_text,
            }
        )
    return blocks


def extract_terminal_commands(raw_text: str) -> list[str]:
    commands: list[str] = []
    current_command: str | None = None
    for line in raw_text.splitlines():
        stripped = line.strip()
        if not stripped:
            if current_command is not None:
                commands.append(trim_at_markers(current_command.strip(), TERMINAL_COMMAND_STOP_MARKERS).strip())
                current_command = None
            continue
        if "% " in stripped:
            if current_command is not None:
                commands.append(trim_at_markers(current_command.strip(), TERMINAL_COMMAND_STOP_MARKERS).strip())
            current_command = stripped.split("% ", 1)[1].strip()
            continue
        if current_command is None:
            continue
        if is_terminal_stop_line(stripped):
            commands.append(trim_at_markers(current_command.strip(), TERMINAL_COMMAND_STOP_MARKERS).strip())
            current_command = None
            continue
        current_command = f"{current_command} {stripped}".strip()
    if current_command is not None:
        commands.append(trim_at_markers(current_command.strip(), TERMINAL_COMMAND_STOP_MARKERS).strip())
    return unique_preserving_order(commands)


def extract_profile_payload_type(text: str) -> str | None:
    match = MACOS_PROFILE_PAYLOAD_TYPE_RE.search(text)
    if match is None:
        return None
    return match.group(1)


def extract_profile_keys(text: str) -> list[dict[str, str]]:
    keys = [
        {
            "key": key,
            "value": normalize_space(value).rstrip("."),
        }
        for key, value in MACOS_PROFILE_KEY_RE.findall(text)
    ]
    return unique_profile_keys(keys)
