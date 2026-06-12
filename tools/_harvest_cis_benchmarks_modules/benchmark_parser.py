#!/usr/bin/env python3
"""Parse CIS benchmark PDFs into normalized recommendation records."""

from __future__ import annotations

import importlib
import json
import re
import sys
from pathlib import Path
from typing import Any, Callable

from build_relution_import_artifacts import build_source_artifacts
from recommendation_mapping import (
    build_setting_index,
    load_apple_mobileconfig_evidence,
    load_windows_custom_csp_evidence,
    semantic_candidates_for,
    semantic_concepts_for,
    semantic_evidence_source_records,
    semantic_metadata_for,
)
from _harvest_cis_benchmarks_modules.common import (
    BENCHMARKS,
    CIS_DIR,
    PDF_DIR,
    README_PATH,
    REPO_ROOT,
    BenchmarkSpec,
)
from _harvest_cis_benchmarks_modules.mapping_rulesets import (
    build_baseline_summary,
    build_helper_fallback,
    extract_excerpt,
    extract_powershell_commands,
    is_terminal_stop_line,
    mapping_for,
    normalize_space,
    slugify,
    trim_at_markers,
    unique_preserving_order,
    unique_profile_keys,
    update_readme,
    write_json,
)

sys.dont_write_bytecode = True

__all__ = [
    "BENCHMARKS",
    "BenchmarkSpec",
    "CIS_DIR",
    "PDF_DIR",
    "README_PATH",
]


SOURCES_PATH = CIS_DIR / "sources.json"
MANIFEST_PATH = CIS_DIR / "downloads" / "manifest.json"
BASELINE_PATH = CIS_DIR / "cis-relution-baseline.json"
CATALOG_PATH = CIS_DIR / "cis-recommendations.json"
RULESET_PATH = CIS_DIR / "cis-relution-ruleset.json"
WINDOWS_REXP_EVIDENCE_PATH = (
    REPO_ROOT
    / "example"
    / "vendor-references"
    / "downloads"
    / "derived"
    / "windows-relution-csp-evidence.json"
)

HEADING_ID_RE = re.compile(r"^\d+(?:\.\d+)+\s+")
RECOMMENDED_STATE_RE = re.compile(
    r"The recommended state for this setting is:?\s*(?P<value>.+?)(?:\.(?:\s|$)|$)"
)
LIST_ITEM_RE = re.compile(r"^\d+\.\s+")
MACOS_METHOD_LABEL_RE = re.compile(
    r"(Graphical Method:|Terminal Method:|Profile Method:)"
)
WINDOWS_AUDITPOL_COMMAND_RE = re.compile(
    r'(auditpol\s+/get\s+/subcategory:"[^"]+")', re.IGNORECASE
)
WINDOWS_GROUP_POLICY_PATH_RE = re.compile(
    r"((?:Computer|User) Configuration\\[A-Za-z0-9 .()'’/_-]+(?:\\[A-Za-z0-9 .()'’/_-]+)+)"
)
MACOS_PROFILE_PAYLOAD_TYPE_RE = re.compile(
    r"PayloadType(?: string)? is\s+([A-Za-z0-9._-]+)", re.IGNORECASE
)
MACOS_PROFILE_KEY_RE = re.compile(
    (
        "The key to include is\\s+([A-Za-z0-9._-]+)\\s+\\d+\\.\\s+The key must be set "
        "to\\s+(.+?)(?=\\s+\\d+\\.\\s+|$)"
    ),
    re.IGNORECASE,
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


def main() -> None:
    """Generate CIS catalog, baseline summary, source artifacts, and README state."""
    sources = {
        entry["id"]: entry
        for entry in json.loads(SOURCES_PATH.read_text(encoding="utf8"))
    }
    field_index = build_setting_index()
    windows_rexp_evidence = load_windows_custom_csp_evidence(WINDOWS_REXP_EVIDENCE_PATH)
    apple_mobileconfig_evidence = load_apple_mobileconfig_evidence()
    recommendations = [
        recommendation
        for benchmark in BENCHMARKS
        for recommendation in parse_benchmark(
            benchmark, field_index, windows_rexp_evidence, apple_mobileconfig_evidence
        )
    ]
    write_json(CATALOG_PATH, recommendations)
    write_json(BASELINE_PATH, build_baseline_summary(sources, recommendations))
    build_source_artifacts("cis")
    update_readme()


def extract_pdf_text(path: Path) -> str:
    """Extract sorted page text from a CIS benchmark PDF using PyMuPDF."""
    if not path.is_file():
        raise FileNotFoundError(f"CIS benchmark PDF not found: {path}")
    try:
        pymupdf = importlib.import_module("pymupdf")
    except ModuleNotFoundError as error:
        raise ModuleNotFoundError(
            "PyMuPDF is required to parse CIS benchmark PDFs"
        ) from error

    with pymupdf.open(path) as document:
        return "\f".join(page.get_text(sort=True) for page in document)


def parse_benchmark(
    benchmark: BenchmarkSpec,
    field_index: dict[str, list[Any]],
    windows_rexp_evidence: dict[frozenset[str], list[dict[str, Any]]],
    apple_mobileconfig_evidence: dict[str, dict[str, Any]],
    *,
    pdf_text_extractor: Callable[[Path], str] = extract_pdf_text,
) -> list[dict[str, Any]]:
    """Parse one benchmark PDF into normalized CIS recommendation records."""
    parsed_text = parsed_benchmark_text(pdf_text_extractor(benchmark.path))
    lines = parsed_text["lines"]
    starts = parsed_text["starts"]
    recommendations: list[dict[str, Any]] = []
    helper_only_skipped = 0
    for index, start in enumerate(starts):
        end_offset = (
            starts[index + 1]["startOffset"] if index + 1 < len(starts) else len(lines)
        )
        block_lines = lines[start["profileOffset"] + 1 : end_offset]
        sections = parse_sections(block_lines)
        if is_windows_helper_only_cis_recommendation(
            benchmark.platform, start["recommendationId"], start["title"]
        ):
            helper_only_skipped += 1
        recommendations.append(
            benchmark_recommendation_entry(
                {
                    "benchmark": benchmark,
                    "start": start,
                    "sections": sections,
                    "fieldIndex": field_index,
                    "windowsRexpEvidence": windows_rexp_evidence,
                    "appleMobileconfigEvidence": apple_mobileconfig_evidence,
                }
            )
        )
    if helper_only_skipped:
        print(
            f"  Skipped {helper_only_skipped} helper-only items (not semantic candidates)",
            file=sys.stderr,
        )
    return recommendations


def parsed_benchmark_text(pdf_text: str) -> dict[str, Any]:
    """Normalize PDF text into clean lines and recommendation start offsets."""
    pages = [clean_page_lines(page) for page in pdf_text.split("\f")]
    lines, page_starts = flatten_pages(pages)
    return {"lines": lines, "starts": detect_recommendation_starts(pages, page_starts)}


def benchmark_recommendation_entry(context: dict[str, Any]) -> dict[str, Any]:
    """Build one CIS recommendation with fallback translations and mappings."""
    benchmark = context["benchmark"]
    start = context["start"]
    sections = context["sections"]
    recommended_value = infer_recommended_value(
        start["title"], sections.get("description", "")
    )
    semantic_evidence_sources = cis_semantic_evidence_sources_for(
        start["recommendationId"], start["title"], recommended_value, sections
    )
    semantic_concepts = semantic_concepts_for(
        benchmark.platform, semantic_evidence_sources
    )
    semantic_candidates = cis_semantic_candidates_for(
        benchmark.platform, start["recommendationId"], start["title"], semantic_concepts
    )
    return {
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
        "fallbackTranslations": extract_helper_fallbacks(
            benchmark, start["recommendationId"], sections
        ),
        "relutionMapping": mapping_for(
            {
                "benchmark": benchmark,
                "recommendationId": start["recommendationId"],
                "title": start["title"],
                "recommendedValue": recommended_value,
                "sections": sections,
                "fieldIndex": context["fieldIndex"],
                "windowsRexpEvidence": context["windowsRexpEvidence"],
                "appleMobileconfigEvidence": context["appleMobileconfigEvidence"],
                "semanticCandidates": semantic_candidates,
            }
        ),
        **semantic_metadata_for(semantic_evidence_sources, semantic_concepts),
    }


def cis_semantic_evidence_sources_for(
    recommendation_id: str,
    title: str,
    recommended_value: str | None,
    sections: dict[str, Any],
) -> list[dict[str, Any]]:
    """Compose weighted CIS text sources for semantic mapping inference."""
    sources = [
        ("cis-title", title, 0.9),
        ("cis-description", str(sections.get("description", "")), 0.82),
        ("cis-rationale", str(sections.get("rationale", "")), 0.78),
        ("cis-audit", str(sections.get("audit", "")), 0.7),
        ("cis-remediation", str(sections.get("remediation", "")), 0.7),
        ("cis-default-value", str(sections.get("defaultValue", "")), 0.55),
        (
            "cis-recommended-value",
            "" if recommended_value is None else recommended_value,
            0.65,
        ),
    ]
    return semantic_evidence_source_records(recommendation_id, sources, normalize_space)


def cis_semantic_candidates_for(
    platform: str,
    recommendation_id: str,
    title: str,
    semantic_concepts: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Return semantic candidates while excluding Windows helper-only guidance."""
    if is_windows_helper_only_cis_recommendation(platform, recommendation_id, title):
        print(
            f"INFO: skipping helper-only CIS recommendation {recommendation_id}: {title}",
            file=sys.stderr,
        )
        return []
    return semantic_candidates_for(platform, semantic_concepts)


def is_windows_helper_only_cis_recommendation(
    platform: str, recommendation_id: str, title: str
) -> bool:
    """Identify Windows CIS entries that describe helper state, not MDM settings."""
    if platform != "WINDOWS":
        return False
    normalized_title = title.lower()
    return (
        recommendation_id.startswith("2.2.")
        or recommendation_id.startswith("5.")
        or "service" in normalized_title
    )


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


def detect_recommendation_starts(
    pages: list[list[str]], page_starts: list[int]
) -> list[dict[str, Any]]:
    """Find recommendation headings that are followed by profile applicability."""
    starts: list[dict[str, Any]] = []
    for page_index, page_lines in enumerate(pages):
        for line_index, line in enumerate(page_lines):
            if HEADING_ID_RE.match(line) is None:
                continue
            heading_lines: list[str] = []
            cursor = line_index
            while (
                cursor < len(page_lines)
                and page_lines[cursor] != "Profile Applicability:"
                and len(heading_lines) < 6
            ):
                heading_lines.append(page_lines[cursor])
                cursor += 1
            if (
                cursor >= len(page_lines)
                or page_lines[cursor] != "Profile Applicability:"
            ):
                continue
            heading = normalize_space(" ".join(heading_lines))
            parsed_heading = parse_recommendation_heading(heading)
            if parsed_heading is None:
                continue
            starts.append(
                {
                    "startOffset": page_starts[page_index] + line_index,
                    "profileOffset": page_starts[page_index] + cursor,
                    "recommendationId": parsed_heading["id"],
                    "title": parsed_heading["title"],
                    "assessmentStatus": parsed_heading["assessment"],
                }
            )
    return starts


def parse_recommendation_heading(heading: str) -> dict[str, str] | None:
    """Parse a CIS heading into ID, title, and automated/manual assessment."""
    assessment_start = heading.rfind(" (")
    if assessment_start == -1 or not heading.endswith(")"):
        return None
    assessment = heading[assessment_start + 2 : -1]
    if assessment not in {"Automated", "Manual"}:
        return None
    id_and_title = heading[:assessment_start]
    recommendation_id, separator, title = id_and_title.partition(" ")
    if separator == "" or not is_dotted_number(recommendation_id):
        return None
    return {"id": recommendation_id, "title": title.strip(), "assessment": assessment}


def is_dotted_number(value: str) -> bool:
    """Return whether a heading token is a dotted numeric CIS recommendation ID."""
    parts = value.split(".")
    return len(parts) >= 2 and all(part.isdigit() for part in parts)


def parse_sections(block_lines: list[str]) -> dict[str, Any]:
    """Split a recommendation block into normalized CIS section fields."""
    sections: dict[str, list[str]] = {"profileApplicability": []}
    current = "profileApplicability"
    for raw_line in block_lines:
        line = raw_line.strip()
        if not line:
            if current not in {"profileApplicability", "references"}:
                sections.setdefault(current, []).append("")
            continue
        label = next(
            (candidate for candidate in SECTION_ALIASES if line.startswith(candidate)),
            None,
        )
        if label is not None:
            current = SECTION_ALIASES[label]
            sections.setdefault(current, [])
            remainder = line[len(label) :].strip()
            if remainder:
                sections[current].append(remainder)
            continue
        sections.setdefault(current, []).append(line)
    return {
        "profileApplicability": parse_profile_lines(
            sections.get("profileApplicability", [])
        ),
        "description": join_section_text(sections.get("description", [])),
        "rationale": join_section_text(sections.get("rationale", [])),
        "impact": join_section_text(sections.get("impact", [])),
        "audit": join_section_text(sections.get("audit", [])),
        "auditLines": list(sections.get("audit", [])),
        "remediation": join_section_text(sections.get("remediation", [])),
        "remediationLines": list(sections.get("remediation", [])),
        "defaultValue": join_section_text(sections.get("defaultValue", [])),
        "additionalInformation": join_section_text(
            sections.get("additionalInformation", [])
        ),
        "references": parse_references(sections.get("references", [])),
    }


def parse_profile_lines(lines: list[str]) -> list[str]:
    """Normalize profile-applicability bullets from a recommendation block."""
    parsed: list[str] = []
    for line in lines:
        normalized = normalize_space(line)
        if not normalized:
            continue
        parsed.append(normalized.lstrip("• ").strip())
    return parsed


def join_section_text(lines: list[str]) -> str:
    """Join section lines into paragraph text while preserving blank breaks."""
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
    """Parse numbered CIS reference lines into stable reference strings."""
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
    """Infer the recommended setting value from description text or title."""
    description_match = RECOMMENDED_STATE_RE.search(description)
    if description_match is not None:
        return normalize_space(description_match.group("value")).rstrip(".")
    title_match = re.search(r"is set to ['\"](?P<value>.+?)['\"]", title)
    if title_match is not None:
        return title_match.group("value")
    return None


def extract_helper_fallbacks(
    benchmark: BenchmarkSpec, recommendation_id: str, sections: dict[str, Any]
) -> list[dict[str, Any]]:
    """Extract non-MDM helper evidence for platform-specific CIS recommendations."""
    if benchmark.platform == "WINDOWS":
        return extract_windows_helper_fallbacks(
            recommendation_id,
            sections.get("audit", ""),
            sections.get("remediation", ""),
        )
    if benchmark.platform == "MACOS":
        return extract_macos_helper_fallbacks(
            recommendation_id, sections.get("remediationLines", [])
        )
    return []


def extract_windows_helper_fallbacks(
    recommendation_id: str, audit_text: str, remediation_text: str
) -> list[dict[str, Any]]:
    """Extract Windows audit/remediation commands and policy paths as fallbacks."""
    fallbacks: list[dict[str, Any]] = []
    combined_text = "\n".join([audit_text, remediation_text]).strip()

    auditpol_commands = unique_preserving_order(
        WINDOWS_AUDITPOL_COMMAND_RE.findall(audit_text)
    )
    if auditpol_commands:
        fallbacks.append(
            build_helper_fallback(
                recommendation_id,
                {
                    "method": "auditpol",
                    "role": "audit",
                    "title": "auditpol.exe",
                    "rawText": extract_excerpt(audit_text, auditpol_commands[0]),
                    "commands": auditpol_commands,
                },
            )
        )

    powershell_commands = extract_powershell_commands(remediation_text)
    if powershell_commands:
        fallbacks.append(
            build_helper_fallback(
                recommendation_id,
                {
                    "method": "powershell",
                    "role": "remediation",
                    "title": "PowerShell",
                    "rawText": extract_excerpt(
                        remediation_text, powershell_commands[0]
                    ),
                    "commands": powershell_commands,
                },
            )
        )

    group_policy_paths = unique_preserving_order(
        WINDOWS_GROUP_POLICY_PATH_RE.findall(combined_text)
    )
    if group_policy_paths:
        fallbacks.append(
            build_helper_fallback(
                recommendation_id,
                {
                    "method": "group-policy-path",
                    "role": "remediation",
                    "title": "Group Policy",
                    "rawText": extract_excerpt(combined_text, group_policy_paths[0]),
                    "groupPolicyPaths": group_policy_paths,
                },
            )
        )

    registry_paths = unique_preserving_order(
        extract_windows_registry_paths(combined_text)
    )
    if registry_paths:
        fallbacks.append(
            build_helper_fallback(
                recommendation_id,
                {
                    "method": "registry-reference",
                    "role": "audit",
                    "title": "Registry reference",
                    "rawText": extract_excerpt(combined_text, registry_paths[0]),
                    "registryPaths": registry_paths,
                },
            )
        )

    return fallbacks


def extract_windows_registry_paths(text: str) -> list[str]:
    """Find Windows registry paths embedded in CIS audit/remediation text."""
    paths: list[str] = []
    roots = ("HKLM\\", "HKCU\\", "HKEY_")
    for root in roots:
        start = 0
        while True:
            index = text.find(root, start)
            if index == -1:
                break
            path = read_windows_registry_path(text, index)
            if path is not None:
                paths.append(path)
                start = index + len(path)
            else:
                start = index + len(root)
    return paths


def read_windows_registry_path(text: str, start: int) -> str | None:
    """Read one bounded Windows registry path starting at a known root offset."""
    allowed = set(
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .(){}:/_-\\"
    )
    end = start
    while end < len(text) and text[end] in allowed:
        end += 1
    candidate = text[start:end].strip()
    if "\\" not in candidate:
        return None
    if candidate.startswith("HKEY_"):
        root, separator, rest = candidate.partition("\\")
        if (
            separator == ""
            or not root.removeprefix("HKEY_").replace("_", "").isalpha()
            or "\\" not in rest
        ):
            return None
    return candidate.rstrip(" .")


def extract_macos_helper_fallbacks(
    recommendation_id: str, remediation_lines: list[str]
) -> list[dict[str, Any]]:
    """Extract macOS terminal and profile-method fallback evidence."""
    fallbacks: list[dict[str, Any]] = []
    for index, block in enumerate(
        split_macos_method_blocks(remediation_lines), start=1
    ):
        if block["label"] == "Terminal Method":
            commands = extract_terminal_commands(block["rawText"])
            if commands:
                fallbacks.append(
                    build_helper_fallback(
                        recommendation_id,
                        {
                            "method": "terminal",
                            "role": "remediation",
                            "title": "Terminal Method",
                            "rawText": block["rawText"],
                            "commands": commands,
                            "index": index,
                        },
                    )
                )
        if block["label"] == "Profile Method":
            profile_payload_type = extract_profile_payload_type(block["text"])
            profile_keys = extract_profile_keys(block["text"])
            if profile_payload_type is not None or profile_keys:
                fallbacks.append(
                    build_helper_fallback(
                        recommendation_id,
                        {
                            "method": "profile-method",
                            "role": "remediation",
                            "title": "Profile Method",
                            "rawText": block["rawText"],
                            "profilePayloadType": profile_payload_type,
                            "profileKeys": profile_keys,
                            "index": index,
                        },
                    )
                )
    return fallbacks


def split_macos_method_blocks(remediation_lines: list[str]) -> list[dict[str, str]]:
    """Split macOS remediation text into graphical, terminal, and profile blocks."""
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
    """Extract shell commands from CIS terminal-method remediation text."""
    commands: list[str] = []
    current_command: str | None = None
    for line in raw_text.splitlines():
        stripped = line.strip()
        if not stripped:
            if current_command is not None:
                commands.append(
                    trim_at_markers(
                        current_command.strip(), TERMINAL_COMMAND_STOP_MARKERS
                    ).strip()
                )
                current_command = None
            continue
        if "% " in stripped:
            if current_command is not None:
                commands.append(
                    trim_at_markers(
                        current_command.strip(), TERMINAL_COMMAND_STOP_MARKERS
                    ).strip()
                )
            current_command = stripped.split("% ", 1)[1].strip()
            continue
        if current_command is None:
            continue
        if is_terminal_stop_line(stripped):
            commands.append(
                trim_at_markers(
                    current_command.strip(), TERMINAL_COMMAND_STOP_MARKERS
                ).strip()
            )
            current_command = None
            continue
        current_command = f"{current_command} {stripped}".strip()
    if current_command is not None:
        commands.append(
            trim_at_markers(
                current_command.strip(), TERMINAL_COMMAND_STOP_MARKERS
            ).strip()
        )
    return unique_preserving_order(commands)


def extract_profile_payload_type(text: str) -> str | None:
    """Extract the macOS configuration profile payload type from CIS text."""
    match = MACOS_PROFILE_PAYLOAD_TYPE_RE.search(text)
    if match is None:
        return None
    return match.group(1)


def extract_profile_keys(text: str) -> list[dict[str, str]]:
    """Extract unique macOS profile key/value hints from CIS profile text."""
    keys = [
        {
            "key": key,
            "value": normalize_space(value).rstrip("."),
        }
        for key, value in MACOS_PROFILE_KEY_RE.findall(text)
    ]
    return unique_profile_keys(keys)
