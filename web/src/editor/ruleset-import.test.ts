import { describe, expect, it } from "vitest";
import type { AppleSchemaCatalog } from "../../../src/apple-schema.js";
import type { RelutionTemplateBundle } from "../../../src/templates.js";
import { importRulesetWorkspace } from "./ruleset-import.js";

describe("importRulesetWorkspace", () => {
  it("does not mutate shared mapping values when creating configuration envelopes", () => {
    const values = { name: "Shared camera rule" };
    const ruleset = createRuleset([
      { id: "rule-one", values },
      { id: "rule-two", values },
    ]);

    const result = importRulesetWorkspace(ruleset, createBundle(), createAppleSchemaCatalog(), {
      now: 1,
      uuidFactory: sequentialUuid(),
    });

    expect(result.workspace).toBeDefined();
    expect(values).toEqual({ name: "Shared camera rule" });
  });

  it("creates distinct details UUIDs when the same mapping values object is reused", () => {
    const values = { name: "Shared camera rule" };
    const ruleset = createRuleset([
      { id: "rule-one", values },
      { id: "rule-two", values },
    ]);

    const result = importRulesetWorkspace(ruleset, createBundle(), createAppleSchemaCatalog(), {
      now: 1,
      uuidFactory: sequentialUuid(),
    });
    const document = result.workspace?.policies[0]?.document as { versions?: Array<{ configurations?: Array<{ details?: { uuid?: string } }> }> } | undefined;
    const configurations = document?.versions?.[0]?.configurations;

    expect(configurations?.map((configuration) => configuration.details?.uuid)).toEqual(["uuid-3", "uuid-5"]);
  });
});

function createRuleset(rules: Array<{ id: string; values: Record<string, unknown> }>): unknown {
  return {
    version: 1,
    name: "Mutation guard ruleset",
    policies: [
      {
        platform: "IOS",
        name: "Mutation guard policy",
        rules: rules.map((rule) => ({
          id: rule.id,
          title: rule.id,
          informational: false,
          mappings: [
            {
              kind: "relution-native",
              type: "IOS_RESTRICTION",
              values: rule.values,
            },
          ],
        })),
      },
    ],
  };
}

function createBundle(): RelutionTemplateBundle {
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
        type: "IOS_RESTRICTION",
        label: "iOS Restrictions",
        schemaName: "IosRestriction",
        platforms: ["IOS"],
        enrollmentTypes: [],
        multiConfig: true,
        portalHidden: false,
        placeholders: [],
        required: [],
        fields: [],
      },
    ],
    schemas: {},
    iosSystemApps: {},
    springConfigurationMetadata: {},
  };
}

function createAppleSchemaCatalog(): AppleSchemaCatalog {
  return {
    version: 1,
    source: {
      repository: "test",
      revision: "test",
      generatedAt: "2026-05-28T00:00:00.000Z",
    },
    counts: {
      profile: 0,
      "ddm-configuration": 0,
      "ddm-asset": 0,
      "ddm-activation": 0,
      "ddm-management": 0,
      "ddm-status": 0,
      "mdm-command": 0,
      "mdm-checkin": 0,
      "ddm-protocol": 0,
    },
    entries: [],
  };
}

function sequentialUuid(): () => string {
  let next = 0;
  return () => {
    next += 1;
    return `uuid-${String(next)}`;
  };
}
