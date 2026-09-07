#!/usr/bin/env python3
"""Reconcile tracked BSI/CIS recommendation IDs with cached PDF evidence."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from _build_mdm_reconciliation_cis import cis_rows


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "mdm" / "evidence" / "source-manifest.json"
OUTPUT = ROOT / "mdm" / "evidence" / "recommendation-reconciliation.json"


def load_json(path: Path) -> Any:
    """Load UTF-8 JSON."""

    return json.loads(path.read_text(encoding="utf8"))


def source_index(manifest: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Index cache records by both cache and recovered repository paths."""

    result: dict[str, dict[str, Any]] = {}
    marker = "private/source-pdfs-cache/"
    for source in manifest["sources"]:
        path = str(source["local_path"])
        result[path] = source
        if marker in path:
            result[path.split(marker, 1)[1]] = source
    return result


def mapping_flag(recommendation: dict[str, Any]) -> str:
    """Classify recommendation mapping support without treating candidates as exact."""

    status = str(recommendation.get("relutionMapping", {}).get("status", "unknown"))
    return "supported" if status == "exact" else f"unsupported-{status}"


def bsi_source_for(
    recommendation: dict[str, Any], sources: list[dict[str, Any]]
) -> dict[str, Any] | None:
    """Find the individual Grundschutz module PDF for a BSI recommendation."""

    module_id = str(recommendation.get("moduleId", ""))
    prefix = f"/Einzeln_PDF/{module_id} "
    return next(
        (source for source in sources if prefix in str(source["local_path"])), None
    )


def bsi_rows(manifest: dict[str, Any]) -> list[dict[str, Any]]:
    """Build BSI rows and state the XML/XLSX-to-PDF page limitation explicitly."""

    recommendations = load_json(
        ROOT / "example" / "bsi-references" / "bsi-recommendations.json"
    )
    rows = []
    for recommendation in recommendations:
        source = bsi_source_for(recommendation, manifest["sources"])
        rows.append(
            {
                "recommendation_id": recommendation["id"],
                "control_id": recommendation["requirementId"],
                "pdf_sha256": None if source is None else source["sha256"],
                "pdf_path": None if source is None else source["local_path"],
                "page": None,
                "verification": "unverifiable-page",
                "reason": "record was generated from DocBook/XML and checklist XLSX; no deterministic PDF page alignment is stored",
                "mapping": mapping_flag(recommendation),
            }
        )
    return rows


def main() -> None:
    """Write the deterministic, body-free reconciliation ledger."""

    manifest = load_json(MANIFEST)
    index = source_index(manifest)
    rows = [*bsi_rows(manifest), *cis_rows(index, ROOT, mapping_flag)]
    payload = {
        "schema_version": 1,
        "generated_by": "tools/build_mdm_reconciliation.py",
        "contains_source_bodies": False,
        "rows": rows,
    }
    OUTPUT.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf8")
    print(f"Wrote {OUTPUT.relative_to(ROOT)} with {len(rows)} recommendation rows")


if __name__ == "__main__":
    main()
