from __future__ import annotations

import copy
import hashlib
import io
import json
import os
import stat
import subprocess
import sys
import tempfile
import unittest
from collections import Counter
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from typing import Any
from unittest import mock


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
SCRIPT_ROOT = REPOSITORY_ROOT / "scripts"
if str(SCRIPT_ROOT) not in sys.path:
    sys.path.insert(0, str(SCRIPT_ROOT))

import university_profile  # noqa: E402
import render_relution_openapi  # noqa: E402
from university_runtime import cli  # noqa: E402
from university_runtime.io import (  # noqa: E402
    atomic_write_json,
    canonical_sha256,
    load_json_beneath,
    load_json_with_sha256,
    strict_load_json,
)
from university_runtime.plan import (  # noqa: E402
    build_execution_plan,
    instantiate_profile,
    validate_execution_plan,
)
from university_runtime.target import validate_target_context  # noqa: E402


PROFILE_PATH = REPOSITORY_ROOT / "docs/relution/packages/university/desired-state.json"
MANIFEST_PATH = REPOSITORY_ROOT / "docs/relution/registries/manifest.json"
TARGET_TEMPLATE_PATH = REPOSITORY_ROOT / "docs/relution/templates/university-runtime-target.json"


class UniversityRuntimeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.profile = university_profile.load_json(PROFILE_PATH)
        cls.profile_digest = hashlib.sha256(PROFILE_PATH.read_bytes()).hexdigest()

    @staticmethod
    def _write_private_json(path: Path, value: object) -> str:
        payload = (
            json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
        ).encode("utf-8")
        path.write_bytes(payload)
        os.chmod(path, 0o600)
        return hashlib.sha256(payload).hexdigest()

    def _evidence_bound_target_fixture(
        self,
        root: Path,
    ) -> tuple[dict[str, Any], Path, Path]:
        os.chmod(root, 0o700)
        artifacts = root / "artifacts"
        artifacts.mkdir(mode=0o700)

        profile_path = artifacts / "university-profile.json"
        profile_sha256 = self._write_private_json(profile_path, self.profile)

        workflow_index = {
            workflow["workflow_id"]: workflow
            for workflow in self.profile["api_workflows"]
        }
        profile_pairs = {
            (concept, workflow["workflow_id"])
            for workflow in self.profile["api_workflows"]
            for concept in workflow["concept_ids"]
        }
        profile_pairs.update(
            (concept, workflow_id)
            for policy in self.profile["policy_units"]
            for concept in policy["concept_ids"]
            for workflow_id in policy["workflow_ids"]
        )
        all_roles = sorted(
            {
                role
                for workflow in self.profile["api_workflows"]
                for role in workflow["required_roles"]
            }
        )
        get_roles = {"read", "query", "readback", "audit", "status"}
        delete_roles = {"delete", "unassign"}
        paths = {}
        for role in all_roles:
            method = "get" if role in get_roles else "delete" if role in delete_roles else "post"
            paths[f"/api/v1/fixture/{role}"] = {
                method: {
                    "operationId": f"fixture_{role}",
                    "responses": {"200": {"description": "ok"}},
                }
            }
        openapi = {
            "openapi": "3.0.3",
            "info": {"title": "Private runtime fixture", "version": "1.0.0"},
            "paths": paths,
        }
        openapi_path = artifacts / "openapi.json"
        openapi_sha256 = self._write_private_json(openapi_path, openapi)
        openapi_raw = openapi_path.read_bytes()
        catalog = render_relution_openapi.build_machine_catalog(
            openapi,
            openapi_raw,
            openapi_path.name,
        )
        catalog_path = artifacts / "catalog.json"
        catalog_sha256 = self._write_private_json(catalog_path, catalog)
        operations_by_role = {
            operation["operation_id"].removeprefix("fixture_"): operation
            for operation in catalog["operations"]
        }
        binding_records = []
        for concept, workflow_id in sorted(profile_pairs):
            required_roles = workflow_index[workflow_id]["required_roles"]
            operation_references = []
            for role in required_roles:
                operation = operations_by_role[role]
                operation_references.append(
                    {
                        "role": role,
                        "operation_key": operation["key"],
                        "surface": operation["surface"],
                        "method": operation["method"],
                        "path": operation["path"],
                        "lineage": operation["lineage"],
                        "operation_id": operation["operation_id"],
                        "request_schema_refs": [],
                        "response_schema_refs": [],
                        "expected_success_statuses": ["200"],
                        "source_contract_verified": True,
                    }
                )
            binding_records.append(
                {
                    "concept_id": concept,
                    "binding_completeness": "complete_for_requested_workflow",
                    "workflow_id": workflow_id,
                    "required_roles": copy.deepcopy(required_roles),
                    "operations": operation_references,
                    "scope_bindings": [
                        {
                            "scope_kind": "organization",
                            "location": "token",
                            "name": None,
                            "operation_keys": [
                                reference["operation_key"]
                                for reference in operation_references
                            ],
                            "source_contract_verified": True,
                        }
                    ],
                    "notes": ["Synthetic offline fixture."],
                }
            )
        bindings = {
            "$schema": "urn:campusweave-relution:schema:target-bindings:1.0.0",
            "schema_version": "1.0.0",
            "document_type": "relution-target-contract-bindings",
            "binding_status": "resolved",
            "sensitive_values_present": False,
            "target": {
                "authorized_origin": "https://example.invalid",
                "reported_version": "fixture-1.0.0",
                "organization_id": "fixture-org",
            },
            "contract": {
                "catalog_path": "catalog.json",
                "source_sha256": openapi_sha256,
                "operation_count": catalog["operation_count"],
                "catalog_checked_current": True,
                "validated_at": "2026-07-18T00:00:00Z",
            },
            "bindings": binding_records,
            "unresolved_concept_ids": [],
        }
        bindings_path = artifacts / "bindings.json"
        bindings_sha256 = self._write_private_json(bindings_path, bindings)

        empty_set_sha256 = hashlib.sha256(b"").hexdigest()
        inventory = {
            "$schema": "urn:campusweave-relution:schema:university-inventory-snapshot:1.0.0",
            "schema_version": "1.0.0",
            "document_type": "relution-university-inventory-snapshot",
            "snapshot_status": "complete",
            "sensitive_values_present": False,
            "profile_sha256": profile_sha256,
            "target": {
                "authorized_origin": "https://example.invalid",
                "relution_version": "fixture-1.0.0",
                "organization_id": "fixture-org",
            },
            "contract_sha256": openapi_sha256,
            "captured_at": "2026-07-18T00:00:00Z",
            "scope": {
                "organization_id": "fixture-org",
                "platform_families": ["ios_ipados"],
                "device_count": 0,
                "group_count": 0,
                "policy_count": 0,
                "assignment_count": 0,
                "membership_frozen": True,
            },
            "set_digests": {
                "device_ids_sha256": empty_set_sha256,
                "group_ids_sha256": empty_set_sha256,
                "policy_ids_sha256": empty_set_sha256,
                "assignment_ids_sha256": empty_set_sha256,
            },
            "capture_proof": {
                "read_only": True,
                "pagination_complete": True,
                "reported_totals_reconciled": True,
                "duplicate_ids_rejected": True,
            },
        }
        inventory_path = artifacts / "inventory.json"
        inventory_sha256 = self._write_private_json(inventory_path, inventory)

        context = {
            "$schema": "urn:campusweave-relution:schema:university-runtime-target:1.0.0",
            "schema_version": "1.0.0",
            "document_type": "relution-university-runtime-target",
            "context_status": "evidence_bound",
            "sensitive_values_present": False,
            "execution_authorized": False,
            "profile": {
                "path": profile_path.name,
                "package_id": self.profile["package"]["package_id"],
                "sha256": profile_sha256,
            },
            "target": {
                "authorized_origin": "https://example.invalid",
                "effective_api_server": "https://example.invalid",
                "relution_version": "fixture-1.0.0",
                "organization_id": "fixture-org",
                "organization_name": "Fixture University",
            },
            "contract": {
                "openapi_path": openapi_path.name,
                "openapi_sha256": openapi_sha256,
                "catalog_path": catalog_path.name,
                "catalog_sha256": catalog_sha256,
                "operation_count": catalog["operation_count"],
                "checked_current": True,
            },
            "bindings": {
                "path": bindings_path.name,
                "sha256": bindings_sha256,
                "status": "contract_bound",
                "semantic_role_status": "operator_asserted_unproven",
            },
            "inventory": {
                "path": inventory_path.name,
                "sha256": inventory_sha256,
                "captured_at": "2026-07-18T00:00:00Z",
                "complete_for_scope": True,
            },
            "evidence_root": artifacts.name,
            "stop_reasons": [
                "Evidence binding does not prove operation-role semantics, authorize execution, or provide request bodies."
            ],
        }
        context_path = root / "target.json"
        self._write_private_json(context_path, context)
        return context, context_path, profile_path

    def test_compiler_is_deterministic_and_preserves_abstract_intent_boundaries(self) -> None:
        first = build_execution_plan(self.profile, self.profile_digest)
        second = build_execution_plan(copy.deepcopy(self.profile), self.profile_digest)

        self.assertEqual(first, second)
        self.assertEqual(validate_execution_plan(first, self.profile, self.profile_digest), [])
        self.assertEqual(len(first["steps"]), 48)
        self.assertEqual(
            Counter(step["kind"] for step in first["steps"]),
            {
                "group_scope_blueprint": 7,
                "policy_definition_intent": 15,
                "policy_publication_prerequisite": 15,
                "assignment_intent": 11,
            },
        )
        self.assertEqual({step["resource_cardinality"] for step in first["steps"]}, {"unresolved"})
        self.assertEqual({step["state"] for step in first["steps"]}, {"unbound"})
        self.assertTrue(all(step["operation_bindings"] == [] for step in first["steps"]))
        self.assertFalse(first["execution_authorized"])
        self.assertFalse(first["network_capable"])
        self.assertFalse(first["mutation_capable"])

        for step in first["steps"]:
            if step["kind"] != "assignment_intent":
                continue
            desired = step["desired_state"]
            self.assertIn(f"publication:{desired['policy_id']}", step["dependencies"])
            self.assertIn(f"group:{desired['scope_blueprint_id']}", step["dependencies"])

    def test_recomputed_digest_cannot_hide_plan_semantic_tampering(self) -> None:
        plan = build_execution_plan(self.profile, self.profile_digest)
        plan["steps"].pop()
        unsigned = {key: value for key, value in plan.items() if key != "plan_sha256"}
        plan["plan_sha256"] = canonical_sha256(unsigned)

        errors = validate_execution_plan(plan, self.profile, self.profile_digest)

        self.assertIn("deterministic compilation", "\n".join(errors))

    def test_cli_builds_owner_only_plan_and_dry_run_uses_no_subprocess(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "plan.json"
            with redirect_stdout(io.StringIO()):
                self.assertEqual(cli.main(["plan", "build", "--output", str(output)]), 0)
            self.assertEqual(stat.S_IMODE(output.stat().st_mode), 0o600)

            stdout = io.StringIO()
            with mock.patch.object(subprocess, "run", side_effect=AssertionError("subprocess forbidden")):
                with redirect_stdout(stdout):
                    result = cli.main(["dry-run", "--plan", str(output)])

            self.assertEqual(result, 0)
            report = json.loads(stdout.getvalue())
            self.assertEqual(report["network_calls"], 0)
            self.assertEqual(report["mutation_calls"], 0)
            self.assertFalse(report["execution_ready"])

    def test_cli_refuses_to_replace_an_existing_artifact(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "plan.json"
            output.write_text("owned by caller", encoding="utf-8")
            with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
                result = cli.main(["plan", "build", "--output", str(output)])
            self.assertEqual(result, 1)
            self.assertEqual(output.read_text(encoding="utf-8"), "owned by caller")

    def test_plan_validation_is_private_by_default_with_explicit_local_override(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "plan.json"
            with redirect_stdout(io.StringIO()):
                self.assertEqual(cli.main(["plan", "build", "--output", str(output)]), 0)
            os.chmod(output, 0o644)

            stderr = io.StringIO()
            with redirect_stderr(stderr):
                default_result = cli.main(["plan", "validate", "--plan", str(output)])
            with redirect_stdout(io.StringIO()):
                override_result = cli.main(
                    ["plan", "validate", "--plan", str(output), "--allow-nonprivate"]
                )

            self.assertEqual(default_result, 1)
            self.assertIn("must have mode 0600", stderr.getvalue())
            self.assertEqual(override_result, 0)

    def test_contract_check_rejects_ambiguous_json_before_subprocess(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            valid_spec = root / "valid-spec.json"
            valid_catalog = root / "valid-catalog.json"
            valid_spec.write_text('{"openapi":"3.0.3","paths":{}}', encoding="utf-8")
            valid_catalog.write_text('{"status":"not_generated"}', encoding="utf-8")
            cases = (
                (
                    '{"openapi":"3.0.3","paths":{},"paths":{"/hidden":{}}}',
                    valid_catalog,
                    "duplicate JSON key 'paths'",
                    "spec.json",
                ),
                (
                    '{"status":"generated","operation_count":NaN}',
                    valid_spec,
                    "non-standard JSON constant 'NaN'",
                    "catalog.json",
                ),
            )
            for payload, counterpart, expected, filename in cases:
                with self.subTest(filename=filename):
                    malformed = root / filename
                    malformed.write_text(payload, encoding="utf-8")
                    spec = malformed if filename == "spec.json" else counterpart
                    catalog = malformed if filename == "catalog.json" else counterpart
                    stderr = io.StringIO()
                    with mock.patch.object(
                        subprocess,
                        "run",
                        side_effect=AssertionError("subprocess must not run"),
                    ), redirect_stderr(stderr):
                        result = cli.main(
                            [
                                "contract",
                                "check",
                                "--spec",
                                str(spec),
                                "--catalog",
                                str(catalog),
                            ]
                        )

                    self.assertEqual(result, 1)
                    self.assertIn(expected, stderr.getvalue())

    def test_instantiation_rebinds_every_institution_namespace(self) -> None:
        profile = instantiate_profile(self.profile, "example-u", "Example University")
        errors: list[str] = []
        concepts = university_profile.concept_ids_from_manifest(MANIFEST_PATH, errors)
        errors.extend(university_profile.validate_package(profile, concepts))

        self.assertEqual(errors, [])
        self.assertEqual(profile["package"]["package_id"], "example-u-relution-desired-state-v1")
        self.assertEqual(profile["organization_units"][0]["unit_id"], "ou.example-u")
        self.assertTrue(all(item["policy_id"].startswith("example-u-policy.") for item in profile["policy_units"]))
        self.assertTrue(all(item["workflow_id"].startswith("example-u.") for item in profile["api_workflows"]))
        self.assertEqual(profile["commit_boundary"]["target_local_root"], "private/example-u")

    def test_instantiation_enforces_institution_namespace_bounds(self) -> None:
        minimum = instantiate_profile(self.profile, "a", "A")
        maximum = instantiate_profile(self.profile, "a" * 48, "Example University")

        self.assertEqual(minimum["package"]["institution_code"], "a")
        self.assertEqual(maximum["package"]["institution_code"], "a" * 48)
        with self.assertRaisesRegex(ValueError, "at most 48"):
            instantiate_profile(self.profile, "a" * 49, "Example University")
        with self.assertRaisesRegex(ValueError, "1 through 200"):
            instantiate_profile(self.profile, "example-u", " " * 201)

    def test_strict_artifact_loader_rejects_duplicate_keys_nan_and_symlinks(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            duplicate = root / "duplicate.json"
            duplicate.write_text('{"a": 1, "a": 2}', encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "duplicate JSON key"):
                strict_load_json(duplicate)
            nan = root / "nan.json"
            nan.write_text('{"a": NaN}', encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "non-standard JSON constant 'NaN'"):
                strict_load_json(nan)
            target = root / "target.json"
            target.write_text("{}", encoding="utf-8")
            link = root / "link.json"
            link.symlink_to(target)
            with self.assertRaisesRegex(ValueError, "symlink"):
                strict_load_json(link)

    def test_private_artifact_loader_rejects_symlinked_path_components(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            os.chmod(root, 0o700)
            outside = root / "outside"
            outside.mkdir(mode=0o700)
            artifact = outside / "artifact.json"
            artifact.write_text("{}", encoding="utf-8")
            os.chmod(artifact, 0o600)
            (root / "nested").symlink_to(outside, target_is_directory=True)

            with self.assertRaisesRegex(ValueError, "without following symlinks"):
                load_json_beneath(root, "nested/artifact.json")

    def test_atomic_writer_never_replaces_existing_output(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "artifact.json"
            atomic_write_json(output, {"first": True})
            with self.assertRaisesRegex(ValueError, "already exists"):
                atomic_write_json(output, {"second": True})
            self.assertEqual(strict_load_json(output), {"first": True})

    def test_checked_in_target_template_is_valid_non_authorizing_and_urn_bound(self) -> None:
        document = strict_load_json(TARGET_TEMPLATE_PATH)
        errors = validate_target_context(document, TARGET_TEMPLATE_PATH, self.profile, PROFILE_PATH)

        self.assertEqual(errors, [])
        self.assertEqual(
            document["$schema"],
            "urn:campusweave-relution:schema:university-runtime-target:1.0.0",
        )
        self.assertEqual(document["context_status"], "template")
        self.assertEqual(document["bindings"]["semantic_role_status"], "unresolved")
        self.assertFalse(document["execution_authorized"])
        self.assertFalse(document["sensitive_values_present"])

    def test_target_context_rejects_credential_like_text(self) -> None:
        document = strict_load_json(TARGET_TEMPLATE_PATH)
        document["stop_reasons"] = ["access_token=must-not-be-stored"]

        errors = validate_target_context(document, TARGET_TEMPLATE_PATH, self.profile, PROFILE_PATH)

        self.assertIn("credential-like text is forbidden", "\n".join(errors))

    def test_evidence_bound_target_context_proves_exact_private_evidence_only(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            context, context_path, profile_path = self._evidence_bound_target_fixture(
                Path(temporary)
            )
            profile, profile_sha256 = load_json_with_sha256(profile_path, private=True)

            errors = validate_target_context(
                context,
                context_path,
                profile,
                profile_path,
                profile_sha256,
            )

            self.assertEqual(errors, [])
            self.assertEqual(
                context["bindings"]["semantic_role_status"],
                "operator_asserted_unproven",
            )
            self.assertFalse(context["execution_authorized"])

    def test_evidence_bound_target_rejects_concept_only_read_binding_shortcut(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            context, context_path, profile_path = self._evidence_bound_target_fixture(root)
            bindings_path = root / "artifacts/bindings.json"
            bindings = strict_load_json(bindings_path, private=True)
            read_reference = next(
                operation
                for record in bindings["bindings"]
                for operation in record["operations"]
                if operation["role"] == "read"
            )
            concepts = sorted({record["concept_id"] for record in bindings["bindings"]})
            bindings["bindings"] = [
                {
                    "concept_id": concept,
                    "binding_completeness": "complete_for_requested_workflow",
                    "workflow_id": "fixture.read.v1",
                    "required_roles": ["read"],
                    "operations": [copy.deepcopy(read_reference)],
                    "scope_bindings": [
                        {
                            "scope_kind": "organization",
                            "location": "token",
                            "name": None,
                            "operation_keys": [read_reference["operation_key"]],
                            "source_contract_verified": True,
                        }
                    ],
                    "notes": ["Intentionally incomplete negative fixture."],
                }
                for concept in concepts
            ]
            context["bindings"]["sha256"] = self._write_private_json(
                bindings_path,
                bindings,
            )
            self._write_private_json(context_path, context)

            errors = validate_target_context(
                context,
                context_path,
                self.profile,
                profile_path,
            )

            joined = "\n".join(errors)
            self.assertIn("missing profile concept/workflow bindings", joined)
            self.assertIn("contains bindings outside the supplied profile", joined)

    def test_evidence_bound_target_rejects_get_relabelled_as_mutation_roles(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            context, context_path, profile_path = self._evidence_bound_target_fixture(root)
            bindings_path = root / "artifacts/bindings.json"
            bindings = strict_load_json(bindings_path, private=True)
            read_reference = next(
                operation
                for record in bindings["bindings"]
                for operation in record["operations"]
                if operation["role"] == "read" and operation["method"] == "GET"
            )
            for record in bindings["bindings"]:
                record["operations"] = [
                    {**copy.deepcopy(read_reference), "role": role}
                    for role in record["required_roles"]
                ]
                record["scope_bindings"][0]["operation_keys"] = [
                    read_reference["operation_key"]
                ]
            context["bindings"]["sha256"] = self._write_private_json(
                bindings_path,
                bindings,
            )
            self._write_private_json(context_path, context)

            errors = validate_target_context(
                context,
                context_path,
                self.profile,
                profile_path,
            )

            joined = "\n".join(errors)
            self.assertIn("mutation role", joined)
            self.assertIn("cannot use non-mutating method 'GET'", joined)
            self.assertIn("cannot mix mutation roles", joined)

    def test_evidence_bound_target_rejects_create_delete_role_swap(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            context, context_path, profile_path = self._evidence_bound_target_fixture(root)
            bindings_path = root / "artifacts/bindings.json"
            bindings = strict_load_json(bindings_path, private=True)
            record = next(
                item
                for item in bindings["bindings"]
                if item["concept_id"] == "group.device.dynamic"
                and item["workflow_id"] == "university.group.dynamic-lifecycle.v1"
            )
            create = next(item for item in record["operations"] if item["role"] == "create")
            delete = next(item for item in record["operations"] if item["role"] == "delete")
            create["role"], delete["role"] = delete["role"], create["role"]
            context["bindings"]["sha256"] = self._write_private_json(
                bindings_path,
                bindings,
            )
            self._write_private_json(context_path, context)

            errors = validate_target_context(
                context,
                context_path,
                self.profile,
                profile_path,
            )

            joined = "\n".join(errors)
            self.assertIn("role 'create' requires one of POST, PUT, not 'DELETE'", joined)
            self.assertIn("role 'delete' requires one of DELETE, not 'POST'", joined)

    def test_evidence_bound_target_context_rejects_non_object_catalog_without_crashing(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            context, context_path, profile_path = self._evidence_bound_target_fixture(
                Path(temporary)
            )
            catalog_path = Path(temporary) / "artifacts/catalog.json"
            context["contract"]["catalog_sha256"] = self._write_private_json(
                catalog_path,
                [],
            )
            self._write_private_json(context_path, context)

            errors = validate_target_context(
                context,
                context_path,
                self.profile,
                profile_path,
            )

            self.assertIn("catalog JSON root must be an object", "\n".join(errors))

    def test_evidence_bound_target_context_rejects_evidence_symlink_component(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            context, context_path, profile_path = self._evidence_bound_target_fixture(root)
            outside = root / "outside"
            outside.mkdir(mode=0o700)
            outside_inventory = outside / "inventory.json"
            outside_inventory.write_bytes((root / "artifacts/inventory.json").read_bytes())
            os.chmod(outside_inventory, 0o600)
            (root / "artifacts/linked").symlink_to(outside, target_is_directory=True)
            context["inventory"]["path"] = "linked/inventory.json"
            self._write_private_json(context_path, context)

            errors = validate_target_context(
                context,
                context_path,
                self.profile,
                profile_path,
            )

            self.assertIn("without following symlinks", "\n".join(errors))

    def test_evidence_bound_target_context_rejects_invalid_port_without_crashing(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            context, context_path, profile_path = self._evidence_bound_target_fixture(
                Path(temporary)
            )
            context["target"]["authorized_origin"] = "https://example.invalid:not-a-port"
            context["target"]["effective_api_server"] = "https://example.invalid:not-a-port"
            self._write_private_json(context_path, context)

            errors = validate_target_context(
                context,
                context_path,
                self.profile,
                profile_path,
            )

            self.assertIn("contains an invalid host or port", "\n".join(errors))

    def test_evidence_bound_target_context_requires_private_mode_and_exact_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            context_path = root / "target.json"
            document = strict_load_json(TARGET_TEMPLATE_PATH)
            document["context_status"] = "evidence_bound"
            document["target"]["authorized_origin"] = "https://example.invalid"
            document["target"]["effective_api_server"] = "https://other.invalid"
            context_path.write_text(json.dumps(document), encoding="utf-8")
            os.chmod(context_path, 0o644)

            errors = validate_target_context(document, context_path, self.profile, PROFILE_PATH)

            joined = "\n".join(errors)
            self.assertIn("must have mode 0600", joined)
            self.assertIn("must equal the explicitly authorized origin", joined)
            self.assertIn("must be an evidence-bound, trimmed string", joined)

    def test_target_context_rejects_malformed_origins_and_template_path_traversal(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            context_path = Path(temporary) / "target.json"
            document = strict_load_json(TARGET_TEMPLATE_PATH)
            document["context_status"] = "evidence_bound"
            document["profile"]["path"] = "../profile.json"
            document["target"]["authorized_origin"] = "https://example.invalid/path"
            document["target"]["effective_api_server"] = "https://example.invalid?query=forbidden"
            context_path.write_text(json.dumps(document), encoding="utf-8")
            os.chmod(context_path, 0o600)

            errors = validate_target_context(document, context_path, self.profile, PROFILE_PATH)

            joined = "\n".join(errors)
            self.assertIn("$.profile.path: must be a normalized traversal-free relative path", joined)
            self.assertIn(
                "$.target.authorized_origin: must be an HTTPS origin without credentials, path, query, or fragment",
                joined,
            )
            self.assertIn(
                "$.target.effective_api_server: must be an HTTPS origin without credentials, path, query, or fragment",
                joined,
            )

    def test_large_acyclic_step_graph_does_not_report_a_cycle(self) -> None:
        plan = build_execution_plan(self.profile, self.profile_digest)
        prototype = copy.deepcopy(plan["steps"][0])
        steps = []
        for index in range(1200):
            step = copy.deepcopy(prototype)
            step["step_id"] = f"group:synthetic-{index}"
            step["dependencies"] = [] if index == 0 else [f"group:synthetic-{index - 1}"]
            steps.append(step)
        plan["steps"] = steps
        unsigned = {key: value for key, value in plan.items() if key != "plan_sha256"}
        plan["plan_sha256"] = canonical_sha256(unsigned)

        errors = validate_execution_plan(plan, self.profile, self.profile_digest)

        self.assertNotIn("$.steps: dependency graph contains a cycle", errors)

if __name__ == "__main__":
    unittest.main()
