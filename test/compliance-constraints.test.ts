import assert from "node:assert/strict";
import test from "node:test";
import {
  buildComplianceReport,
  type ComplianceSourceCatalogs,
} from "../src/compliance.js";
import { createTestAppleSchemaCatalog } from "./compliance-fixtures.js";
import type {
  RecommendationCatalogResponse,
  RecommendationRecord,
  RecommendationRulesetMapping,
  RecommendationSettingBundleCatalog,
  RecommendationSource,
} from "../src/recommendation-types.js";
import type { RelutionTemplateBundle } from "../src/templates.js";
import type { PolicyWorkspace } from "../src/workspace.js";

test("buildComplianceReport treats array contains-all constraints as compliant for stricter sets", () => {
  const report = buildComplianceReport({
    workspace: createWorkspace("ANDROID_ENTERPRISE", {
      type: "ANDROID_ENTERPRISE_KEYGUARD_FEATURE_MANAGEMENT",
      keyguardDisabledFeatures: ["NOTIFICATIONS", "TRUST_AGENTS"],
    }),
    selection: { policyIndex: 0, versionIndex: 0 },
    sources: ["cis"],
    catalogs: createArtifacts(
      "cis",
      [
        createNativeRecommendation({
          values: { keyguardDisabledFeatures: ["NOTIFICATIONS"] },
          constraints: [{ path: "keyguardDisabledFeatures", operator: "containsAll", value: ["NOTIFICATIONS"] }],
        }),
      ],
    ),
    bundle: createBundle(),
    appleSchema: createTestAppleSchemaCatalog(),
  });

  const result = report.results.find((entry) => entry.recommendationId === "cis-android-keyguard-notifications");
  assert.ok(result);
  assert.equal(result.status, "compliant");
  assert.equal(result.mappingResults[0]?.status, "compliant");
});

for (const scenario of [
  { name: "rejects atMost(3) when 4 values are configured", actual: 4, limit: 3, expectedStatus: "exact-gap" },
  { name: "accepts atMost(3) when 3 values are configured", actual: 3, limit: 3, expectedStatus: "compliant" },
  { name: "accepts atMost(3) when 2 values are configured", actual: 2, limit: 3, expectedStatus: "compliant" },
  { name: "accepts atMost(3) when 0 values are configured", actual: 0, limit: 3, expectedStatus: "compliant" },
  { name: "rejects atMost(0) when 1 value is configured", actual: 1, limit: 0, expectedStatus: "exact-gap" },
] as const) {
  test(`buildComplianceReport ${scenario.name}`, () => {
    const report = buildComplianceReport({
      workspace: createWorkspace("ANDROID_ENTERPRISE", {
        type: "ANDROID_ENTERPRISE_KEYGUARD_FEATURE_MANAGEMENT",
        maximumConfiguredValues: scenario.actual,
      }),
      selection: { policyIndex: 0, versionIndex: 0 },
      sources: ["cis"],
      catalogs: createArtifacts(
        "cis",
        [
          createNativeRecommendation({
            values: { maximumConfiguredValues: scenario.limit },
            constraints: [{ path: "maximumConfiguredValues", operator: "atMost", value: scenario.limit }],
          }),
        ],
      ),
      bundle: createBundle(),
      appleSchema: createTestAppleSchemaCatalog(),
    });

    const result = report.results.find((entry) => entry.recommendationId === "cis-android-keyguard-notifications");
    assert.ok(result);
    assert.equal(result.status, scenario.expectedStatus);
    assert.equal(result.mappingResults[0]?.status, scenario.expectedStatus === "compliant" ? "compliant" : "mismatch");
  });
}

function createArtifacts(
  source: RecommendationSource,
  recommendations: RecommendationRecord[],
): Partial<Record<RecommendationSource, ComplianceSourceCatalogs>> {
  return {
    [source]: {
      recommendationCatalog: {
        source,
        label: source.toUpperCase(),
        available: true,
        verifiedAsOf: "2026-04-24",
        recommendationCount: recommendations.length,
        displayPlatforms: ["ANDROID_ENTERPRISE"],
        importPlatforms: ["ANDROID_ENTERPRISE"],
        displayToImportPlatform: { ANDROID_ENTERPRISE: "ANDROID_ENTERPRISE" },
        recommendations,
      } satisfies RecommendationCatalogResponse,
      settingBundleCatalog: {
        version: 1,
        name: `${source} bundles`,
        verifiedAsOf: "2026-04-24",
        sourceRecommendationCatalogPath: `example/${source}-references/${source}-recommendations.json`,
        importableRulesetPath: `example/${source}-references/${source}-relution-ruleset.json`,
        bundles: [],
        variantGroups: [],
        nonImportableRecommendations: [],
      } satisfies RecommendationSettingBundleCatalog,
    },
  };
}

function createNativeRecommendation(props: {
  readonly values: Record<string, unknown>;
  readonly constraints: RecommendationRulesetMapping["constraints"];
}): RecommendationRecord {
  return {
    id: "cis-android-keyguard-notifications",
    platform: "ANDROID_ENTERPRISE",
    osFamily: "ANDROID_ENTERPRISE",
    benchmarkId: "cis-android",
    benchmarkTitle: "CIS Android Benchmark",
    benchmarkVersion: "1.0.0",
    benchmarkDate: "2026-04-24",
    managementSurface: "ANDROID_ENTERPRISE",
    sourcePdfPath: "example/cis-references/downloads/pdf/CIS_Android.pdf",
    sourceIds: ["cis-android-keyguard-notifications"],
    recommendationId: "1.1.1",
    profileApplicability: ["Level 1"],
    title: "Disable lock-screen notifications",
    description: "Disable lock-screen notifications",
    rationale: "Disable lock-screen notifications",
    impact: "",
    audit: "",
    remediation: "",
    defaultValue: false,
    references: [],
    recommendedValue: props.values,
    fallbackTranslations: [],
    relutionMapping: {
      status: "exact",
      mergeableInImportableRuleset: true,
      candidates: [{
        kind: "relution-native",
        target: "ANDROID_ENTERPRISE_KEYGUARD_FEATURE_MANAGEMENT",
        fieldPaths: Object.keys(props.values),
      }],
      rulesetMappings: [
        {
          kind: "relution-native",
          type: "ANDROID_ENTERPRISE_KEYGUARD_FEATURE_MANAGEMENT",
          values: props.values,
          ...(props.constraints === undefined ? {} : { constraints: props.constraints }),
        },
      ],
      notes: [],
    },
    implementation: {
      category: "relution-achievable",
      surfaces: ["relution-native"],
      importableVia: ["apply-json", "ruleset-import"],
      blockingReasons: [],
    },
    familySourceId: "cis-android-family",
    additionalInformation: "",
    assessmentStatus: "Automated",
  };
}

function createWorkspace(platform: string, details: Record<string, unknown>): PolicyWorkspace {
  return {
    metadata: {},
    report: {},
    policies: [
      {
        path: "policies/policy_test.json",
        document: {
          uuid: "policy-test",
          name: "Test Policy",
          platform,
          versions: [
            {
              uuid: "version-test",
              configurations: [
                {
                  uuid: "configuration-test",
                  details: {
                    uuid: "details-test",
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

function createBundle(): RelutionTemplateBundle {
  return {
    serverVersion: "26.1.1",
    sourceImage: "relution/server:26.1.1",
    sourceImageDigest: "sha256:test",
    generatedAt: "2026-04-24T00:00:00.000Z",
    refreshDiagnostics: {
      runtimeMetadata: {
        source: "reflected",
        reflectedCount: 0,
        configurationTypeCount: 0,
      },
      iosSystemAppsLoaded: false,
      springConfigurationMetadataLoaded: false,
    },
    platforms: ["ANDROID_ENTERPRISE"],
    enrollmentTypes: [],
    configurationTypes: [],
    schemas: {},
    iosSystemApps: {},
    springConfigurationMetadata: {},
  };
}
