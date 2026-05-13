import assert from "node:assert/strict";
import test from "node:test";
import { loadAppleSchemaCatalog } from "../src/apple-schema-catalog.js";
import { buildComplianceReport } from "../src/compliance.js";
import type { ComplianceSourceCatalogs } from "../src/compliance-types.js";
import type { RecommendationCatalogResponse, RecommendationRecord } from "../src/recommendation-types.js";
import { loadTemplateBundle } from "../src/templates.js";
import type { PolicyWorkspace } from "../src/workspace.js";

test("parameterized BSI mappings surface as parameter-required compliance work", () => {
  const recommendation = {
    id: "bsi-mdm-strategy",
    platform: "IOS",
    osFamily: "IOS",
    policyName: "iOS BSI Grundschutz",
    moduleId: "SYS.3.2.2",
    moduleTitle: "Mobile Device Management",
    moduleRole: "shared-mobile-mdm-baseline",
    sourceIds: ["sys-3-2-2-mdm"],
    supportingSourceIds: [],
    category: "Basis-Anforderungen",
    requirementId: "SYS.3.2.2.A1",
    title: "Festlegung einer Strategie für das Mobile Device Management",
    status: "active",
    protectionLevel: "B",
    actors: [],
    paragraphs: ["Eine Strategie MUSS festgelegt werden."],
    requirementText: "Eine Strategie MUSS festgelegt werden.",
    reason: "Eine Strategie MUSS festgelegt werden.",
    descriptionContext: [],
    checklistThreatIds: [],
    checklistThreatTitles: [],
    moduleThreatContext: [],
    errata: [],
    relutionMapping: {
      status: "parameterized",
      mergeableInImportableRuleset: false,
      candidates: [{ kind: "relution-native", target: "IOS_APP_COMPLIANCE", fieldPaths: ["requiredApps"] }],
      rulesetMappings: [],
      parameterRequirements: [
        {
          id: "local-scope",
          path: "scope.assetGroup",
          label: "Managed asset scope",
          description: "Define the managed device group.",
        },
      ],
      processSupport: [
        {
          id: "relution-evidence",
          relutionFunction: "Relution enrollment and compliance workflow",
          evidence: "Attach policy and compliance report evidence.",
        },
      ],
      notes: ["Local scope decisions remain required."],
    },
    implementation: {
      category: "relution-partial",
      surfaces: ["relution-native"],
      importableVia: [],
      blockingReasons: ["Local scope decisions remain required."],
    },
    fallbackTranslations: [],
  } satisfies RecommendationRecord;
  const artifacts: Partial<Record<"bsi", ComplianceSourceCatalogs>> = {
    bsi: {
      recommendationCatalog: createCatalog(recommendation),
    },
  };

  const report = buildComplianceReport({
    workspace: createWorkspace(),
    selection: { policyIndex: 0, versionIndex: 0 },
    sources: ["bsi"],
    catalogs: artifacts,
    bundle: loadTemplateBundle(),
    appleSchema: loadAppleSchemaCatalog(),
  });

  const result = report.results[0];
  assert.equal(report.summary.byStatus["parameter-required"], 1);
  assert.equal(result?.status, "parameter-required");
  assert.equal(result?.blockingReasons.some((reason) => reason.includes("Managed asset scope")), true);
  assert.equal(result?.blockingReasons.some((reason) => reason.includes("Relution enrollment")), true);
});

function createCatalog(recommendation: RecommendationRecord): RecommendationCatalogResponse {
  return {
    source: "bsi",
    label: "BSI",
    available: true,
    verifiedAsOf: "2026-04-24",
    recommendationCount: 1,
    displayPlatforms: ["IOS"],
    importPlatforms: ["IOS"],
    displayToImportPlatform: { IOS: "IOS" },
    recommendations: [recommendation],
    ruleset: { version: 1, name: "BSI", policies: [] },
  };
}

function createWorkspace(): PolicyWorkspace {
  return {
    metadata: {},
    report: {},
    policies: [
      {
        path: "policies/policy_test.json",
        document: {
          name: "iOS policy",
          platform: "IOS",
          versions: [{ configurations: [] }],
        },
      },
    ],
  };
}
