from __future__ import annotations

import argparse
import copy
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
VALIDATOR_PATH = REPOSITORY_ROOT / "scripts" / "validate_machine_docs.py"
RENDERER_PATH = REPOSITORY_ROOT / "scripts" / "render_relution_openapi.py"
FIXTURE_PATH = REPOSITORY_ROOT / "tests" / "fixtures" / "sample-openapi.json"
FIXTURE_REQUEST_PATH = (
    REPOSITORY_ROOT / "tests" / "fixtures" / "sample-setting-patch.json"
)

spec = importlib.util.spec_from_file_location("validate_machine_docs", VALIDATOR_PATH)
assert spec is not None and spec.loader is not None
validator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validator)


class MachineDocumentationTests(unittest.TestCase):
    def test_document_loader_rejects_duplicate_keys_and_non_finite_numbers(self) -> None:
        malformed_documents = {
            "duplicate": ('{"status":"generated","status":"not_generated"}', "duplicate JSON key"),
            "infinity": ('{"operation_count":Infinity}', "non-standard JSON constant 'Infinity'"),
        }
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            for name, (payload, expected) in malformed_documents.items():
                with self.subTest(name=name):
                    path = root / f"{name}.json"
                    path.write_text(payload, encoding="utf-8")
                    with self.assertRaisesRegex(validator.ValidationFailure, expected):
                        validator.load_json(path)

    def test_checked_in_machine_docs_validate(self) -> None:
        result = subprocess.run(
            [sys.executable, str(VALIDATOR_PATH)],
            cwd=REPOSITORY_ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("valid: Relution machine-readable", result.stdout)

    def test_catalog_placeholder_is_explicitly_fail_closed(self) -> None:
        catalog = json.loads(
            (REPOSITORY_ROOT / "docs/relution/generated/API_CATALOG.json").read_text(
                encoding="utf-8"
            )
        )
        self.assertEqual(catalog["status"], "not_generated")
        self.assertIsNone(catalog["source"]["sha256"])
        self.assertEqual(catalog["operation_count"], 0)
        self.assertEqual(catalog["operations"], [])

    def test_schema_bundle_references_are_closed_and_broken_refs_fail(self) -> None:
        schema_directory = REPOSITORY_ROOT / "docs/relution/schemas"
        errors: list[str] = []
        validator.validate_schema_references(schema_directory, errors)
        self.assertEqual(errors, [])

        with tempfile.TemporaryDirectory() as temporary_directory:
            directory = Path(temporary_directory)
            (directory / "broken.schema.json").write_text(
                json.dumps(
                    {
                        "$schema": "https://json-schema.org/draft/2020-12/schema",
                        "$id": "urn:broken",
                        "$ref": "missing.schema.json#/$defs/value",
                    }
                ),
                encoding="utf-8",
            )
            broken_errors: list[str] = []
            validator.validate_schema_references(directory, broken_errors)
            self.assertIn("unresolved local schema document", "\n".join(broken_errors))

    def test_static_concept_registry_rejects_concrete_api_binding(self) -> None:
        path = REPOSITORY_ROOT / "docs/relution/registries/features.json"
        document = json.loads(path.read_text(encoding="utf-8"))
        document["records"][0]["api_discovery"]["binding_status"] = "resolved"
        document["records"][0]["api_discovery"]["method"] = "PATCH"
        document["records"][0]["api_discovery"]["path"] = "/api/guessed"
        errors: list[str] = []

        validator.validate_concept_registry(document, path, errors)

        joined = "\n".join(errors)
        self.assertIn("must remain 'target_contract_required'", joined)
        self.assertIn("concrete bindings belong in a digest-bound target file", joined)

    def test_cross_registry_duplicate_and_dangling_ids_are_detectable(self) -> None:
        path = REPOSITORY_ROOT / "docs/relution/registries/features.json"
        document = json.loads(path.read_text(encoding="utf-8"))
        document["records"][1]["id"] = document["records"][0]["id"]
        document["records"][2]["related_ids"]["settings"].append(
            "setting.does_not_exist"
        )
        errors: list[str] = []

        ids, references = validator.validate_concept_registry(document, path, errors)

        self.assertTrue(any("duplicate ID" in item for item in errors))
        known_ids = set(ids)
        dangling = [
            target
            for targets in references.values()
            for target in targets
            if target not in known_ids
        ]
        self.assertIn("setting.does_not_exist", dangling)

    def generate_catalog(self, directory: Path) -> tuple[dict[str, Any], Path]:
        markdown = directory / "catalog.md"
        machine = directory / "catalog.json"
        result = subprocess.run(
            [
                sys.executable,
                str(RENDERER_PATH),
                "--spec",
                str(FIXTURE_PATH),
                "--output",
                str(markdown),
                "--json-output",
                str(machine),
            ],
            cwd=REPOSITORY_ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(machine.read_text(encoding="utf-8")), machine

    def resolved_binding_for(
        self, catalog: dict[str, Any], operation: dict[str, Any]
    ) -> dict[str, Any]:
        success_status = next(
            response["status"]
            for response in operation["responses"]
            if str(response["status"]).startswith("2")
        )
        return {
            "$schema": "../schemas/target-bindings.schema.json",
            "schema_version": "1.0.0",
            "document_type": "relution-target-contract-bindings",
            "binding_status": "partial",
            "sensitive_values_present": False,
            "target": {
                "authorized_origin": "https://mdm.example.invalid",
                "reported_version": "fixture",
                "organization_id": "fixture-org",
            },
            "contract": {
                "catalog_path": "catalog.json",
                "source_sha256": catalog["source"]["sha256"],
                "operation_count": catalog["operation_count"],
                "catalog_checked_current": True,
                "validated_at": "2026-07-18T00:00:00Z",
            },
            "bindings": [
                {
                    "concept_id": "feature.api_access",
                    "binding_completeness": "partial",
                    "workflow_id": None,
                    "required_roles": [],
                    "operations": [
                        {
                            "role": "read",
                            "operation_key": operation["key"],
                            "surface": operation["surface"],
                            "method": operation["method"],
                            "path": operation["path"],
                            "lineage": operation["lineage"],
                            "operation_id": operation["operation_id"],
                            "request_schema_refs": [],
                            "response_schema_refs": [],
                            "expected_success_statuses": [success_status],
                            "source_contract_verified": True,
                        }
                    ],
                    "scope_bindings": [],
                    "notes": ["Fixture binding"],
                }
            ],
            "unresolved_concept_ids": [],
        }

    @staticmethod
    def operation_reference(
        catalog: dict[str, Any], operation: dict[str, Any]
    ) -> dict[str, Any]:
        return {
            "operation_key": operation["key"],
            "operation_id": operation["operation_id"],
            "surface": operation["surface"],
            "method": operation["method"],
            "path": operation["path"],
            "lineage": operation["lineage"],
            "catalog_sha256": catalog["source"]["sha256"],
        }

    def approved_change_plan_for(self, catalog: dict[str, Any]) -> dict[str, Any]:
        template_path = (
            REPOSITORY_ROOT / "docs/relution/templates/settings-change-plan.json"
        )
        plan = json.loads(template_path.read_text(encoding="utf-8"))
        read_operation = next(
            item
            for item in catalog["operations"]
            if item["surface"] == "paths" and item["method"] == "GET"
        )
        write_operation = next(
            item
            for item in catalog["operations"]
            if item["surface"] == "paths" and item["method"] == "PATCH"
        )
        success_status = next(
            response["status"]
            for response in write_operation["responses"]
            if str(response["status"]).startswith("2")
        )
        plan.update(
            {
                "plan_status": "approved",
                "execution_authorized": True,
                "concept_ids": ["feature.api_access"],
                "target": {
                    "authorized_origin": "https://mdm.example.invalid",
                    "effective_api_server": "https://mdm.example.invalid",
                    "relution_version": "26.test",
                    "organization_id": "fixture-org",
                    "organization_name": "Fixture organization",
                },
                "contract": {
                    "catalog_path": "catalog.json",
                    "sha256": catalog["source"]["sha256"],
                    "operation_count": catalog["operation_count"],
                    "checked_current": True,
                },
                "authorization": {
                    "request_owner": "fixture request owner",
                    "operator_identity": "fixture operator",
                    "token_owner": "fixture token owner",
                    "permission_scope": ["settings.read", "settings.update"],
                    "approved_effect": "Enable one fixture setting",
                    "approved_object_count": 1,
                    "approved_at": "2026-07-18T00:00:00Z",
                    "expires_at": "2999-01-01T00:00:00Z",
                },
                "impact": {
                    "tier": 1,
                    "reason": "One reversible organization setting",
                    "externally_visible": False,
                    "destructive_or_irreversible": False,
                    "affects_authentication_or_access": False,
                    "affects_multiple_organizations": False,
                    "requires_immediate_approval": False,
                    "requires_canary": False,
                    "canary_scope": None,
                    "monitoring_owner": None,
                    "monitoring_window": None,
                    "requires_second_access_path": False,
                },
                "resource": {
                    "type": "setting",
                    "stable_id": "fixture-setting",
                    "display_name": "Fixture setting",
                    "scope": "organization",
                    "resolved_uniquely": True,
                },
                "operations": {
                    "read": self.operation_reference(catalog, read_operation),
                    "write": self.operation_reference(catalog, write_operation),
                    "readback": self.operation_reference(catalog, read_operation),
                    "rollback": None,
                    "audit": None,
                    "status": None,
                },
                "change": {
                    "before_fields": {"enabled": False},
                    "desired_fields": {"enabled": True},
                    "unchanged_invariants": ["stable_id"],
                    "omitted_server_managed_fields": ["updatedAt"],
                    "write_only_fields": [],
                    "destructive_sentinels_reviewed": True,
                    "smallest_semantic_diff_confirmed": True,
                },
                "request": {
                    "method": write_operation["method"],
                    "path_template": write_operation["path"],
                    "path_parameters": {"settingId": "fixture-setting"},
                    "query_parameters": {},
                    "media_type": "application/json",
                    "request_schema_ref": "#/components/schemas/SettingPatch",
                    "request_body_file": str(FIXTURE_REQUEST_PATH),
                    "expected_success_statuses": [success_status],
                    "concurrency_controls": ["If-Match"],
                    "automatic_retry_allowed": False,
                    "maximum_attempts": 1,
                },
                "audit_plan": {
                    "mode": "manual_ui",
                    "instructions": ["Review the setting audit record in the target UI."],
                    "required_match_fields": [
                        "actor",
                        "time",
                        "http_method",
                        "endpoint",
                        "organization",
                        "status",
                        "object_context",
                    ],
                    "evidence_source": "official_documentation",
                },
                "success_assertions": [
                    {
                        "source": "readback",
                        "json_pointer": "/enabled",
                        "operator": "equals",
                        "expected": True,
                    }
                ],
                "rollback": {
                    "available": True,
                    "execution_mode": "manual_recovery",
                    "strategy": "Restore the captured enabled value",
                    "prior_values_captured": True,
                    "recovery_owner": "fixture operator",
                    "recovery_window": "before approval expiry",
                    "irreversibility_acknowledged": False,
                },
                "stop_reasons": [],
            }
        )
        return plan

    @staticmethod
    def indexed_operations(
        catalog: dict[str, Any], catalog_path: Path
    ) -> dict[str, Any]:
        catalog_errors: list[str] = []
        operations = validator.validate_catalog(catalog, catalog_path, catalog_errors)
        if catalog_errors:
            raise AssertionError("\n".join(catalog_errors))
        return operations

    def test_digest_bound_operation_binding_matches_generated_catalog(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            directory = Path(temporary_directory)
            catalog, catalog_path = self.generate_catalog(directory)
            operation = next(
                item for item in catalog["operations"] if item["surface"] == "paths"
            )
            binding = self.resolved_binding_for(catalog, operation)
            errors: list[str] = []
            catalog_errors: list[str] = []
            operations = validator.validate_catalog(
                catalog, catalog_path, catalog_errors
            )
            self.assertEqual(catalog_errors, [])

            validator.validate_bindings(
                binding,
                directory / "bindings.json",
                errors,
                {"feature.api_access"},
                catalog,
                operations,
            )

            self.assertEqual(errors, [])

    def test_digest_mismatch_and_unknown_operation_binding_fail(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            directory = Path(temporary_directory)
            catalog, catalog_path = self.generate_catalog(directory)
            operation = next(
                item for item in catalog["operations"] if item["surface"] == "paths"
            )
            binding = self.resolved_binding_for(catalog, operation)
            binding["contract"]["source_sha256"] = "0" * 64
            binding["bindings"][0]["operations"][0]["operation_key"] = (
                "operation.sha256." + "f" * 64
            )
            catalog_errors: list[str] = []
            operations = validator.validate_catalog(
                catalog, catalog_path, catalog_errors
            )
            errors: list[str] = []

            validator.validate_bindings(
                binding,
                directory / "bindings.json",
                errors,
                {"feature.api_access"},
                catalog,
                operations,
            )

            joined = "\n".join(errors)
            self.assertIn("does not match catalog digest", joined)
            self.assertIn("does not exist in the catalog", joined)

    def test_webhook_or_callback_cannot_be_bound_as_client_operation(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            directory = Path(temporary_directory)
            catalog, catalog_path = self.generate_catalog(directory)
            provider_operation = next(
                item
                for item in catalog["operations"]
                if item["surface"] in {"webhooks", "callbacks"}
            )
            binding = self.resolved_binding_for(catalog, provider_operation)
            catalog_errors: list[str] = []
            operations = validator.validate_catalog(
                catalog, catalog_path, catalog_errors
            )
            errors: list[str] = []

            validator.validate_bindings(
                binding,
                directory / "bindings.json",
                errors,
                {"feature.api_access"},
                catalog,
                operations,
            )

            self.assertTrue(
                any("only top-level path operations" in item for item in errors)
            )

    def test_generated_operation_key_is_recomputed(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            directory = Path(temporary_directory)
            catalog, catalog_path = self.generate_catalog(directory)
            broken = copy.deepcopy(catalog)
            broken["operations"][0]["path"] += "/changed"
            errors: list[str] = []

            validator.validate_catalog(broken, catalog_path, errors)

            self.assertTrue(
                any("does not match operation identity fields" in item for item in errors)
            )

    def test_change_plan_never_allows_automatic_mutation_retry(self) -> None:
        path = REPOSITORY_ROOT / "docs/relution/templates/settings-change-plan.json"
        plan = json.loads(path.read_text(encoding="utf-8"))
        plan["request"]["automatic_retry_allowed"] = True
        plan["request"]["maximum_attempts"] = 2
        errors: list[str] = []

        validator.validate_change_plan(plan, path, errors, set(), {}, {})

        joined = "\n".join(errors)
        self.assertIn("automatic_retry_allowed", joined)
        self.assertIn("maximum_attempts", joined)

    def test_complete_approved_change_plan_is_valid(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            directory = Path(temporary_directory)
            catalog, catalog_path = self.generate_catalog(directory)
            operations = self.indexed_operations(catalog, catalog_path)
            plan = self.approved_change_plan_for(catalog)
            errors: list[str] = []

            validator.validate_change_plan(
                plan,
                directory / "change-plan.json",
                errors,
                {"feature.api_access"},
                catalog,
                operations,
            )

            self.assertEqual(errors, [])

    def test_change_plan_preserves_short_circuit_and_error_order(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            directory = Path(temporary_directory)
            catalog, catalog_path = self.generate_catalog(directory)
            operations = self.indexed_operations(catalog, catalog_path)
            plan_path = directory / "refactor-change-plan.json"

            invalid_status = self.approved_change_plan_for(catalog)
            invalid_status["plan_status"] = "invalid"
            invalid_status_errors: list[str] = []
            validator.validate_change_plan(
                invalid_status,
                plan_path,
                invalid_status_errors,
                {"feature.api_access"},
                catalog,
                operations,
            )
            self.assertEqual(
                invalid_status_errors,
                [f"{plan_path}:$.plan_status: is invalid"],
            )

            invalid_operations = self.approved_change_plan_for(catalog)
            invalid_operations["operations"] = []
            invalid_operations_errors: list[str] = []
            validator.validate_change_plan(
                invalid_operations,
                plan_path,
                invalid_operations_errors,
                {"feature.api_access"},
                catalog,
                operations,
            )
            self.assertEqual(
                invalid_operations_errors,
                [f"{plan_path}:$.operations: must be an object"],
            )

            invalid_read = self.approved_change_plan_for(catalog)
            invalid_read["operations"]["read"] = []
            invalid_read_errors: list[str] = []
            validator.validate_change_plan(
                invalid_read,
                plan_path,
                invalid_read_errors,
                {"feature.api_access"},
                catalog,
                operations,
            )
            self.assertEqual(
                invalid_read_errors,
                [
                    f"{plan_path}:$.operations.read: must be an object",
                    f"{plan_path}:$.operations.read: is required",
                ],
            )

            template = self.approved_change_plan_for(catalog)
            template.update(
                {
                    "plan_status": "template",
                    "execution_authorized": False,
                    "operations": [],
                    "impact": None,
                    "target": None,
                }
            )
            template_errors: list[str] = []
            validator.validate_change_plan(
                template,
                plan_path,
                template_errors,
                {"feature.api_access"},
                catalog,
                operations,
            )
            self.assertEqual(template_errors, [])

    def test_tier_four_plan_requires_canary_and_monitoring_controls(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            directory = Path(temporary_directory)
            catalog, catalog_path = self.generate_catalog(directory)
            operations = self.indexed_operations(catalog, catalog_path)
            plan = self.approved_change_plan_for(catalog)
            plan["impact"].update(
                {
                    "tier": 4,
                    "requires_immediate_approval": False,
                    "requires_canary": False,
                    "canary_scope": None,
                    "monitoring_owner": "",
                    "monitoring_window": "",
                }
            )
            errors: list[str] = []

            validator.validate_change_plan(
                plan,
                directory / "tier-four.json",
                errors,
                {"feature.api_access"},
                catalog,
                operations,
            )

            joined = "\n".join(errors)
            self.assertIn("$.impact.requires_immediate_approval", joined)
            self.assertIn("$.impact.requires_canary", joined)
            self.assertIn("$.impact.canary_scope", joined)
            self.assertIn("$.impact.monitoring_owner", joined)
            self.assertIn("$.impact.monitoring_window", joined)

    def test_tier_three_and_external_changes_require_immediate_approval(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            directory = Path(temporary_directory)
            catalog, catalog_path = self.generate_catalog(directory)
            operations = self.indexed_operations(catalog, catalog_path)
            for label, tier, externally_visible in (
                ("tier three", 3, False),
                ("externally visible tier one", 1, True),
            ):
                with self.subTest(case=label):
                    plan = self.approved_change_plan_for(catalog)
                    plan["impact"]["tier"] = tier
                    plan["impact"]["externally_visible"] = externally_visible
                    plan["impact"]["requires_immediate_approval"] = False
                    errors: list[str] = []
                    validator.validate_change_plan(
                        plan,
                        directory / "immediate-approval.json",
                        errors,
                        {"feature.api_access"},
                        catalog,
                        operations,
                    )
                    self.assertIn(
                        "$.impact.requires_immediate_approval", "\n".join(errors)
                    )

            plan = self.approved_change_plan_for(catalog)
            plan["impact"].update(
                {
                    "tier": 4,
                    "requires_immediate_approval": True,
                    "requires_canary": True,
                    "canary_scope": "one fixture organization",
                    "monitoring_owner": "fixture operator",
                    "monitoring_window": "30 minutes after the change",
                }
            )
            approval_time = datetime.now(timezone.utc)
            plan["authorization"]["approved_at"] = (
                approval_time - timedelta(minutes=5)
            ).isoformat()
            plan["authorization"]["expires_at"] = (
                approval_time + timedelta(minutes=25)
            ).isoformat()
            errors = []
            validator.validate_change_plan(
                plan,
                directory / "valid-tier-four.json",
                errors,
                {"feature.api_access"},
                catalog,
                operations,
            )
            self.assertEqual(errors, [])

    def test_audit_plan_and_rollback_controls_fail_closed(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            directory = Path(temporary_directory)
            catalog, catalog_path = self.generate_catalog(directory)
            operations = self.indexed_operations(catalog, catalog_path)
            cases = (
                ("audit plan absent", ("audit_plan",), None, "$.audit_plan"),
                (
                    "manual audit instructions absent",
                    ("audit_plan", "instructions"),
                    [],
                    "$.audit_plan.instructions",
                ),
                (
                    "manual audit evidence mismatched",
                    ("audit_plan", "evidence_source"),
                    "target_contract",
                    "$.audit_plan.evidence_source",
                ),
                (
                    "audit match context incomplete",
                    ("audit_plan", "required_match_fields"),
                    [
                        "actor",
                        "time",
                        "http_method",
                        "endpoint",
                        "organization",
                        "status",
                    ],
                    "$.audit_plan.required_match_fields",
                ),
                (
                    "API audit operation absent",
                    ("audit_plan", "mode"),
                    "api_operation",
                    "$.operations.audit",
                ),
                (
                    "invalid rollback mode",
                    ("rollback", "execution_mode"),
                    "not-a-mode",
                    "$.rollback.execution_mode",
                ),
            )
            for label, location, value, expected_location in cases:
                with self.subTest(case=label):
                    plan = self.approved_change_plan_for(catalog)
                    if len(location) == 1:
                        plan.pop(location[0])
                    else:
                        plan[location[0]][location[1]] = value
                    if label == "API audit operation absent":
                        plan["audit_plan"]["evidence_source"] = "target_contract"
                    errors: list[str] = []
                    validator.validate_change_plan(
                        plan,
                        directory / "invalid-controls.json",
                        errors,
                        {"feature.api_access"},
                        catalog,
                        operations,
                    )
                    self.assertIn(expected_location, "\n".join(errors))

    def test_request_body_fields_must_match_the_write_operation(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            directory = Path(temporary_directory)
            catalog, catalog_path = self.generate_catalog(directory)
            operations = self.indexed_operations(catalog, catalog_path)
            for label, field, value, expected_location in (
                ("media type absent", "media_type", None, "$.request.media_type"),
                (
                    "schema reference mismatched",
                    "request_schema_ref",
                    "#/components/schemas/NotThePatch",
                    "$.request.request_schema_ref",
                ),
                (
                    "request body file absent",
                    "request_body_file",
                    None,
                    "$.request.request_body_file",
                ),
                (
                    "request body file does not exist",
                    "request_body_file",
                    str(directory / "does-not-exist.json"),
                    "$.request.request_body_file",
                ),
            ):
                with self.subTest(case=label):
                    plan = self.approved_change_plan_for(catalog)
                    plan["request"][field] = value
                    errors: list[str] = []
                    validator.validate_change_plan(
                        plan,
                        directory / "request-body.json",
                        errors,
                        {"feature.api_access"},
                        catalog,
                        operations,
                    )
                    self.assertIn(expected_location, "\n".join(errors))

    def test_immediate_approval_has_a_bounded_active_window(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            directory = Path(temporary_directory)
            catalog, catalog_path = self.generate_catalog(directory)
            operations = self.indexed_operations(catalog, catalog_path)
            stale = self.approved_change_plan_for(catalog)
            stale["impact"]["tier"] = 3
            stale["impact"]["requires_immediate_approval"] = True
            stale_errors: list[str] = []
            validator.validate_change_plan(
                stale,
                directory / "stale-approval.json",
                stale_errors,
                {"feature.api_access"},
                catalog,
                operations,
            )
            stale_joined = "\n".join(stale_errors)
            self.assertIn("$.authorization.approved_at", stale_joined)
            self.assertIn("$.authorization.expires_at", stale_joined)

            current = self.approved_change_plan_for(catalog)
            current["impact"]["tier"] = 3
            current["impact"]["requires_immediate_approval"] = True
            now = datetime.now(timezone.utc)
            current["authorization"]["approved_at"] = (
                now - timedelta(minutes=5)
            ).isoformat()
            current["authorization"]["expires_at"] = (
                now + timedelta(minutes=25)
            ).isoformat()
            current_errors: list[str] = []
            validator.validate_change_plan(
                current,
                directory / "current-approval.json",
                current_errors,
                {"feature.api_access"},
                catalog,
                operations,
            )
            self.assertEqual(current_errors, [])

    def test_complete_binding_requires_workflow_roles(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            directory = Path(temporary_directory)
            catalog, catalog_path = self.generate_catalog(directory)
            operation = next(
                item for item in catalog["operations"] if item["surface"] == "paths"
            )
            operations = self.indexed_operations(catalog, catalog_path)
            binding = self.resolved_binding_for(catalog, operation)
            record = binding["bindings"][0]
            record["binding_completeness"] = "complete_for_requested_workflow"
            record["workflow_id"] = "fixture-setting-change"
            record["required_roles"] = []
            errors: list[str] = []

            validator.validate_bindings(
                binding,
                directory / "bindings.json",
                errors,
                {"feature.api_access"},
                catalog,
                operations,
            )

            self.assertIn("$.bindings[0].required_roles", "\n".join(errors))

            record["required_roles"] = ["read", "update"]
            missing_role_errors: list[str] = []
            validator.validate_bindings(
                binding,
                directory / "bindings-missing-role.json",
                missing_role_errors,
                {"feature.api_access"},
                catalog,
                operations,
            )
            self.assertIn("declared workflow roles are not bound", "\n".join(missing_role_errors))

    def test_change_plan_rejects_provider_owned_operation_surfaces(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            directory = Path(temporary_directory)
            catalog, catalog_path = self.generate_catalog(directory)
            base_operations = self.indexed_operations(catalog, catalog_path)
            webhook = next(
                item for item in catalog["operations"] if item["surface"] == "webhooks"
            )
            for surface in ("webhooks", "callbacks"):
                with self.subTest(surface=surface):
                    provider_operation = copy.deepcopy(webhook)
                    provider_operation["surface"] = surface
                    provider_operation["source_location"] = (
                        f"{surface}.fixture-provider-operation.post"
                    )
                    provider_operation["key"] = validator.operation_key(
                        provider_operation
                    )
                    operations = dict(base_operations)
                    operations[provider_operation["key"]] = provider_operation
                    plan = self.approved_change_plan_for(catalog)
                    plan["operations"]["write"] = self.operation_reference(
                        catalog, provider_operation
                    )
                    plan["request"]["method"] = provider_operation["method"]
                    plan["request"]["path_template"] = provider_operation["path"]
                    plan["request"]["expected_success_statuses"] = ["204"]
                    errors: list[str] = []

                    validator.validate_change_plan(
                        plan,
                        directory / "change-plan.json",
                        errors,
                        {"feature.api_access"},
                        catalog,
                        operations,
                    )

                    joined = "\n".join(errors)
                    self.assertIn("$.operations.write.surface", joined)
                    self.assertIn("top-level path", joined)

    def test_change_plan_requires_complete_operation_identity(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            directory = Path(temporary_directory)
            catalog, catalog_path = self.generate_catalog(directory)
            operations = self.indexed_operations(catalog, catalog_path)
            for field in (
                "operation_key",
                "operation_id",
                "surface",
                "method",
                "path",
                "lineage",
                "catalog_sha256",
            ):
                with self.subTest(field=field):
                    plan = self.approved_change_plan_for(catalog)
                    plan["operations"]["write"].pop(field)
                    errors: list[str] = []

                    validator.validate_change_plan(
                        plan,
                        directory / "change-plan.json",
                        errors,
                        {"feature.api_access"},
                        catalog,
                        operations,
                    )

                    self.assertIn(f"$.operations.write.{field}", "\n".join(errors))

    def test_verified_plan_requires_terminal_evidence_and_is_not_authorized(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            directory = Path(temporary_directory)
            catalog, catalog_path = self.generate_catalog(directory)
            operations = self.indexed_operations(catalog, catalog_path)
            plan = self.approved_change_plan_for(catalog)
            plan["plan_status"] = "verified"
            plan["execution_authorized"] = False
            errors: list[str] = []

            validator.validate_change_plan(
                plan,
                directory / "change-plan.json",
                errors,
                {"feature.api_access"},
                catalog,
                operations,
            )

            joined = "\n".join(errors)
            self.assertIn("$.verification", joined)
            self.assertIn("$.result", joined)
            self.assertNotIn("$.execution_authorized", joined)

    def test_rolled_back_plan_requires_terminal_evidence_and_is_not_authorized(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            directory = Path(temporary_directory)
            catalog, catalog_path = self.generate_catalog(directory)
            operations = self.indexed_operations(catalog, catalog_path)
            plan = self.approved_change_plan_for(catalog)
            plan["plan_status"] = "rolled_back"
            plan["execution_authorized"] = False
            errors: list[str] = []

            validator.validate_change_plan(
                plan,
                directory / "change-plan.json",
                errors,
                {"feature.api_access"},
                catalog,
                operations,
            )

            joined = "\n".join(errors)
            self.assertIn("$.verification", joined)
            self.assertIn("$.result", joined)
            self.assertNotIn("$.execution_authorized", joined)

    def test_terminal_change_plan_cannot_retain_execution_authorization(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            directory = Path(temporary_directory)
            catalog, catalog_path = self.generate_catalog(directory)
            operations = self.indexed_operations(catalog, catalog_path)
            for status in ("verified", "rolled_back"):
                with self.subTest(status=status):
                    plan = self.approved_change_plan_for(catalog)
                    plan["plan_status"] = status
                    errors: list[str] = []

                    validator.validate_change_plan(
                        plan,
                        directory / "change-plan.json",
                        errors,
                        {"feature.api_access"},
                        catalog,
                        operations,
                    )

                    self.assertIn("$.execution_authorized", "\n".join(errors))

    def test_outcome_unknown_keeps_resolved_context_but_revokes_authorization(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            directory = Path(temporary_directory)
            catalog, catalog_path = self.generate_catalog(directory)
            operations = self.indexed_operations(catalog, catalog_path)
            plan = self.approved_change_plan_for(catalog)
            plan["plan_status"] = "outcome_unknown"
            plan["execution_authorized"] = False
            plan["result"] = {
                "request_transport": "unknown",
                "server_acceptance": "unknown",
                "readback": "unknown",
                "audit": "unknown",
                "overall": "outcome_unknown",
                "observed_at": "2026-07-18T00:01:00Z",
                "residual_uncertainty": [
                    "Transport completion and server state require reconciliation."
                ],
            }
            errors: list[str] = []

            validator.validate_change_plan(
                plan,
                directory / "outcome-unknown.json",
                errors,
                {"feature.api_access"},
                catalog,
                operations,
            )

            self.assertEqual(errors, [])

            plan["execution_authorized"] = True
            plan["result"]["request_transport"] = "not_sent"
            errors = []
            validator.validate_change_plan(
                plan,
                directory / "invalid-outcome-unknown.json",
                errors,
                {"feature.api_access"},
                catalog,
                operations,
            )

            joined = "\n".join(errors)
            self.assertIn("$.execution_authorized", joined)
            self.assertIn("$.result", joined)

    def test_approved_plan_rejects_invalid_authorization_and_target_scope(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            directory = Path(temporary_directory)
            catalog, catalog_path = self.generate_catalog(directory)
            operations = self.indexed_operations(catalog, catalog_path)
            cases = (
                (
                    "expired approval",
                    ("authorization", "expires_at"),
                    "2000-01-01T00:00:00Z",
                    "$.authorization.expires_at",
                ),
                (
                    "missing approval expiry",
                    ("authorization", "expires_at"),
                    None,
                    "$.authorization.expires_at",
                ),
                (
                    "missing approval time",
                    ("authorization", "approved_at"),
                    None,
                    "$.authorization.approved_at",
                ),
                (
                    "empty permission scope",
                    ("authorization", "permission_scope"),
                    [],
                    "$.authorization.permission_scope",
                ),
                (
                    "more than one object",
                    ("authorization", "approved_object_count"),
                    2,
                    "$.authorization.approved_object_count",
                ),
                (
                    "unrelated effective server",
                    ("target", "effective_api_server"),
                    "https://other.example.invalid",
                    "$.target.effective_api_server",
                ),
            )
            for label, (section, field), invalid_value, expected_location in cases:
                with self.subTest(case=label):
                    plan = self.approved_change_plan_for(catalog)
                    plan[section][field] = invalid_value
                    errors: list[str] = []

                    validator.validate_change_plan(
                        plan,
                        directory / "change-plan.json",
                        errors,
                        {"feature.api_access"},
                        catalog,
                        operations,
                    )

                    self.assertIn(expected_location, "\n".join(errors))

    def test_binding_rejects_phantom_scope_parameter(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            directory = Path(temporary_directory)
            catalog, catalog_path = self.generate_catalog(directory)
            operation = next(
                item
                for item in catalog["operations"]
                if item["surface"] == "paths" and item["method"] == "GET"
            )
            operations = self.indexed_operations(catalog, catalog_path)
            binding = self.resolved_binding_for(catalog, operation)
            binding["bindings"][0]["scope_bindings"] = [
                {
                    "scope_kind": "organization",
                    "location": "query",
                    "name": "phantomOrganizationId",
                    "operation_keys": [operation["key"]],
                    "source_contract_verified": True,
                }
            ]
            errors: list[str] = []

            validator.validate_bindings(
                binding,
                directory / "bindings.json",
                errors,
                {"feature.api_access"},
                catalog,
                operations,
            )

            joined = "\n".join(errors)
            self.assertIn("$.bindings[0].scope_bindings[0].name", joined)
            self.assertIn("parameter", joined)

    def test_scope_binding_requires_target_contract_proof(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            directory = Path(temporary_directory)
            catalog, catalog_path = self.generate_catalog(directory)
            operation = next(
                item
                for item in catalog["operations"]
                if item["surface"] == "paths" and item["method"] == "GET"
            )
            operations = self.indexed_operations(catalog, catalog_path)
            binding = self.resolved_binding_for(catalog, operation)
            binding["bindings"][0]["scope_bindings"] = [
                {
                    "scope_kind": "organization",
                    "location": "path",
                    "name": "settingId",
                    "operation_keys": [operation["key"]],
                }
            ]
            errors: list[str] = []

            validator.validate_bindings(
                binding,
                directory / "bindings.json",
                errors,
                {"feature.api_access"},
                catalog,
                operations,
            )

            self.assertIn(
                "$.bindings[0].scope_bindings[0].source_contract_verified",
                "\n".join(errors),
            )

    def test_stale_binding_does_not_bypass_integrity_validation(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            directory = Path(temporary_directory)
            catalog, catalog_path = self.generate_catalog(directory)
            operation = next(
                item for item in catalog["operations"] if item["surface"] == "paths"
            )
            operations = self.indexed_operations(catalog, catalog_path)
            binding = self.resolved_binding_for(catalog, operation)
            binding["binding_status"] = "stale"
            binding["bindings"][0]["operations"][0]["operation_key"] = (
                "operation.sha256." + "f" * 64
            )
            errors: list[str] = []

            validator.validate_bindings(
                binding,
                directory / "bindings.json",
                errors,
                {"feature.api_access"},
                catalog,
                operations,
            )

            joined = "\n".join(errors)
            self.assertIn("binding_status", joined)
            self.assertIn("does not exist in the catalog", joined)

    def test_generated_catalog_must_exactly_match_supplied_spec(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            directory = Path(temporary_directory)
            catalog, catalog_path = self.generate_catalog(directory)
            command = [
                sys.executable,
                str(VALIDATOR_PATH),
                "--catalog",
                str(catalog_path),
                "--spec",
                str(FIXTURE_PATH),
            ]
            current = subprocess.run(
                command,
                cwd=REPOSITORY_ROOT,
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(current.returncode, 0, current.stderr)

            catalog["contract"]["info"]["title"] = "Tampered catalog title"
            catalog_path.write_text(
                json.dumps(catalog, indent=2) + "\n", encoding="utf-8"
            )
            stale = subprocess.run(
                command,
                cwd=REPOSITORY_ROOT,
                capture_output=True,
                text=True,
                check=False,
            )

            self.assertNotEqual(stale.returncode, 0)
            self.assertRegex(
                stale.stderr,
                r"(?i)(fresh|--spec|does not match.*spec|regenerat)",
            )

    def test_change_plan_rejects_read_and_write_role_misuse(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            directory = Path(temporary_directory)
            catalog, catalog_path = self.generate_catalog(directory)
            operations = self.indexed_operations(catalog, catalog_path)
            read_operation = next(
                item
                for item in catalog["operations"]
                if item["surface"] == "paths" and item["method"] == "GET"
            )
            write_operation = next(
                item
                for item in catalog["operations"]
                if item["surface"] == "paths" and item["method"] == "PATCH"
            )

            unsafe_read = self.approved_change_plan_for(catalog)
            unsafe_read["operations"]["read"] = self.operation_reference(
                catalog, write_operation
            )
            unsafe_read["operations"]["readback"] = self.operation_reference(
                catalog, write_operation
            )
            read_errors: list[str] = []
            validator.validate_change_plan(
                unsafe_read,
                directory / "unsafe-read.json",
                read_errors,
                {"feature.api_access"},
                catalog,
                operations,
            )
            joined_read_errors = "\n".join(read_errors)
            self.assertIn("$.operations.read.method", joined_read_errors)
            self.assertIn("$.operations.readback.method", joined_read_errors)

            unsafe_write = self.approved_change_plan_for(catalog)
            unsafe_write["operations"]["write"] = self.operation_reference(
                catalog, read_operation
            )
            unsafe_write["request"]["method"] = read_operation["method"]
            unsafe_write["request"]["path_template"] = read_operation["path"]
            unsafe_write["request"]["expected_success_statuses"] = ["200"]
            write_errors: list[str] = []
            validator.validate_change_plan(
                unsafe_write,
                directory / "unsafe-write.json",
                write_errors,
                {"feature.api_access"},
                catalog,
                operations,
            )
            self.assertIn("$.operations.write.method", "\n".join(write_errors))

    def test_binding_keeps_request_and_response_schema_references_separate(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            directory = Path(temporary_directory)
            catalog, catalog_path = self.generate_catalog(directory)
            operations = self.indexed_operations(catalog, catalog_path)
            write_operation = next(
                item
                for item in catalog["operations"]
                if item["surface"] == "paths" and item["method"] == "PATCH"
            )
            binding = self.resolved_binding_for(catalog, write_operation)
            operation_binding = binding["bindings"][0]["operations"][0]
            request_ref = "#/components/schemas/SettingPatch"
            operation_binding["request_schema_refs"] = [request_ref]
            operation_binding["response_schema_refs"] = [request_ref]
            errors: list[str] = []

            validator.validate_bindings(
                binding,
                directory / "bindings.json",
                errors,
                {"feature.api_access"},
                catalog,
                operations,
            )

            joined = "\n".join(errors)
            self.assertNotIn("request_schema_refs", joined)
            self.assertIn("response_schema_refs", joined)
            self.assertIn("absent from the operation summary", joined)

    def test_public_api_evidence_requires_https(self) -> None:
        path = REPOSITORY_ROOT / "docs/relution/registries/public-api-operations.json"
        document = json.loads(path.read_text(encoding="utf-8"))
        document["operations"][0]["evidence"][0]["url"] = (
            "http://hub.relution.io/en/docs/settings/rest-api/"
        )
        concept_ids = {
            concept_id
            for operation in document["operations"]
            for concept_id in operation["related_ids"]
        }
        errors: list[str] = []

        validator.validate_public_api_registry(
            document, path, errors, concept_ids
        )

        self.assertIn("HTTPS official hub.relution.io", "\n".join(errors))

    def test_generated_catalog_requires_raw_spec_for_freshness_proof(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            directory = Path(temporary_directory)
            catalog, catalog_path = self.generate_catalog(directory)
            errors: list[str] = []

            validator.validate_catalog_freshness(
                catalog, catalog_path, None, errors
            )

            joined = "\n".join(errors)
            self.assertIn("--spec", joined)
            self.assertIn("freshness", joined)

    def test_resolved_plan_operations_must_match_target_binding_roles(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            directory = Path(temporary_directory)
            catalog, catalog_path = self.generate_catalog(directory)
            operations = self.indexed_operations(catalog, catalog_path)
            plan = self.approved_change_plan_for(catalog)
            errors: list[str] = []

            validator.validate_change_plan(
                plan,
                directory / "change-plan.json",
                errors,
                {"feature.api_access"},
                catalog,
                operations,
                {
                    "binding_status": "template",
                    "target": {},
                    "contract": {},
                    "bindings": [],
                },
            )

            joined = "\n".join(errors)
            self.assertIn("requires current partial/resolved target bindings", joined)
            self.assertIn("has no target binding", joined)
            self.assertIn("is not bound to a compatible role", joined)

            read_key = plan["operations"]["read"]["operation_key"]
            write_key = plan["operations"]["write"]["operation_key"]
            compatible_bindings = {
                "binding_status": "partial",
                "target": {
                    "authorized_origin": plan["target"]["authorized_origin"],
                    "reported_version": plan["target"]["relution_version"],
                    "organization_id": plan["target"]["organization_id"],
                },
                "contract": {
                    "source_sha256": plan["contract"]["sha256"],
                    "operation_count": plan["contract"]["operation_count"],
                },
                "bindings": [
                    {
                        "concept_id": "feature.api_access",
                        "operations": [
                            {"operation_key": read_key, "role": "read"},
                            {"operation_key": read_key, "role": "readback"},
                            {"operation_key": write_key, "role": "patch"},
                        ],
                    }
                ],
            }
            compatible_errors: list[str] = []
            validator.validate_change_plan(
                plan,
                directory / "compatible-change-plan.json",
                compatible_errors,
                {"feature.api_access"},
                catalog,
                operations,
                compatible_bindings,
            )
            self.assertEqual(compatible_errors, [])


if __name__ == "__main__":
    unittest.main()
