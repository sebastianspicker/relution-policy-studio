import type { AppleSchemaEntry } from "../src/apple-schema.js";
import type { RelutionTemplateBundle } from "../src/templates.js";
import type { PolicyWorkspace } from "../src/workspace.js";

export function createOptionalParityAppleSchemaEntry(): AppleSchemaEntry {
  return {
    id: "profile:com.example.optional-parity",
    kind: "profile",
    title: "Optional Parity",
    description: "",
    identifier: "com.example.optional-parity",
    sourcePath: "local/OptionalParity.yaml",
    availability: {
      platforms: ["IOS"],
      allowMultiple: true,
      requiresMdm: false,
      deprecated: false,
      notes: [],
    },
    deprecated: false,
    fields: [
      {
        path: "requiredName",
        payloadKey: "RequiredName",
        title: "Required name",
        kind: "string",
        required: true,
        description: "",
        defaultValue: "alpha",
        enumValues: [],
        variableSafe: true,
      },
      {
        path: "optionalToggle",
        payloadKey: "OptionalToggle",
        title: "Optional toggle",
        kind: "boolean",
        required: false,
        description: "",
        defaultValue: false,
        enumValues: [],
        variableSafe: false,
      },
      {
        path: "optionalCount",
        payloadKey: "OptionalCount",
        title: "Optional count",
        kind: "integer",
        required: false,
        description: "",
        defaultValue: 0,
        enumValues: [],
        variableSafe: false,
      },
      {
        path: "optionalMode",
        payloadKey: "OptionalMode",
        title: "Optional mode",
        kind: "string",
        required: false,
        description: "",
        defaultValue: "",
        enumValues: ["automatic", "manual"],
        variableSafe: true,
      },
    ],
  };
}

export function createSchemaCompatibilityFixture(pattern: string): RelutionTemplateBundle {
  return {
    serverVersion: "test",
    sourceImage: "test",
    sourceImageDigest: "sha256:test",
    generatedAt: "2026-04-23T00:00:00.000Z",
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
        type: "TEST_SCHEMA_COMPAT",
        label: "Schema Compatibility",
        schemaName: "TestSchemaCompatibility",
        platforms: ["IOS"],
        enrollmentTypes: [],
        multiConfig: true,
        portalHidden: false,
        placeholders: [],
        required: [],
        fields: [],
      },
    ],
    schemas: {
      TestSchemaCompatibility: {
        type: "object",
        required: ["type", "name"],
        properties: {
          type: { const: "TEST_SCHEMA_COMPAT" },
          name: { type: "string", pattern },
        },
      },
    },
    iosSystemApps: {},
    springConfigurationMetadata: {},
  };
}

export function createSchemaCompatibilityWorkspace(name: string): PolicyWorkspace {
  return {
    metadata: {},
    report: {},
    policies: [
      {
        path: "policies/policy_schema_compat.json",
        document: {
          platform: "IOS",
          versions: [
            {
              configurations: [
                {
                  details: {
                    type: "TEST_SCHEMA_COMPAT",
                    name,
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
