import assert from "node:assert/strict";
import test from "node:test";
import { buildComplianceReport } from "../src/compliance.js";
import { recommendationImplementationOf } from "../src/compliance-internals.js";
import type { ComplianceSourceCatalogs } from "../src/compliance-types.js";
import type { CisRecommendationRecord, RecommendationCatalogResponse, RecommendationRecord } from "../src/recommendation-types.js";
import {
  createTestAppleSchemaCatalog,
  createTestPolicyWorkspace,
  createTestTemplateBundle,
} from "./compliance-fixtures.js";

test("fallbackTranslations classify as helper-only in compliance", () => {
  const recommendation = createFallbackTranslationRecommendation();
  const implementation = recommendationImplementationOf(recommendation);

  assert.equal(implementation.category, "helper-only");
  assert.deepEqual(implementation.surfaces, ["helper"]);
  assert.equal(recommendation.fallbackTranslations?.length, 1);

  const report = buildComplianceReport({
    workspace: createWorkspace(),
    selection: { policyIndex: 0, versionIndex: 0 },
    sources: ["cis"],
    catalogs: createArtifacts(recommendation),
    bundle: createTestTemplateBundle(),
    appleSchema: createTestAppleSchemaCatalog(),
  });

  assert.equal(report.summary.byStatus["not-checkable"], 1);
  assert.equal(report.results[0]?.blockingReasons.includes("Manual helper fallback remains available."), true);
  assert.deepEqual(report.results[0]?.remediationOptions, []);
});

test("recommendationImplementationOf returns the declared implementation unchanged", () => {
  const recommendation = createFallbackTranslationRecommendation();

  assert.equal(recommendationImplementationOf(recommendation), recommendation.implementation);
});

test("recommendationImplementationOf throws when implementation is missing", () => {
  const recommendation = createFallbackTranslationRecommendation();
  delete recommendation.implementation;

  assert.throws(
    () => recommendationImplementationOf(recommendation),
    /Recommendation cis-ios-helper-only is missing the 'implementation' field/u,
  );
});

test("fallbackTranslations require manual audit instead of automatic remediation", () => {
  const recommendation = createFallbackTranslationRecommendation();
  recommendation.fallbackTranslations = [createFallbackTranslation("modern-helper")];

  const report = buildComplianceReport({
    workspace: createWorkspace(),
    selection: { policyIndex: 0, versionIndex: 0 },
    sources: ["cis"],
    catalogs: createArtifacts(recommendation),
    bundle: createTestTemplateBundle(),
    appleSchema: createTestAppleSchemaCatalog(),
  });
  const result = report.results[0];

  assert.equal(result?.recommendationId, "cis-ios-helper-only");
  assert.equal(result?.status, "not-checkable");
  assert.deepEqual(result?.remediationOptions, []);
  assert.equal(result?.blockingReasons.includes("Manual helper fallback remains available."), true);
});

function createFallbackTranslation(id: string): NonNullable<RecommendationRecord["fallbackTranslations"]>[number] {
  return {
    id,
    role: "audit",
    method: "terminal",
    title: "Check the setting manually",
    rawText: "Open the console and inspect the setting.",
    commands: [],
  };
}

function createFallbackTranslationRecommendation(): CisRecommendationRecord {
  return {
    id: "cis-ios-helper-only",
    platform: "IOS",
    osFamily: "IOS",
    benchmarkId: "cis-ios",
    benchmarkTitle: "CIS iOS Benchmark",
    benchmarkVersion: "1.0.0",
    benchmarkDate: "2026-04-24",
    managementSurface: "IOS",
    sourcePdfPath: "example/cis-references/downloads/pdf/CIS_iOS.pdf",
    sourceIds: ["cis-ios-helper-only"],
    recommendationId: "1.1.1",
    profileApplicability: ["Level 1"],
    title: "Review helper fallback setting",
    description: "Review helper fallback setting",
    rationale: "Review helper fallback setting",
    impact: "",
    audit: "",
    remediation: "",
    defaultValue: false,
    references: [],
    recommendedValue: false,
    fallbackTranslations: [
      {
        id: "cis-ios-helper-only-audit",
        role: "audit",
        method: "terminal",
        title: "Check the setting manually",
        rawText: "Open the console and inspect the setting.",
        commands: [],
      },
    ],
    relutionMapping: {
      status: "none",
      mergeableInImportableRuleset: false,
      candidates: [],
      rulesetMappings: [],
      notes: ["Manual helper fallback remains available."],
    },
    implementation: {
      category: "helper-only",
      surfaces: ["helper"],
      importableVia: [],
      blockingReasons: ["Manual helper fallback remains available."],
    },
    familySourceId: "cis-ios-family",
    additionalInformation: "",
    assessmentStatus: "Manual",
  };
}

function createArtifacts(recommendation: RecommendationRecord): Partial<Record<"cis", ComplianceSourceCatalogs>> {
  return {
    cis: {
      recommendationCatalog: {
        source: "cis",
        label: "CIS",
        available: true,
        verifiedAsOf: "2026-04-24",
        recommendationCount: 1,
        displayPlatforms: ["IOS"],
        importPlatforms: ["IOS"],
        displayToImportPlatform: { IOS: "IOS" },
        recommendations: [recommendation],
      } satisfies RecommendationCatalogResponse,
    },
  };
}

function createWorkspace() {
  return createTestPolicyWorkspace({ name: "iOS policy" });
}
