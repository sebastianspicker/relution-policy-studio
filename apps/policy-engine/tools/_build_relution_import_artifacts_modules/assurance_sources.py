"""Versioned source provenance and conservative freshness reporting."""

from __future__ import annotations

import hashlib
import json
import math
import re
from typing import Any
from urllib.parse import urlparse

from .artifact_io_json import read_json, write_json
from .artifact_paths import SOURCE_CONFIGS, SOURCE_REFRESH_REPORT_PATH


CHECKED_AT = "2026-09-07"
REFRESH_REPORT_RELATIVE_PATH = (
    "example/recommendation-coverage/source-refresh-report.json"
)
CIS_TERMS_URL = "https://www.cisecurity.org/terms-of-use-for-non-member-cis-products"
FRESHNESS_OVERRIDES = {
    "cis:cis-windows-desktop-family": {
        "freshnessState": "outdated",
        "outcome": "newer-edition-observed-not-imported",
        "observedEditions": ["Microsoft Windows 11 Enterprise (5.1.0)"],
        "evidenceUrl": "https://www.cisecurity.org/benchmark/microsoft_windows_desktop",
    },
    "cis:cis-apple-macos-family": {
        "freshnessState": "outdated",
        "outcome": "newer-editions-observed-not-imported",
        "observedEditions": [
            "Apple macOS 26 Tahoe (1.1.0)",
            "Apple macOS 15.0 Sequoia (2.1.0)",
            "Apple macOS 14.0 Sonoma (3.1.0)",
        ],
        "evidenceUrl": "https://www.cisecurity.org/benchmark/apple_os",
    },
    "cis:cis-google-android-family": {
        "freshnessState": "unknown",
        "outcome": "no-newer-edition-observed-but-currentness-not-claimed",
        "observedEditions": ["Google Android (1.6.0)"],
        "evidenceUrl": "https://www.cisecurity.org/benchmark/google_android",
    },
    "cis:cis-apple-ios-family": {
        "freshnessState": "unknown",
        "outcome": "no-newer-edition-observed-but-currentness-not-claimed",
        "observedEditions": ["Apple iOS 26 (1.0.0)", "Apple iPadOS 26 (1.0.0)"],
        "evidenceUrl": "https://www.cisecurity.org/benchmark/apple_ios",
    },
    "vendor:microsoft-intune-windows-mdm-baseline-settings": {
        "freshnessState": "unknown",
        "outcome": "version-25H2-observed-but-currentness-not-claimed",
        "observedEditions": ["Security Baseline for Windows, version 25H2"],
        "evidenceUrl": "https://learn.microsoft.com/en-us/intune/device-security/security-baselines/ref-windows-mdm-settings",
    },
}


def canonical_digest(value: Any) -> str:
    """Hash a canonical JSON value without depending on pretty-print bytes."""

    encoded = json.dumps(
        canonical_json_value(value),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf8")
    return hashlib.sha256(encoded).hexdigest()


def canonical_json_value(value: Any) -> Any:
    """Normalize JSON numbers to the finite representation used by JSON.stringify."""

    if isinstance(value, dict):
        return {str(key): canonical_json_value(child) for key, child in value.items()}
    if isinstance(value, list):
        return [canonical_json_value(child) for child in value]
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError("Canonical assurance JSON forbids non-finite numbers")
        if value == 0 or value.is_integer():
            return int(value)
    return value


def build_source_provenance() -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
    """Build source records and an index keyed by source-qualified source id."""

    records = []
    for source, config in sorted(SOURCE_CONFIGS.items()):
        sources = read_json(config.root / "sources.json")
        manifest_path = config.root / "downloads" / "manifest.json"
        manifest = read_json(manifest_path) if manifest_path.exists() else []
        manifest_by_id = {
            row["id"]: row
            for row in manifest
            if isinstance(row, dict) and isinstance(row.get("id"), str)
        }
        for raw in sources:
            source_id = f"{source}:{raw['id']}"
            snapshot = manifest_by_id.get(raw["id"], {})
            refresh = refresh_for(source_id)
            records.append(source_record(source, source_id, raw, snapshot, refresh))
    records.sort(key=lambda row: row["sourceId"])
    return records, {row["sourceId"]: row for row in records}


def source_record(
    source: str,
    source_id: str,
    raw: dict[str, Any],
    snapshot: dict[str, Any],
    refresh: dict[str, Any],
) -> dict[str, Any]:
    """Normalize one source and its retained snapshot without freshness inflation."""

    url = str(raw.get("url", ""))
    digest = snapshot.get("sha256") or canonical_digest(raw)
    return {
        "sourceId": source_id,
        "title": str(raw.get("title", raw["id"])),
        "edition": edition_for(raw),
        "publicationDate": iso_date_or_none(raw.get("document_date")),
        "retrievedAt": snapshot.get("downloadedAt"),
        "lastCheckedAt": raw.get("verified_as_of"),
        "jurisdiction": "DE" if source == "bsi" else "not-stated",
        "authority": authority_for(source, url),
        "url": url,
        "license": license_for(source),
        "digest": digest,
        "snapshot": {
            "bodyDigestAvailable": isinstance(snapshot.get("sha256"), str),
            "localPath": snapshot.get("localPath"),
            "digestKind": "sha256-body"
            if snapshot.get("sha256")
            else "sha256-source-metadata",
        },
        "refresh": refresh,
    }


def edition_for(source: dict[str, Any]) -> str:
    """Return only edition text explicitly present in the source ledger."""

    versions = source.get("current_versions")
    if isinstance(versions, list) and versions:
        return "; ".join(str(value) for value in versions)
    return str(source.get("document_date") or "not-stated")


def iso_date_or_none(value: Any) -> str | None:
    """Keep publicationDate machine-readable without inventing a date."""

    if isinstance(value, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return value
    return None


def authority_for(source: str, url: str) -> str:
    """Identify the named publisher from source namespace and stable host."""

    if source == "bsi":
        return "Bundesamt für Sicherheit in der Informationstechnik (BSI)"
    if source == "cis":
        return "Center for Internet Security (CIS)"
    hostname = (urlparse(url).hostname or "").lower()
    if "microsoft" in hostname:
        return "Microsoft"
    if "google" in hostname or "android" in hostname:
        return "Google"
    if "apple" in hostname:
        return "Apple"
    return "vendor publisher named by source URL"


def license_for(source: str) -> str:
    """Return the recorded reuse posture without expanding publisher rights."""

    if source == "cis":
        return f"CIS non-member terms apply; snapshots are local evidence and are not redistributed ({CIS_TERMS_URL})"
    if source == "bsi":
        return "BSI publication terms; verify reuse terms before redistribution"
    return (
        "Publisher documentation terms; local evidence and short normalized facts only"
    )


def refresh_for(source_id: str) -> dict[str, Any]:
    """Return a freshness result that never equates retrieval with currentness."""

    override = FRESHNESS_OVERRIDES.get(source_id, {})
    return {
        "freshnessState": override.get("freshnessState", "unknown"),
        "checkedAt": CHECKED_AT if override else None,
        "outcome": override.get("outcome", "not-live-checked-in-this-refresh"),
        "reportPath": REFRESH_REPORT_RELATIVE_PATH,
    }


def write_source_refresh_report(sources: list[dict[str, Any]]) -> None:
    """Write deterministic refresh evidence while keeping retained bytes addressable."""

    snapshots = [
        {
            "sourceId": source["sourceId"],
            "digest": source["digest"],
            "digestKind": source["snapshot"]["digestKind"],
            "localPath": source["snapshot"]["localPath"],
            "retrievedAt": source["retrievedAt"],
            "retained": True,
        }
        for source in sources
    ]
    checks = []
    for source_id, evidence in sorted(FRESHNESS_OVERRIDES.items()):
        source = next(row for row in sources if row["sourceId"] == source_id)
        checks.append(
            {
                "sourceId": source_id,
                "checkedAt": CHECKED_AT,
                "outcome": evidence["outcome"],
                "freshnessState": evidence["freshnessState"],
                "trackedEdition": source["edition"],
                "observedEditions": evidence["observedEditions"],
                "evidenceUrl": evidence["evidenceUrl"],
                "imported": False,
            }
        )
    vendor_status_path = (
        SOURCE_REFRESH_REPORT_PATH.parent / "vendor-refresh-status.json"
    )
    bsi_status_path = SOURCE_REFRESH_REPORT_PATH.parent / "bsi-refresh-status.json"
    bsi_status = (
        read_json(bsi_status_path)
        if bsi_status_path.exists()
        else {
            "outcome": "not-attempted-in-recorded-refresh",
            "retainedPreviousSnapshot": True,
            "checks": [],
        }
    )
    vendor_status = (
        read_json(vendor_status_path)
        if vendor_status_path.exists()
        else {
            "outcome": "not-attempted-in-recorded-refresh",
            "retainedPreviousSnapshot": True,
        }
    )
    write_json(
        SOURCE_REFRESH_REPORT_PATH,
        {
            "schemaVersion": 1,
            "checkedAt": CHECKED_AT,
            "freshnessPolicy": "retrieval-or-check-time-alone-never-means-current",
            "refreshAttempt": {
                "bsi": {
                    **bsi_status,
                    "retainedPreviousSnapshotOnFailure": True,
                },
                "vendor": {
                    **vendor_status,
                    "retainedPreviousSnapshotOnFailure": True,
                    "scope": "official-source-bodies-and-regenerated-vendor-catalog",
                },
                "cis": {
                    "outcome": "metadata-check-only-no-import",
                    "retainedPreviousSnapshot": True,
                    "termsUrl": CIS_TERMS_URL,
                },
            },
            "checks": checks,
            "retainedSnapshots": snapshots,
        },
    )
