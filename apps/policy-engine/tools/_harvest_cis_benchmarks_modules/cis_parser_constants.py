"""Constants for CIS benchmark parsing."""
from __future__ import annotations

import re

from _harvest_cis_benchmarks_modules.cis_benchmarks import CIS_DIR, REPO_ROOT

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
