"""Assurance generation and retained snapshot contracts."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


TOOLS_DIR = Path(__file__).resolve().parents[2] / "tools"
if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))


class AssurancePipelineContractsTest(unittest.TestCase):
    def test_bsi_refresh_failure_retains_previous_snapshot(self) -> None:
        """Do not promote a partial official-source refresh."""

        from _harvest_bsi_grundschutz_modules import bsi_source_refresh

        sources = [
            {"id": "one", "url": "https://www.bsi.bund.de/one"},
            {"id": "two", "url": "https://www.bsi.bund.de/two"},
        ]
        with tempfile.TemporaryDirectory() as workspace:
            bsi_dir = Path(workspace) / "bsi-references"
            downloads = bsi_dir / "downloads"
            downloads.mkdir(parents=True)
            retained = downloads / "retained.txt"
            retained.write_text("previous\n")
            with (
                patch.object(bsi_source_refresh, "BSI_DIR", bsi_dir),
                patch.object(bsi_source_refresh, "read_json", return_value=sources),
                patch.object(
                    bsi_source_refresh,
                    "download_source",
                    side_effect=[
                        {
                            "id": "one",
                            "finalUrl": "https://www.bsi.bund.de/one",
                            "sha256": "a" * 64,
                            "sizeBytes": 1,
                        },
                        RuntimeError("network failure"),
                    ],
                ),
            ):
                status = bsi_source_refresh.refresh_bsi_sources()
            self.assertEqual(status["outcome"], "failed-retained-previous-snapshot")
            self.assertTrue(status["retainedPreviousSnapshot"])
            self.assertEqual(retained.read_text(), "previous\n")

    def test_assurance_artifacts_reconcile_every_source_mapping_and_preset(
        self,
    ) -> None:
        """Require complete recommendation/mapping coverage and fail-closed presets."""

        from _build_relution_import_artifacts_modules.assurance_sources import (
            canonical_digest,
        )

        root = TOOLS_DIR.parent
        coverage_root = root / "example" / "recommendation-coverage"
        catalog = json.loads((coverage_root / "assurance-catalog.json").read_text())
        presets = json.loads((coverage_root / "assurance-presets.json").read_text())
        reconciliation = json.loads(
            (coverage_root / "assurance-reconciliation.json").read_text()
        )
        source_catalogs = [
            json.loads(path.read_text())
            for path in (
                root / "example" / "bsi-references" / "bsi-recommendations.json",
                root / "example" / "cis-references" / "cis-recommendations.json",
                root / "example" / "vendor-references" / "vendor-recommendations.json",
            )
        ]
        source_rows = [row for rows in source_catalogs for row in rows]
        declared_mappings = sum(
            len(row.get("relutionMapping", {}).get("rulesetMappings", []))
            + len(row.get("relutionMapping", {}).get("candidates", []))
            for row in source_rows
        )

        self.assertEqual(len(catalog["recommendations"]), len(source_rows))
        self.assertEqual(
            sum(catalog["summary"]["byDisposition"].values()), len(source_rows)
        )
        self.assertEqual(reconciliation["mappingCount"], declared_mappings)
        self.assertEqual(presets["catalogDigest"], canonical_digest(catalog))
        for row in catalog["recommendations"]:
            self.assertTrue(row["applicability"]["predicates"])
            if row["selectable"]:
                self.assertIn(row["disposition"], {"supported", "parameter"})
                self.assertIn(
                    row["mapping"]["family"],
                    {
                        "relution-native",
                        "apple-schema-profile",
                        "apple-mobileconfig",
                    },
                )
                self.assertTrue(row["constraints"])
        self.assertTrue(
            next(
                preset
                for preset in presets["presets"]
                if preset["id"] == "high-assurance"
            )["requiresReadinessReview"]
        )
        self.assertEqual(catalog["summary"]["byDisposition"]["organizational"], 27)
        self.assertEqual(
            {
                constraint["operator"]
                for row in catalog["recommendations"]
                for constraint in row["constraints"]
            },
            {"equals", "atLeast", "atMost", "containsAll"},
        )
        source_ids = {source["sourceId"] for source in catalog["sources"]}
        for row in catalog["recommendations"]:
            self.assertIn(row["sourceId"], source_ids)
            self.assertEqual(row["sourceId"], row["provenance"]["sourceId"])
            self.assertIn(row["sourceId"], row["provenance"]["evidence"])

    def test_assurance_presets_are_explicit_curated_profiles(self) -> None:
        """Keep product presets narrow and preserve failed candidates as exclusions."""

        path = (
            TOOLS_DIR.parent
            / "example"
            / "recommendation-coverage"
            / "assurance-presets.json"
        )
        presets = {row["id"]: row for row in json.loads(path.read_text())["presets"]}
        self.assertEqual(
            {row["recommendationId"] for row in presets["essential"]["selections"]},
            {
                "bsi:macos-sys-2-4-a10",
                "cis:cis-apple-ios-26-1-0-0-2-4-3",
                "cis:cis-apple-ios-26-1-0-0-3-4-3",
                "vendor:android-001-enforcegoogleplayprotectonmanageddevices",
                "vendor:macos-006-keepgatekeeperassessmentenabled",
                "vendor:windows-0373-enabledomainnetworkfirewall",
                "vendor:windows-0380-enableprivatenetworkfirewall",
                "vendor:windows-0387-enablepublicnetworkfirewall",
            },
        )
        self.assertEqual(
            {row["recommendationId"] for row in presets["managed"]["selections"]},
            {
                "bsi:android-enterprise-sys-3-2-4-a2",
                "cis:cis-apple-ios-26-1-0-0-2-2-1-3",
                "cis:cis-apple-ios-26-1-0-0-3-2-1-9",
                "vendor:android-002-blockinstallationfromunknownsourcesbydefault",
                "vendor:macos-001-enablefilevaultonmanagedmacs",
                "vendor:macos-002-escrowapersonalrecoverykeyforfilevault",
            },
        )
        self.assertEqual(
            {
                row["recommendationId"]
                for row in presets["high-assurance"]["selections"]
            },
            {
                "cis:cis-apple-ios-26-1-0-0-3-2-1-7",
                "cis:cis-apple-macos-26-tahoe-1-0-0-2-3-1-1",
                "vendor:android-013-requireaseparateworkprofilesecuritychallenge",
                "vendor:windows-0348-cloudblocklevel",
            },
        )
        essential_exclusions = {
            row["recommendationId"]: row["reason"]
            for row in presets["essential"]["exclusions"]
        }
        self.assertIn("cis:cis-google-android-1-6-0-1-17", essential_exclusions)
        self.assertIn(
            "failed closed", essential_exclusions["cis:cis-google-android-1-6-0-1-17"]
        )

    def test_assurance_digest_matches_javascript_canonical_json(self) -> None:
        """Keep Python-generated digests byte-equivalent to the Node runtime."""

        from _build_relution_import_artifacts_modules.assurance_sources import (
            canonical_digest,
        )

        path = (
            TOOLS_DIR.parent
            / "example"
            / "recommendation-coverage"
            / "assurance-catalog.json"
        )
        catalog = json.loads(path.read_text())
        script = """
const fs = require('node:fs');
const crypto = require('node:crypto');
const sort = (v) => Array.isArray(v) ? v.map(sort) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])])) : v;
process.stdout.write(crypto.createHash('sha256').update(JSON.stringify(sort(JSON.parse(fs.readFileSync(process.argv[1], 'utf8'))))).digest('hex'));
"""
        javascript_digest = subprocess.run(
            ["node", "-e", script, str(path)],
            check=True,
            capture_output=True,
            text=True,
        ).stdout
        self.assertEqual(javascript_digest, canonical_digest(catalog))

    def test_similarity_only_exact_mapping_fails_semantic_audit(self) -> None:
        """Do not promote low-score label matches from schema shape alone."""

        from _build_relution_import_artifacts_modules.assurance_schema_validation import (
            MappingSchema,
            audit_mapping,
        )

        schema = MappingSchema(
            family="relution-native",
            target="IOS_RESTRICTION",
            platforms=frozenset({"IOS"}),
            enrollment_channels=(),
            fields={"allowSimple": {"path": "allowSimple", "kind": "boolean"}},
            evidence="test-schema",
        )
        audit = audit_mapping(
            {
                "kind": "relution-native",
                "type": "IOS_RESTRICTION",
                "values": {"allowSimple": False},
                "match": {
                    "score": 25,
                    "valueCompatibility": "boolean-state",
                    "reason": "Exact boolean mapping inferred from matching setting label.",
                },
            },
            "IOS",
            {("relution-native", "IOS_RESTRICTION"): schema},
            role="exact",
            mapping_id="test-low-score",
        )
        self.assertEqual(audit["outcome"], "invalid")
        self.assertEqual(audit["semanticEvidence"]["outcome"], "unverified")

    def test_assurance_snapshot_index_is_digest_addressed_and_confined(self) -> None:
        """Keep historical catalog, preset, and detail records under the fixed root."""

        from _build_relution_import_artifacts_modules.assurance_sources import (
            canonical_digest,
        )

        root = TOOLS_DIR.parent
        snapshot_root = (
            root / "example" / "recommendation-coverage" / "assurance-snapshots"
        ).resolve()
        index = json.loads((snapshot_root / "index.json").read_text())
        current = next(
            row
            for row in index["entries"]
            if row["snapshotDigest"] == index["currentSnapshotDigest"]
        )
        loaded = {}
        for field in ("catalogPath", "presetsPath", "detailsPath"):
            path = (root / current[field]).resolve()
            self.assertIn(snapshot_root, path.parents)
            loaded[field] = json.loads(path.read_text())
        self.assertEqual(
            current["snapshotDigest"],
            canonical_digest(
                {
                    "catalog": loaded["catalogPath"],
                    "presets": loaded["presetsPath"],
                }
            ),
        )
        self.assertEqual(
            current["detailsDigest"], canonical_digest(loaded["detailsPath"])
        )

    def test_generated_ruleset_ids_are_unique_with_source_traceability(self) -> None:
        """Prevent variant policies from emitting ambiguous repeated generated ids."""

        root = TOOLS_DIR.parent
        for path in sorted((root / "example").glob("*-references/*-ruleset.json")):
            ruleset = json.loads(path.read_text())
            rules = [rule for policy in ruleset["policies"] for rule in policy["rules"]]
            identifiers = [rule["id"] for rule in rules]
            self.assertEqual(len(identifiers), len(set(identifiers)), path)
            for rule in rules:
                if "--policy-" in rule["id"]:
                    self.assertTrue(rule["generatedIdentity"]["baseRuleId"])
