from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
SCRIPT = REPOSITORY_ROOT / "scripts" / "render_relution_openapi.py"
FIXTURE = REPOSITORY_ROOT / "tests" / "fixtures" / "sample-openapi.json"


class RenderRelutionOpenApiTests(unittest.TestCase):
    def run_renderer(self, *arguments: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(SCRIPT), *arguments],
            cwd=REPOSITORY_ROOT,
            check=False,
            capture_output=True,
            text=True,
        )

    def test_renders_every_path_and_webhook_operation(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            output = Path(temporary_directory) / "catalog.md"
            result = self.run_renderer(
                "--spec",
                str(FIXTURE),
                "--output",
                str(output),
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            rendered = output.read_text(encoding="utf-8")
            self.assertIn("- Operations: **4**", rendered)
            self.assertIn("### 1. GET /api/settings/{settingId}", rendered)
            self.assertIn("### 2. PATCH /api/settings/{settingId}", rendered)
            self.assertIn("### 3. POST /api/tasks/query", rendered)
            self.assertIn("### 4. POST taskFinished", rendered)
            self.assertIn("`X-User-Access-Token`", rendered)
            self.assertIn("`#/components/schemas/SettingPatch`", rendered)
            self.assertIn("`If-Match`", rendered)
            self.assertIn("`ETag`", rendered)
            self.assertIn("Anonymous (`security: []`)", rendered)

    def test_output_is_deterministic_and_check_detects_staleness(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            output = Path(temporary_directory) / "catalog.md"
            generate = self.run_renderer(
                "--spec",
                str(FIXTURE),
                "--output",
                str(output),
            )
            self.assertEqual(generate.returncode, 0, generate.stderr)
            first = output.read_bytes()

            regenerate = self.run_renderer(
                "--spec",
                str(FIXTURE),
                "--output",
                str(output),
            )
            self.assertEqual(regenerate.returncode, 0, regenerate.stderr)
            self.assertEqual(output.read_bytes(), first)

            current = self.run_renderer(
                "--spec",
                str(FIXTURE),
                "--output",
                str(output),
                "--check",
            )
            self.assertEqual(current.returncode, 0, current.stderr)
            self.assertIn("contains 4 operations", current.stdout)

            output.write_text(output.read_text(encoding="utf-8") + "stale\n", encoding="utf-8")
            stale = self.run_renderer(
                "--spec",
                str(FIXTURE),
                "--output",
                str(output),
                "--check",
            )
            self.assertEqual(stale.returncode, 1)
            self.assertIn("stale:", stale.stderr)

    def test_json_output_is_deterministic_and_supports_paired_and_json_checks(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary_path = Path(temporary_directory)
            output = temporary_path / "catalog.md"
            json_output = temporary_path / "catalog.json"
            arguments = (
                "--spec",
                str(FIXTURE),
                "--output",
                str(output),
                "--json-output",
                str(json_output),
            )

            generate = self.run_renderer(*arguments)
            self.assertEqual(generate.returncode, 0, generate.stderr)
            first = json_output.read_bytes()
            catalog = json.loads(first)
            self.assertEqual(catalog["status"], "generated")
            self.assertEqual(catalog["schema_version"], "1.0.0")
            self.assertEqual(catalog["operation_count"], 4)
            self.assertEqual(
                catalog["source"]["sha256"],
                hashlib.sha256(FIXTURE.read_bytes()).hexdigest(),
            )
            self.assertTrue(catalog["completeness"]["source_contract_authoritative"])
            self.assertFalse(catalog["completeness"]["examples_included"])
            keys = [operation["key"] for operation in catalog["operations"]]
            self.assertEqual(len(keys), len(set(keys)))
            self.assertTrue(
                all(
                    key.startswith("operation.sha256.") and len(key) == 81
                    for key in keys
                )
            )

            patch_operation = next(
                operation
                for operation in catalog["operations"]
                if operation["operation_id"] == "updateSetting"
            )
            self.assertEqual(patch_operation["surface"], "paths")
            self.assertEqual(patch_operation["method"], "PATCH")
            self.assertEqual(patch_operation["tags"], ["Settings"])
            self.assertEqual(patch_operation["request_body"]["kind"], "openapi3")
            self.assertEqual(
                patch_operation["request_body"]["content"][0]["schema"]["ref"],
                "#/components/schemas/SettingPatch",
            )
            self.assertEqual(
                [response["status"] for response in patch_operation["responses"]],
                ["204", "412"],
            )
            self.assertEqual(patch_operation["security"]["source"], "contract")
            self.assertEqual(patch_operation["servers"]["source"], "contract")

            regenerate = self.run_renderer(*arguments)
            self.assertEqual(regenerate.returncode, 0, regenerate.stderr)
            self.assertEqual(json_output.read_bytes(), first)

            paired_current = self.run_renderer(*arguments, "--check")
            self.assertEqual(paired_current.returncode, 0, paired_current.stderr)
            self.assertIn(str(json_output), paired_current.stdout)

            json_output.write_text("{}\n", encoding="utf-8")
            paired_stale = self.run_renderer(*arguments, "--check")
            self.assertEqual(paired_stale.returncode, 1)
            self.assertIn(f"stale: {json_output}", paired_stale.stderr)

            regenerate = self.run_renderer(*arguments)
            self.assertEqual(regenerate.returncode, 0, regenerate.stderr)
            output.write_text("stale markdown\n", encoding="utf-8")
            json_only_current = self.run_renderer(*arguments, "--json-check")
            self.assertEqual(json_only_current.returncode, 0, json_only_current.stderr)
            paired_markdown_stale = self.run_renderer(*arguments, "--check")
            self.assertEqual(paired_markdown_stale.returncode, 1)
            self.assertIn(f"stale: {output}", paired_markdown_stale.stderr)

    def test_json_check_requires_json_output(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            result = self.run_renderer(
                "--spec",
                str(FIXTURE),
                "--output",
                str(Path(temporary_directory) / "catalog.md"),
                "--json-check",
            )

            self.assertEqual(result.returncode, 2)
            self.assertIn("--json-check requires --json-output", result.stderr)

    def test_json_catalog_omits_examples_extensions_and_curl_samples(self) -> None:
        contract = json.loads(FIXTURE.read_text(encoding="utf-8"))
        secret = "NEVER_INCLUDE_THIS_TOKEN"
        patch_operation = contract["paths"]["/api/settings/{settingId}"]["patch"]
        patch_operation["x-codeSamples"] = [
            {
                "lang": "Shell",
                "source": f"curl -H 'Authorization: Bearer {secret}'",
            }
        ]
        patch_operation["parameters"][0]["example"] = secret
        patch_operation["requestBody"]["content"]["application/json"]["example"] = {
            "token": secret
        }
        contract["components"]["schemas"]["SettingPatch"]["example"] = {
            "token": secret
        }
        contract["components"]["securitySchemes"]["userAccessTokenAuth"][
            "x-secret"
        ] = secret

        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary_path = Path(temporary_directory)
            spec = temporary_path / "examples.json"
            output = temporary_path / "catalog.md"
            json_output = temporary_path / "catalog.json"
            spec.write_text(json.dumps(contract), encoding="utf-8")

            result = self.run_renderer(
                "--spec",
                str(spec),
                "--output",
                str(output),
                "--json-output",
                str(json_output),
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            rendered = json_output.read_text(encoding="utf-8")
            self.assertNotIn(secret, rendered)
            self.assertNotIn("curl -H", rendered)
            self.assertNotIn("x-codeSamples", rendered)
            self.assertNotIn('"example"', rendered)

    def test_rejects_unknown_path_item_key_to_avoid_silent_omission(self) -> None:
        malformed = {
            "openapi": "3.0.3",
            "info": {"title": "Malformed", "version": "1"},
            "paths": {
                "/api/example": {
                    "fetch": {
                        "responses": {"200": {"description": "Unexpected method"}}
                    }
                }
            },
        }
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary_path = Path(temporary_directory)
            spec = temporary_path / "malformed.json"
            output = temporary_path / "catalog.md"
            spec.write_text(json.dumps(malformed), encoding="utf-8")

            result = self.run_renderer(
                "--spec",
                str(spec),
                "--output",
                str(output),
            )

            self.assertEqual(result.returncode, 2)
            self.assertIn("unsupported path-item key 'fetch'", result.stderr)
            self.assertFalse(output.exists())

    def test_rejects_lowercase_additional_operation_method(self) -> None:
        malformed = {
            "openapi": "3.2.0",
            "info": {"title": "Lowercase method", "version": "1"},
            "paths": {
                "/api/items": {
                    "additionalOperations": {
                        "copy": {
                            "operationId": "copyItems",
                            "responses": {"204": {"description": "Copied"}},
                        }
                    }
                }
            },
        }
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary_path = Path(temporary_directory)
            spec = temporary_path / "lowercase.json"
            output = temporary_path / "catalog.md"
            spec.write_text(json.dumps(malformed), encoding="utf-8")

            result = self.run_renderer(
                "--spec", str(spec), "--output", str(output)
            )

            self.assertEqual(result.returncode, 2)
            self.assertIn("must use uppercase wire-method spelling", result.stderr)
            self.assertFalse(output.exists())

    def test_rejects_null_operation_to_avoid_silent_omission(self) -> None:
        malformed = {
            "openapi": "3.0.3",
            "info": {"title": "Null operation", "version": "1"},
            "paths": {"/api/example": {"get": None}},
        }
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary_path = Path(temporary_directory)
            spec = temporary_path / "null-operation.json"
            output = temporary_path / "catalog.md"
            spec.write_text(json.dumps(malformed), encoding="utf-8")

            result = self.run_renderer(
                "--spec",
                str(spec),
                "--output",
                str(output),
            )

            self.assertEqual(result.returncode, 2)
            self.assertIn("paths./api/example.get must be an object", result.stderr)
            self.assertFalse(output.exists())

    def test_rejects_external_top_level_path_reference(self) -> None:
        malformed = {
            "openapi": "3.1.0",
            "info": {"title": "External", "version": "1"},
            "paths": {
                "/api/example": {
                    "$ref": "https://example.invalid/path-items.json#/Example"
                }
            },
        }
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary_path = Path(temporary_directory)
            spec = temporary_path / "external.json"
            output = temporary_path / "catalog.md"
            spec.write_text(json.dumps(malformed), encoding="utf-8")

            result = self.run_renderer(
                "--spec",
                str(spec),
                "--output",
                str(output),
            )

            self.assertEqual(result.returncode, 2)
            self.assertIn("unsupported external reference", result.stderr)
            self.assertFalse(output.exists())

    def test_rejects_external_callback_reference(self) -> None:
        malformed = {
            "openapi": "3.1.1",
            "info": {"title": "External callback", "version": "1"},
            "paths": {
                "/api/example": {
                    "post": {
                        "callbacks": {
                            "result": {
                                "$ref": "https://example.invalid/callbacks.json#/Result"
                            }
                        },
                        "responses": {"202": {"description": "Accepted"}},
                    }
                }
            },
        }
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary_path = Path(temporary_directory)
            spec = temporary_path / "external-callback.json"
            output = temporary_path / "catalog.md"
            spec.write_text(json.dumps(malformed), encoding="utf-8")

            result = self.run_renderer(
                "--spec",
                str(spec),
                "--output",
                str(output),
            )

            self.assertEqual(result.returncode, 2)
            self.assertIn("unsupported external reference", result.stderr)
            self.assertFalse(output.exists())

    def test_rejects_unknown_openapi_feature_version(self) -> None:
        unsupported = {
            "openapi": "3.3.0",
            "info": {"title": "Future", "version": "1"},
            "paths": {},
        }
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary_path = Path(temporary_directory)
            spec = temporary_path / "future.json"
            output = temporary_path / "catalog.md"
            spec.write_text(json.dumps(unsupported), encoding="utf-8")

            result = self.run_renderer(
                "--spec",
                str(spec),
                "--output",
                str(output),
            )

            self.assertEqual(result.returncode, 2)
            self.assertIn("supported feature sets are OpenAPI 3.0, 3.1, and 3.2", result.stderr)
            self.assertFalse(output.exists())

    def test_openapi_32_enumerates_query_additional_methods_and_callbacks(self) -> None:
        contract = {
            "openapi": "3.2.0",
            "info": {"title": "OpenAPI 3.2", "version": "1"},
            "servers": [
                {
                    "url": "https://{tenant}.example.invalid/{base}",
                    "variables": {
                        "tenant": {"default": "mdm", "enum": ["mdm", "test"]},
                        "base": {"default": "relution"},
                    },
                }
            ],
            "paths": {
                "/api/events": {
                    "post": {
                        "operationId": "createEvent",
                        "servers": [
                            {
                                "url": "https://{region}.example.invalid",
                                "variables": {"region": {"default": "eu"}},
                            }
                        ],
                        "callbacks": {
                            "onComplete": {
                                "{$request.body#/callbackUrl}": {
                                    "additionalOperations": {
                                        "NOTIFY": {
                                            "operationId": "notifyComplete",
                                            "callbacks": {
                                                "receipt": {
                                                    "{$request.body#/receiptUrl}": {
                                                        "post": {
                                                            "operationId": "receiveReceipt",
                                                            "responses": {
                                                                "204": {
                                                                    "description": "Received"
                                                                }
                                                            },
                                                        }
                                                    }
                                                }
                                            },
                                            "responses": {
                                                "204": {"description": "Received"}
                                            },
                                        }
                                    }
                                }
                            }
                        },
                        "responses": {"202": {"description": "Accepted"}},
                    },
                    "query": {
                        "operationId": "queryEvents",
                        "responses": {"200": {"description": "Results"}},
                    },
                    "additionalOperations": {
                        "COPY": {
                            "operationId": "copyEvents",
                            "responses": {"200": {"description": "Copied"}},
                        }
                    },
                }
            },
        }
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary_path = Path(temporary_directory)
            spec = temporary_path / "openapi-32.json"
            output = temporary_path / "catalog.md"
            json_output = temporary_path / "catalog.json"
            spec.write_text(json.dumps(contract), encoding="utf-8")

            result = self.run_renderer(
                "--spec",
                str(spec),
                "--output",
                str(output),
                "--json-output",
                str(json_output),
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            rendered = output.read_text(encoding="utf-8")
            self.assertIn("- Operations: **5**", rendered)
            self.assertIn("- Callback operations: **2**", rendered)
            self.assertIn("- Additional-method operations: **2**", rendered)
            self.assertIn("QUERY /api/events", rendered)
            self.assertIn("COPY /api/events", rendered)
            self.assertIn("NOTIFY {$request.body#/callbackUrl}", rendered)
            self.assertIn("Callback lineage: createEvent → onComplete", rendered)
            self.assertIn(
                "Callback lineage: createEvent → onComplete → notifyComplete → receipt",
                rendered,
            )
            self.assertIn("tenant default=mdm enum=[\"mdm\", \"test\"]", rendered)
            self.assertIn("region default=eu", rendered)
            machine_catalog = json.loads(json_output.read_text(encoding="utf-8"))
            self.assertEqual(machine_catalog["operation_count"], 5)
            self.assertEqual(
                machine_catalog["contract"]["counts"]["callback_operations"], 2
            )
            self.assertEqual(
                machine_catalog["contract"]["counts"]["additional_method_operations"],
                2,
            )
            by_operation_id = {
                operation["operation_id"]: operation
                for operation in machine_catalog["operations"]
            }
            self.assertEqual(by_operation_id["queryEvents"]["method"], "QUERY")
            self.assertEqual(by_operation_id["copyEvents"]["method"], "COPY")
            self.assertEqual(by_operation_id["createEvent"]["servers"]["source"], "operation")
            self.assertEqual(
                by_operation_id["notifyComplete"]["lineage"],
                "createEvent → onComplete",
            )
            self.assertEqual(
                by_operation_id["receiveReceipt"]["lineage"],
                "createEvent → onComplete → notifyComplete → receipt",
            )

    def test_openapi_31_accepts_webhook_only_and_component_only_contracts(self) -> None:
        contracts = {
            "webhook-only": {
                "openapi": "3.1.1",
                "info": {"title": "Webhook only", "version": "1"},
                "webhooks": {
                    "completed": {
                        "post": {
                            "operationId": "completedWebhook",
                            "responses": {"204": {"description": "Received"}},
                        }
                    }
                },
            },
            "component-only": {
                "openapi": "3.1.1",
                "info": {"title": "Components only", "version": "1"},
                "components": {"schemas": {"Result": {"type": "object"}}},
            },
        }
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary_path = Path(temporary_directory)
            for name, contract in contracts.items():
                with self.subTest(name=name):
                    spec = temporary_path / f"{name}.json"
                    output = temporary_path / f"{name}.md"
                    spec.write_text(json.dumps(contract), encoding="utf-8")

                    result = self.run_renderer(
                        "--spec",
                        str(spec),
                        "--output",
                        str(output),
                    )

                    self.assertEqual(result.returncode, 0, result.stderr)
                    rendered = output.read_text(encoding="utf-8")
                    expected_count = 1 if name == "webhook-only" else 0
                    self.assertIn(f"- Operations: **{expected_count}**", rendered)

    def test_swagger_2_inherits_global_media_types(self) -> None:
        contract = {
            "swagger": "2.0",
            "info": {"title": "Swagger upload", "version": "1"},
            "host": "mdm.example.invalid",
            "basePath": "/relution",
            "schemes": ["https"],
            "consumes": ["multipart/form-data"],
            "produces": ["application/json"],
            "securityDefinitions": {
                "userAccessTokenAuth": {
                    "type": "apiKey",
                    "in": "header",
                    "name": "X-User-Access-Token",
                }
            },
            "paths": {
                "/api/upload": {
                    "post": {
                        "operationId": "uploadFile",
                        "schemes": ["http"],
                        "parameters": [
                            {
                                "name": "file",
                                "in": "formData",
                                "required": True,
                                "type": "file",
                            }
                        ],
                        "responses": {
                            "200": {
                                "description": "Uploaded",
                                "schema": {"type": "object"},
                            }
                        },
                    }
                }
            },
        }
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary_path = Path(temporary_directory)
            spec = temporary_path / "swagger.json"
            output = temporary_path / "catalog.md"
            json_output = temporary_path / "catalog.json"
            spec.write_text(json.dumps(contract), encoding="utf-8")

            result = self.run_renderer(
                "--spec",
                str(spec),
                "--output",
                str(output),
                "--json-output",
                str(json_output),
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            rendered = output.read_text(encoding="utf-8")
            self.assertIn("Contract format: **Swagger 2.0**", rendered)
            self.assertIn("https://mdm.example.invalid/relution", rendered)
            self.assertIn(
                "Swagger operation override: http://mdm.example.invalid/relution",
                rendered,
            )
            self.assertIn('Swagger consumes: ["multipart/form-data"]', rendered)
            self.assertIn("application/json: `type=object`", rendered)
            machine_catalog = json.loads(json_output.read_text(encoding="utf-8"))
            self.assertEqual(machine_catalog["contract"]["kind"], "swagger")
            operation = machine_catalog["operations"][0]
            self.assertEqual(operation["request_body"]["kind"], "swagger2")
            self.assertEqual(
                operation["request_body"]["consumes"], ["multipart/form-data"]
            )
            self.assertEqual(operation["servers"]["source"], "operation")
            self.assertEqual(
                operation["servers"]["entries"][0]["url"],
                "http://mdm.example.invalid/relution",
            )
            self.assertEqual(
                operation["responses"][0]["content"][0]["media_type"],
                "application/json",
            )

    def test_contract_loader_rejects_duplicate_keys_and_non_finite_numbers(self) -> None:
        malformed_documents = {
            "duplicate": (
                '{"openapi":"3.0.3","info":{"title":"x","version":"1"},'
                '"paths":{},"paths":{"/hidden":{}}}',
                "duplicate JSON key 'paths'",
            ),
            "nan": (
                '{"openapi":"3.0.3","info":{"title":"x","version":NaN},'
                '"paths":{}}',
                "non-standard JSON constant 'NaN'",
            ),
        }
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            for name, (payload, expected) in malformed_documents.items():
                with self.subTest(name=name):
                    spec = root / f"{name}.json"
                    output = root / f"{name}.md"
                    spec.write_text(payload, encoding="utf-8")

                    result = self.run_renderer(
                        "--spec",
                        str(spec),
                        "--output",
                        str(output),
                    )

                    self.assertEqual(result.returncode, 2)
                    self.assertIn(expected, result.stderr)
                    self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
