import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { startEditorServer } from "../src/editor-server.js";
import { type RelutionTemplateBundle } from "../src/templates.js";
import { type PolicyWorkspace, schemaCompatibilityIssues, validateWorkspace } from "../src/workspace.js";

const TEST_TYPE = "TEST_SANITIZE_SCHEMA";

test("sanitizeSchema preserves valid patterns so invalid values still fail validation", () => {
  // A valid pattern is a real workspace constraint; sanitizing it away would turn bad input into a false success.
  const bundle = createBundle({
    PatternSchema: objectSchema({
      required: ["type", "name"],
      properties: {
        type: { const: TEST_TYPE },
        name: { type: "string", pattern: "^[A-Z]+$" },
      },
    }),
  });

  const validation = validateWorkspace(createWorkspace({ name: "lowercase" }), bundle);

  assert.equal(validation.ok, false);
  assert.equal(validation.errors.some((error) => error.message.includes("^[A-Z]+$")), true);
  assert.deepEqual(schemaCompatibilityIssues(bundle), []);
});

test("sanitizeSchema preserves nullable scalar schemas so explicit null remains valid", () => {
  // Relution exports OpenAPI-style nullable fields; a required nullable field must not be rejected as malformed JSON Schema.
  const bundle = createBundle({
    NullableScalarSchema: objectSchema({
      required: ["type", "name"],
      properties: {
        type: { const: TEST_TYPE },
        name: { type: "string", nullable: true },
      },
    }),
  });

  const validation = validateWorkspace(createWorkspace({ name: null }), bundle);

  assert.equal(validation.ok, true);
  assert.deepEqual(validation.errors, []);
});

test("sanitizeSchema allows optional allOf properties to be null", () => {
  // Optional OpenAPI object properties often arrive as null; allOf wrappers must not make those fields stricter than intended.
  const bundle = createBundle({
    AllOfSchema: objectSchema({
      required: ["type"],
      properties: {
        type: { const: TEST_TYPE },
        nested: {
          allOf: [
            objectSchema({
              required: ["enabled"],
              properties: {
                enabled: { const: true },
              },
            }),
          ],
        },
      },
    }),
  });

  const validation = validateWorkspace(createWorkspace({ nested: null }), bundle);

  assert.equal(validation.ok, true);
  assert.deepEqual(validation.errors, []);
});

test("sanitizeSchema recursively processes nested properties", () => {
  // Deep optional leaves must be nullable after sanitizing, otherwise valid sparse policy details fail far from the source field.
  const bundle = createBundle({
    NestedPropertiesSchema: objectSchema({
      required: ["type", "outer"],
      properties: {
        type: { const: TEST_TYPE },
        outer: objectSchema({
          required: ["inner"],
          properties: {
            inner: objectSchema({
              required: [],
              properties: {
                leaf: { type: "integer" },
              },
            }),
          },
        }),
      },
    }),
  });

  const validation = validateWorkspace(createWorkspace({ outer: { inner: { leaf: null } } }), bundle);

  assert.equal(validation.ok, true);
  assert.deepEqual(validation.errors, []);
});

test("sanitizeSchema leaves root refs usable through AJV", () => {
  // Root refs are schema routing, not field constraints; validation must still target the referenced schema.
  const bundle = createBundle({
    RootRefSchema: { $ref: "relution-openapi#/components/schemas/ReferencedDetails" },
    ReferencedDetails: objectSchema({
      required: ["type", "requiredValue"],
      properties: {
        type: { const: TEST_TYPE },
        requiredValue: { type: "string" },
      },
    }),
  }, "RootRefSchema");

  const validation = validateWorkspace(createWorkspace({}), bundle);

  assert.equal(validation.ok, false);
  assert.equal(validation.errors.some((error) => error.message.includes("requiredValue")), true);
});

test("sanitizeSchema records invalid patterns as explicit compatibility warnings", () => {
  // Invalid regex constraints are removed for AJV compatibility, so the operator needs a named warning instead of silent weakening.
  const bundle = createBundle({
    InvalidPatternSchema: objectSchema({
      required: ["type", "name"],
      properties: {
        type: { const: TEST_TYPE },
        name: { type: "string", pattern: "[" },
      },
    }),
  });

  const validation = validateWorkspace(createWorkspace({ name: "anything" }), bundle);
  const issues = schemaCompatibilityIssues(bundle);

  assert.equal(validation.ok, true);
  assert.equal(validation.schemaCompatibilityIssueCount, 1);
  assert.equal(validation.schemaCompatibilityIssues?.[0]?.path, "InvalidPatternSchema.properties.name");
  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.schemaName, "InvalidPatternSchema");
  assert.equal(issues[0]?.path, "InvalidPatternSchema.properties.name");
  assert.equal(issues[0]?.kind, "invalid-pattern");
  assert.equal(issues[0]?.pattern, "[");
  assert.match(issues[0]?.message ?? "", /unterminated character class/i);
});

test("build response includes removed regex constraints with affected schema paths", async () => {
  // The build API is the operator-facing surface; removed validation constraints must be visible there, not only in internal caches.
  const root = mkdtempSync(join(tmpdir(), "relution-sanitize-build-"));
  const workspace = join(root, "workspace");
  const bundlePath = join(root, "template-bundle.json");
  const bundle = createBundle({
    InvalidPatternBuildSchema: objectSchema({
      required: ["type", "name"],
      properties: {
        type: { const: TEST_TYPE },
        name: { type: "string", pattern: "[" },
      },
    }),
  });
  writeFileSync(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`);
  writeWorkspace(workspace, createWorkspace({ name: "anything" }));

  const handle = await startEditorServer({
    workspace,
    key: "test-key",
    out: join(root, "out.rexp"),
    bundlePath,
    port: 0,
  });
  try {
    const response = await postJson(handle.url, "/api/build", {});
    const result = await response.json() as {
      constraintsRemoved?: Array<{ path?: string; constraint?: string; original?: string }>;
      validation?: { schemaCompatibilityIssues?: Array<{ path?: string; pattern?: string }> };
    };

    assert.equal(response.ok, true, JSON.stringify(result));
    assert.deepEqual(result.constraintsRemoved, [
      {
        path: "InvalidPatternBuildSchema.properties.name",
        constraint: "pattern",
        original: "[",
      },
    ]);
    assert.equal(result.validation?.schemaCompatibilityIssues?.[0]?.path, "InvalidPatternBuildSchema.properties.name");
    assert.equal(result.validation?.schemaCompatibilityIssues?.[0]?.pattern, "[");
  } finally {
    await handle.close();
  }
});

function createBundle(
  schemas: RelutionTemplateBundle["schemas"],
  schemaName = Object.keys(schemas)[0] ?? "MissingSchema",
): RelutionTemplateBundle {
  return {
    serverVersion: "test",
    sourceImage: "test",
    sourceImageDigest: "sha256:test",
    generatedAt: "2026-05-28T00:00:00.000Z",
    refreshDiagnostics: {
      runtimeMetadata: {
        source: "reflected",
        reflectedCount: 1,
        configurationTypeCount: 1,
      },
      iosSystemAppsLoaded: false,
      springConfigurationMetadataLoaded: false,
    },
    platforms: ["IOS"],
    enrollmentTypes: [],
    configurationTypes: [
      {
        type: TEST_TYPE,
        label: "Sanitize Schema",
        schemaName,
        platforms: ["IOS"],
        enrollmentTypes: [],
        multiConfig: true,
        portalHidden: false,
        placeholders: [],
        required: [],
        fields: [],
      },
    ],
    schemas,
    iosSystemApps: {},
    springConfigurationMetadata: {},
  };
}

function createWorkspace(details: Record<string, unknown>): PolicyWorkspace {
  return {
    metadata: {},
    report: {},
    policies: [
      {
        path: "policies/policy_sanitize_schema.json",
        document: {
          platform: "IOS",
          versions: [
            {
              configurations: [
                {
                  details: {
                    type: TEST_TYPE,
                    ...details,
                  },
                },
              ],
            },
          ],
        },
      },
    ],
  };
}

function writeWorkspace(workspaceDir: string, workspace: PolicyWorkspace): void {
  mkdirSync(join(workspaceDir, "policies"), { recursive: true });
  writeFileSync(join(workspaceDir, "metadata.json"), `${JSON.stringify(workspace.metadata, null, 2)}\n`);
  writeFileSync(join(workspaceDir, "report.json"), `${JSON.stringify(workspace.report, null, 2)}\n`);
  for (const policy of workspace.policies) {
    writeFileSync(join(workspaceDir, policy.path), `${JSON.stringify(policy.document, null, 2)}\n`);
  }
}

function objectSchema(options: { required: string[]; properties: Record<string, unknown> }): Record<string, unknown> {
  return {
    type: "object",
    required: options.required,
    properties: options.properties,
  };
}

async function postJson(baseUrl: string, path: string, body: unknown): Promise<Response> {
  return fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
