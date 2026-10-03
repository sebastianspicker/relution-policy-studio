"""Offline contracts for the Python recommendation and artifact pipelines."""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import call, patch


TOOLS_DIR = Path(__file__).resolve().parents[2] / "tools"
if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))


class OfflinePipelineContractsTest(unittest.TestCase):
    def test_vendor_refresh_failure_retains_previous_snapshot(self) -> None:
        """A partial network failure must not replace the checked snapshot tree."""

        from _harvest_vendor_guidance_modules import vendor_source_refresh

        with tempfile.TemporaryDirectory() as workspace:
            vendor_dir = Path(workspace) / "vendor-references"
            downloads = vendor_dir / "downloads"
            downloads.mkdir(parents=True)
            retained = downloads / "retained.json"
            retained.write_text('{"snapshot":"previous"}\n')
            with (
                patch.object(
                    vendor_source_refresh,
                    "read_json",
                    return_value=[{"id": "one"}, {"id": "two"}],
                ),
                patch.object(
                    vendor_source_refresh,
                    "refresh_vendor_source",
                    side_effect=[{"id": "one"}, RuntimeError("network failure")],
                ),
                self.assertRaisesRegex(RuntimeError, "network failure"),
            ):
                vendor_source_refresh.refresh_downloads(vendor_dir)
            self.assertEqual(retained.read_text(), '{"snapshot":"previous"}\n')

    def test_selected_sources_normalize_before_one_global_generation(self) -> None:
        """Keep source work ordered while retaining one pre-run report baseline."""

        from _build_relution_import_artifacts_modules import orchestration

        events: list[tuple[str, object]] = []
        previous_source_rows = [{"sourceId": "first-source"}]
        previous_mapping_rows = [{"globalRecommendationId": "bsi:first"}]

        with (
            patch.object(
                orchestration,
                "previous_source_change_rows",
                return_value=previous_source_rows,
            ),
            patch.object(
                orchestration,
                "previous_relution_mapping_change_rows",
                return_value=previous_mapping_rows,
            ),
            patch.object(
                orchestration,
                "normalize_source_recommendations",
                side_effect=lambda source: events.append(("normalize", source))
                or [{"id": source}],
            ),
            patch.object(
                orchestration,
                "build_source_catalog_artifacts",
                side_effect=lambda source, rows: events.append(
                    ("source", (source, rows[0]["id"]))
                ),
            ),
            patch.object(orchestration, "build_global_artifacts") as global_build,
        ):
            orchestration.build_artifacts_for_sources(["bsi", "cis", "vendor"])

        self.assertEqual(
            events,
            [
                ("normalize", "bsi"),
                ("normalize", "cis"),
                ("normalize", "vendor"),
                ("source", ("bsi", "bsi")),
                ("source", ("cis", "cis")),
                ("source", ("vendor", "vendor")),
            ],
        )
        global_build.assert_called_once_with(
            previous_source_rows, previous_mapping_rows
        )

    def test_global_generation_receives_pre_run_baselines(self) -> None:
        """Pass the original source and mapping rows through the final generators."""

        from _build_relution_import_artifacts_modules import orchestration

        previous_source_rows = [{"sourceId": "first-source"}]
        previous_mapping_rows = [{"globalRecommendationId": "bsi:first"}]
        result = ({"bsi:first": {}}, {"rows": []}, {"rows": []}, "timestamp")
        with (
            patch.object(orchestration, "build_coverage_matrix"),
            patch.object(orchestration, "build_semantic_index"),
            patch.object(orchestration, "build_unified_recommendation_analysis"),
            patch.object(
                orchestration,
                "build_mapping_candidate_review_artifacts",
                return_value=result,
            ) as review_build,
            patch.object(
                orchestration, "build_relution_mapping_update_artifacts"
            ) as mapping_build,
        ):
            orchestration.build_global_artifacts(
                previous_source_rows, previous_mapping_rows
            )

        review_build.assert_called_once_with(previous_source_rows)
        mapping_build.assert_called_once_with(*result, previous_mapping_rows)

    def test_guideline_wrapper_defers_harvester_artifacts_but_standalone_does_not(
        self,
    ) -> None:
        """Let the wrapper batch global work while preserving standalone defaults."""

        from _guideline_mapping_update_modules.contracts import OFFLINE_SOURCE_COMMANDS
        from _harvest_vendor_guidance_modules import vendor_sources

        self.assertTrue(
            all(
                "--defer-artifacts" in command
                for command in OFFLINE_SOURCE_COMMANDS.values()
            )
        )
        with patch.object(vendor_sources, "harvest_vendor_guidance") as harvest:
            with patch.object(sys, "argv", ["harvest_vendor_guidance.py", "--offline"]):
                vendor_sources.main()
            with patch.object(
                sys,
                "argv",
                [
                    "harvest_vendor_guidance.py",
                    "--offline",
                    "--defer-artifacts",
                ],
            ):
                vendor_sources.main()

        self.assertEqual(
            harvest.call_args_list,
            [
                call(vendor_sources.REPO_ROOT, False, build_artifacts=True),
                call(vendor_sources.REPO_ROOT, False, build_artifacts=False),
            ],
        )

    def test_prepared_reference_matching_matches_legacy_results(self) -> None:
        """Preserve scores, tie breaks, limits, and output shapes with cached sets."""

        from _build_relution_import_artifacts_modules.semantic_reference_matching import (
            nearest_exact_references,
            prepare_exact_references,
        )

        references = [
            {
                "mappingId": "m2",
                "source": "cis",
                "recommendationId": "2",
                "language": "en",
                "title": "second",
                "platform": "ios",
                "normalizedTokens": ["passcode", "length", "shared"],
                "semanticConceptIds": ["authentication"],
                "mapping": {"kind": "relution-native", "target": "b"},
            },
            {
                "mappingId": "m1",
                "source": "bsi",
                "recommendationId": "1",
                "language": "de",
                "title": "first",
                "platform": "ios",
                "normalizedTokens": ["passcode", "minimum", "shared"],
                "semanticConceptIds": ["authentication"],
                "mapping": {"kind": "relution-native", "target": "a"},
            },
            {
                "mappingId": "m3",
                "source": "vendor",
                "recommendationId": "3",
                "language": "en",
                "title": "third",
                "platform": "macos",
                "normalizedTokens": ["shared"],
                "semanticConceptIds": [],
                "mapping": {"kind": "apple-mobileconfig", "target": "c"},
            },
        ]
        expected = self._legacy_nearest_exact_references(
            "ios",
            ["passcode", "shared"],
            ["authentication"],
            references,
            limit=2,
        )
        prepared = prepare_exact_references(references)
        references[0]["normalizedTokens"].append("later-mutation")

        self.assertIsInstance(prepared[0].tokens, frozenset)
        self.assertIsInstance(prepared[0].concepts, frozenset)
        self.assertNotIn("later-mutation", prepared[0].tokens)
        self.assertEqual(
            nearest_exact_references(
                "ios",
                ["passcode", "shared"],
                ["authentication"],
                prepared,
                limit=2,
            ),
            expected,
        )

    @staticmethod
    def _legacy_nearest_exact_references(
        platform: str,
        tokens: list[str],
        semantic_ids: list[str],
        references: list[dict[str, object]],
        *,
        limit: int,
    ) -> list[dict[str, object]]:
        """Small test oracle for the prior public matching behavior."""

        scored = []
        token_set = set(tokens)
        concept_set = set(semantic_ids)
        for reference in references:
            reference_tokens = set(reference.get("normalizedTokens", []))
            reference_concepts = set(reference.get("semanticConceptIds", []))
            shared_tokens = sorted(token_set & reference_tokens)
            shared_concepts = sorted(concept_set & reference_concepts)
            score = min(40, len(shared_concepts) * 20) + min(40, len(shared_tokens) * 4)
            if platform == reference.get("platform"):
                score += 20
            if score > 20:
                scored.append((score, reference, shared_tokens, shared_concepts))
        scored.sort(
            key=lambda item: (
                -item[0],
                str(item[1]["source"]),
                str(item[1]["recommendationId"]),
                str(item[1]["mappingId"]),
            )
        )
        return [
            {
                "mappingId": reference["mappingId"],
                "source": reference["source"],
                "recommendationId": reference["recommendationId"],
                "language": reference["language"],
                "title": reference["title"],
                "score": score,
                "sharedTokens": shared_tokens[:12],
                "sharedSemanticConceptIds": shared_concepts,
                "mapping": reference["mapping"],
            }
            for score, reference, shared_tokens, shared_concepts in scored[:limit]
        ]

    def test_policy_comparison_cli_generates_deterministic_temp_artifacts(self) -> None:
        """Run the comparison workflow against an isolated checked-in-style corpus."""

        corpus = {
            "windows-policies.md": "## WIN-TEST-001 Windows baseline\n\nBitLocker and password policy.\n",
            "macos-policies.md": "## MAC-TEST-001 macOS baseline\n\nFileVault and firewall policy.\n",
            "ios-ipados-policies.md": "## IOS-TEST-001 iOS baseline\n\nPasscode and restriction policy.\n",
            "android-policies.md": "## AND-TEST-001 Android baseline\n\nManaged Play Store policy.\n",
        }
        with tempfile.TemporaryDirectory() as workspace:
            workspace_path = Path(workspace)
            corpus_root = workspace_path / "corpus"
            catalog_root = (
                corpus_root / "docs" / "managed-devices" / "05-policies-catalog"
            )
            catalog_root.mkdir(parents=True)
            for filename, content in corpus.items():
                (catalog_root / filename).write_text(content, encoding="utf8")
            output_root = workspace_path / "output"
            result = subprocess.run(
                [
                    sys.executable,
                    str(TOOLS_DIR / "compare_institution_policy_baseline.py"),
                    "--institution-root",
                    str(corpus_root),
                    "--output-root",
                    str(output_root),
                ],
                check=True,
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.stdout, "")
            generated = json.loads(
                (output_root / "institution-vs-relution-baseline.json").read_text(
                    encoding="utf8"
                )
            )

        self.assertEqual(generated["summary"]["institutionPolicies"], 4)
        self.assertEqual(
            hashlib.sha256(
                json.dumps(
                    generated["summary"], sort_keys=True, separators=(",", ":")
                ).encode("utf8")
            ).hexdigest(),
            "28b78b5f001131345af3e2e18a2061e6186cd79420b903c4a1d06a0792ac95ab",
        )

    def test_checked_in_baseline_fixture_has_stable_offline_pipeline_hash(self) -> None:
        """Exercise the complete baseline projection from checked-in artifacts only."""

        from institution_policy_comparison.baseline import (
            harvest_relution_baseline_index,
        )
        from institution_policy_comparison.constants import (
            BASELINE_TEMPLATE_INDEX_PATH,
        )

        index = harvest_relution_baseline_index(BASELINE_TEMPLATE_INDEX_PATH)
        stable_index = {
            key: value for key, value in index.items() if key != "generatedAt"
        }
        encoded = json.dumps(
            stable_index, ensure_ascii=False, sort_keys=True, separators=(",", ":")
        ).encode("utf8")

        self.assertEqual(
            index["baselineTemplateIndexPath"],
            "example/relution-baseline-templates/index.json",
        )
        self.assertEqual(len(index["actionableTargets"]), 183)
        self.assertEqual(
            hashlib.sha256(encoded).hexdigest(),
            "c4397e7ec3e4653c8fb0721cdd89ee87f34c343a04c4cf9c6219390727299a5c",
        )

    def test_mapping_parser_and_generator_primitives_are_deterministic(self) -> None:
        from _recommendation_mapping_modules.semantic_concept_catalog import (
            SEMANTIC_CONCEPT_RULES,
        )
        from _recommendation_mapping_modules.field_matching_windows_text import (
            split_identifier,
        )
        from _recommendation_mapping_modules._mapping_lexical_constants import (
            unique_preserving_order,
        )

        self.assertEqual(
            split_identifier("DevicePasswordExpiration"),
            ["device", "password", "expiration"],
        )
        self.assertEqual(unique_preserving_order(["a", "b", "a", "c"]), ["a", "b", "c"])
        self.assertEqual(
            SEMANTIC_CONCEPT_RULES[0].concept_id, "passcode_authentication"
        )
        self.assertEqual(SEMANTIC_CONCEPT_RULES[-1].concept_id, "secure_boot_hardware")

    def test_review_fixture_renders_stable_queue_output(self) -> None:
        from _build_relution_import_artifacts_modules.mapping_candidate_review_markdown import (
            render_mapping_candidate_review_report,
        )

        report = render_mapping_candidate_review_report(
            {"summary": {"bySource": {"bsi": 2}, "byLanguage": {"de": 2}}},
            {
                "generatedAt": "2026-01-01T00:00:00Z",
                "summary": {
                    "exactReferenceCount": 2,
                    "totalReviewedRecommendations": 3,
                    "bySuggestedReviewAction": {"manual-review": 2, "retain": 1},
                },
            },
        )

        self.assertIn("Generated: `2026-01-01T00:00:00Z`", report)
        self.assertLess(
            report.index("- `manual-review`: `2`"), report.index("- `retain`: `1`")
        )


if __name__ == "__main__":
    unittest.main()
