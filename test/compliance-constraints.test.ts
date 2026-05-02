import assert from "node:assert/strict";
import test from "node:test";
import {
  buildComplianceReport,
  type ComplianceSourceArtifacts,
} from "../src/compliance.js";
import type { AppleSchemaCatalog } from "../src/apple-schema.js";
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
    appleSchema: createAppleSchemaCatalog(),
  });

  const result = report.results.find((entry) => entry.recommendationId === "cis-android-keyguard-notifications");
  assert.ok(result);
  assert.equal(result.status, "compliant");
  assert.equal(result.mappingResults[0]?.status, "compliant");
});

function createArtifacts(
  source: RecommendationSource,
  recommendations: RecommendationRecord[],
): Partial<Record<RecommendationSource, ComplianceSourceArtifacts>> {
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
    helperFallbacks: [],
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
    fallbackTranslations: [],
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

function createAppleSchemaCatalog(): AppleSchemaCatalog {
  return {
    version: 1,
    source: {
      repository: "apple/device-management",
      revision: "test",
      generatedAt: "2026-04-24T00:00:00.000Z",
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
