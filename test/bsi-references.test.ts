import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadAppleSchemaCatalog } from "../src/apple-schema-catalog.js";
import { loadTemplateBundle } from "../src/templates.js";
import { importRulesetWorkspace } from "../web/src/editor/ruleset-import.js";
import { valueAtPath, type DownloadManifestEntry, type ImportableRuleset, type JsonRecord, type SourceEntry } from "./reference-test-helpers.js";

type BaselineSummary = {
  verifiedAsOf: string;
  recommendationCatalogPath?: string;
  importableRulesetPath?: string;
  settingBundleCatalogPath?: string;
  recommendationCounts?: {
    total: number;
    active: number;
    retired: number;
    byPlatform: Record<string, number>;
  };
  operativeBaseline: {
    edition: string;
    noEdition2025Release: boolean;
    currentUpdateLayer: {
      errataDate: string;
      checklistDate: string;
    };
  };
  platforms: Record<string, unknown>;
  relutionMapping: {
    repoBuiltInRulesetMappings: Array<{ ruleId: string }>;
  };
};

type RecommendationImplementation = {
  category: string;
  surfaces: string[];
  importableVia: string[];
  blockingReasons: string[];
};

type BsiRecommendation = {
  id: string;
  platform: string;
  osFamily: string;
  moduleId: string;
  requirementId: string;
  title: string;
  status: "active" | "retired";
  requirementText: string;
  checklistThreatIds: string[];
  checklistThreatTitles: string[];
  grundschutzKompendium?: {
    individualChecklistSourcePath?: string;
    individualChecklistRequirementType?: string;
    individualChecklistMatchesDocBook?: boolean;
    differences: string[];
    relatedChecklistItems: Array<{
      moduleId: string;
      requirementId: string;
      title: string;
      sourcePath: string;
      relatedGrundschutzPlusPlusControlIds: string[];
    }>;
  };
  grundschutzPlusPlus?: {
    methodVersion: string;
    catalogVersion: string;
    platformTargetObjectCategories: string[];
    relatedControls: Array<{
      id: string;
      title: string;
      practiceId: string;
      modalVerb?: string;
      securityLevel?: string;
      statement: string;
    }>;
  };
  semanticConcepts?: Array<{
    id: string;
    label: {
      de: string;
      en: string;
    };
    matchedTerms: string[];
    evidence: Array<{
      source: string;
      matchedTerms: string[];
      confidence: number;
      excerpt: string;
      sourceId?: string;
      gsControlId?: string;
    }>;
    confidence: number;
    relatedGrundschutzPlusPlusControlIds: string[];
    candidateTargets: Array<{
      platform: string;
      kind: string;
      target: string;
      fieldPaths: string[];
      reason: string;
    }>;
  }>;
  semanticNoConceptReason?: string;
  errata: Array<{
    sourceId: string;
    excerpt: string;
  }>;
  implementation?: RecommendationImplementation;
  relutionMapping: {
    status: string;
    candidates: Array<{
      kind: string;
      target: string;
      fieldPaths: string[];
    }>;
    rulesetMappings: JsonRecord[];
  };
};

type GrundschutzPlusPlusSystematics = {
  catalog: {
    title: string;
    version: string;
    lastModified: string;
    sourcePath: string;
  };
  methodology: {
    documentVersion: string;
    processSteps: Array<{ step: number; pdcaPhase: string; practiceId: string }>;
    modalVerbDefinitions: Record<string, string>;
    policyEditorUse: Record<string, string>;
  };
  counts: {
    controls: number;
    practiceGroups: number;
    byModalVerb: Record<string, number>;
    bySecurityLevel: Record<string, number>;
  };
  policyRelevantControlIds: string[];
  controls: Array<{
    id: string;
    title: string;
    practiceId: string;
    statement: string;
  }>;
};

type ChecklistComparison = {
  individualWorkbookCount: number;
  individualRequirementCount: number;
  policyRelevantRequirementCount: number;
  workbooks: Array<{ moduleId: string; sourcePath: string; requirementCount: number }>;
  comparedPlatformModules: Array<{
    moduleId: string;
    sourcePath: string;
    usedForPlatformPolicies: boolean;
    checklistRequirementCount: number;
  }>;
  policyRelevantRequirements: Array<{
    moduleId: string;
    requirementId: string;
    sourcePath: string;
    relatedGrundschutzPlusPlusControlIds: string[];
  }>;
};

test("download manifest covers every referenced BSI source", () => {
  const sources = readJson<SourceEntry[]>("example/bsi-references/sources.json");
  const manifest = readJson<DownloadManifestEntry[]>("example/bsi-references/downloads/manifest.json");

  assert.deepEqual(
    manifest.map((entry) => entry.id).sort(),
    sources.map((entry) => entry.id).sort(),
  );

  for (const entry of manifest) {
    assert.equal(entry.url, sources.find((source) => source.id === entry.id)?.url);
    assert.equal(entry.sha256.length, 64, entry.id);
    assert.equal(entry.sizeBytes > 0, true, entry.id);
  }
});

test("baseline summary exposes the current 2023 baseline and relution mapping context", () => {
  const summary = readJson<BaselineSummary>("example/bsi-references/bsi-relution-baseline.json");

  assert.match(summary.verifiedAsOf, /^\d{4}-\d{2}-\d{2}$/u);
  assert.equal(summary.operativeBaseline.edition, "2023");
  assert.equal(summary.operativeBaseline.noEdition2025Release, true);
  assert.match(summary.operativeBaseline.currentUpdateLayer.checklistDate, /^\d{4}-\d{2}-\d{2}$/u);
  assert.match(summary.operativeBaseline.currentUpdateLayer.errataDate, /^\d{4}-\d{2}-\d{2}$/u);
  assert.deepEqual(Object.keys(summary.platforms).sort(), ["android", "ios", "macos", "windows"]);
  assert.equal(summary.recommendationCatalogPath, "example/bsi-references/bsi-recommendations.json");
  assert.equal(summary.importableRulesetPath, "example/bsi-references/bsi-relution-ruleset.json");
  assert.equal(summary.settingBundleCatalogPath, "example/bsi-references/bsi-relution-settings-catalog.json");
  assert.equal((summary as JsonRecord).grundschutzPlusPlus instanceof Object, true);
  assert.equal((summary as JsonRecord).grundschutzKompendiumChecklists instanceof Object, true);
  assert.ok(summary.recommendationCounts);
  assert.equal(summary.recommendationCounts.active + summary.recommendationCounts.retired, summary.recommendationCounts.total);
  assert.equal(sumCounts(summary.recommendationCounts.byPlatform), summary.recommendationCounts.total);
  assert.deepEqual(Object.keys(summary.recommendationCounts.byPlatform).sort(), ["ANDROID_ENTERPRISE", "IOS", "MACOS", "WINDOWS"]);
  assert.equal(Object.values(summary.recommendationCounts.byPlatform).every((count) => count > 0), true);
  assert.deepEqual(
    summary.relutionMapping.repoBuiltInRulesetMappings.map((mapping) => mapping.ruleId).sort(),
    ["bsi-android-disable-camera", "bsi-ios-disable-camera", "bsi-macos-passcode"],
  );
});

test("Grundschutz++ systematics and individual Kompendium checklists are parsed for policy enrichment", () => {
  const systematics = readJson<GrundschutzPlusPlusSystematics>("example/bsi-references/bsi-grundschutz-plusplus-systematics.json");
  const comparison = readJson<ChecklistComparison>("example/bsi-references/bsi-grundschutz-kompendium-checklist-comparison.json");

  assert.equal(systematics.catalog.title, "Anwenderkatalog Grundschutz++");
  assert.equal(systematics.catalog.sourcePath, "example/bsi-references/downloads/pdf-xlsx-html/Grundschutz++-catalog.json");
  assert.equal(systematics.methodology.documentVersion, "März 2026");
  assert.equal(systematics.methodology.processSteps.length, 5);
  assert.deepEqual(systematics.methodology.processSteps.map((step) => step.pdcaPhase), ["Plan", "Plan", "Do", "Check", "Act"]);
  assert.equal((systematics.methodology.modalVerbDefinitions.MUSS ?? "").length > 0, true);
  assert.equal(systematics.counts.controls, 647);
  assert.equal(systematics.counts.practiceGroups, 20);
  assert.equal(systematics.policyRelevantControlIds.includes("KONF.7.15"), true);
  assert.equal(systematics.controls.some((control) => control.id === "KONF.7.15" && /Netzverbindungen/u.test(control.statement)), true);

  assert.equal(comparison.individualWorkbookCount >= 100, true);
  assert.equal(comparison.individualRequirementCount > 1000, true);
  assert.equal(comparison.policyRelevantRequirementCount > 100, true);
  assert.equal(comparison.workbooks.filter((entry) => entry.moduleId.startsWith("APP.")).length, 20);
  assert.equal(comparison.workbooks.filter((entry) => entry.moduleId.startsWith("OPS.")).length, 14);
  assert.equal(comparison.workbooks.filter((entry) => entry.moduleId.startsWith("SYS.")).length, 25);
  for (const moduleId of ["APP.1.1", "APP.1.2", "APP.1.4", "OPS.1.1.3", "OPS.1.1.4", "SYS.2.1", "SYS.3.2.4"]) {
    const workbook = comparison.workbooks.find((entry) => entry.moduleId === moduleId);
    assert.notEqual(workbook, undefined, moduleId);
    assert.equal(workbook?.sourcePath.endsWith(`Checkliste_${moduleId}.xlsx`), true, moduleId);
    assert.equal((workbook?.requirementCount ?? 0) > 0, true, moduleId);
  }
  assert.equal(
    comparison.comparedPlatformModules.some((entry) => entry.moduleId === "SYS.3.2.4" && entry.usedForPlatformPolicies),
    true,
  );
  assert.equal(
    comparison.policyRelevantRequirements.some(
      (entry) => entry.moduleId === "OPS.1.1.3" && entry.relatedGrundschutzPlusPlusControlIds.includes("DET.5.10"),
    ),
    true,
  );
});

test("BSI recommendation catalog preserves platform coverage, threat linkage, and errata context", () => {
  const recommendations = readJson<BsiRecommendation[]>("example/bsi-references/bsi-recommendations.json");

  assert.equal(recommendations.length > 0, true);
  const statusCounts = countByStatus(recommendations);
  assert.equal(statusCounts.active + statusCounts.retired, recommendations.length);
  assert.equal(statusCounts.active > 0, true);
  assert.equal(statusCounts.retired > 0, true);
  const platformCounts = countByPlatform(recommendations);
  assert.equal(sumCounts(platformCounts), recommendations.length);
  assert.equal(Object.values(platformCounts).every((count) => count > 0), true);
  assert.deepEqual(Object.keys(platformCounts).sort(), ["ANDROID_ENTERPRISE", "IOS", "MACOS", "WINDOWS"]);
  assert.deepEqual([...new Set(recommendations.map((entry) => entry.osFamily))].sort(), ["ANDROID", "IOS", "MACOS", "WINDOWS"]);

  for (const entry of recommendations) {
    assert.equal(typeof entry.id, "string");
    assert.equal(entry.id.length > 0, true, entry.requirementId);
    assert.equal(typeof entry.moduleId, "string");
    assert.equal(entry.moduleId.length > 0, true, entry.requirementId);
    assert.equal(typeof entry.title, "string");
    assert.equal(entry.title.length > 0, true, entry.requirementId);
    assert.equal(typeof entry.requirementText, "string");
    assert.equal(entry.requirementText.trim().length > 0, true, entry.requirementId);
    assert.equal(Array.isArray(entry.checklistThreatIds), true, entry.requirementId);
    assert.equal(Array.isArray(entry.checklistThreatTitles), true, entry.requirementId);
    assert.equal(typeof entry.grundschutzKompendium?.individualChecklistSourcePath, "string", entry.requirementId);
    assert.equal(Array.isArray(entry.grundschutzKompendium?.relatedChecklistItems), true, entry.requirementId);
    assert.equal(typeof entry.grundschutzPlusPlus?.methodVersion, "string", entry.requirementId);
    assert.equal(Array.isArray(entry.grundschutzPlusPlus?.relatedControls), true, entry.requirementId);
    assert.equal(typeof entry.implementation?.category, "string", entry.requirementId);
    assert.equal(typeof entry.relutionMapping.status, "string");
    assert.equal(Array.isArray(entry.relutionMapping.rulesetMappings), true, entry.requirementId);
    assert.equal(
      (Array.isArray(entry.semanticConcepts) && entry.semanticConcepts.length > 0) || typeof entry.semanticNoConceptReason === "string",
      true,
      entry.requirementId,
    );
  }

  assertBsiMappingCoverage(recommendations);
  assertBsiRepresentativeRecommendations(recommendations);
});

test("BSI mandatory Basis mapping ledger covers every mandatory client requirement", () => {
  const ledger = readJson<JsonRecord>("example/bsi-references/bsi-mandatory-mapping-ledger.json");
  const rows = ledger.rows as JsonRecord[];
  const summary = ledger.summary as JsonRecord;
  const bySolutionStatus = summary.bySolutionStatus as Record<string, number>;

  assert.equal(ledger.version, 1);
  assert.equal(rows.length > 0, true);
  assert.deepEqual(Object.keys(bySolutionStatus).sort(), ["exact", "parameterized"]);
  assert.equal(sumCounts(bySolutionStatus), rows.length);
  assert.equal(rows.every((row) => Array.isArray(row.mandatoryClauses) && (row.mandatoryClauses as unknown[]).length > 0), true);
  assert.equal(rows.every((row) => row.solutionStatus === "exact" || row.solutionStatus === "parameterized"), true);
  assert.equal(
    rows.some((row) => row.platform === "WINDOWS" && row.requirementId === "SYS.2.1.A1" && row.solutionStatus === "exact"),
    true,
  );
  assert.equal(
    rows.some((row) => row.platform === "IOS" && row.requirementId === "SYS.3.2.2.A1" && row.solutionStatus === "parameterized"),
    true,
  );
});

test("BSI ruleset is importable and preserves machine-readable recommendation metadata", () => {
  const ruleset = readJson<ImportableRuleset>("example/bsi-references/bsi-relution-ruleset.json");

  assert.equal(ruleset.version, 1);
  assert.deepEqual(ruleset.policies.map((policy) => policy.platform).sort(), ["ANDROID_ENTERPRISE", "IOS", "MACOS", "WINDOWS"]);
  assert.equal(ruleset.policies.every((policy) => policy.rules.length > 0), true);
  assert.equal(
    ruleset.policies.every((policy) =>
      policy.rules.every((rule) => typeof rule.reason === "string" && rule.reason.length > 0 && Array.isArray(rule.sourceIds) && rule.sourceIds.length > 0),
    ),
    true,
  );

  const androidPolicy = ruleset.policies.find((policy) => policy.platform === "ANDROID_ENTERPRISE");
  assert.equal(androidPolicy?.rules.some((rule) => rule.id === "android-enterprise-sys-3-2-4-a2"), true);
  const androidDeveloperModeRule = androidPolicy?.rules.find((rule) => rule.id === "android-enterprise-sys-3-2-4-a2");
  assert.equal((androidDeveloperModeRule as JsonRecord | undefined)?.grundschutzPlusPlus instanceof Object, true);
  assert.equal((androidDeveloperModeRule as JsonRecord | undefined)?.grundschutzKompendium instanceof Object, true);
  const windowsPolicy = ruleset.policies.find((policy) => policy.platform === "WINDOWS");
  const windowsPacketFilterRule = windowsPolicy?.rules.find((rule) => rule.id === "windows-sys-2-1-a31");
  assert.equal((windowsPacketFilterRule as JsonRecord | undefined)?.semanticConcepts instanceof Array, true);
  assert.equal((windowsPacketFilterRule as JsonRecord | undefined)?.mappingStatus, "partial");
  assert.deepEqual((windowsPacketFilterRule as JsonRecord | undefined)?.mappings, []);
  const windowsSecurityPolicyRule = windowsPolicy?.rules.find((rule) => rule.id === "windows-sys-2-1-a43");
  assert.equal((windowsSecurityPolicyRule as JsonRecord | undefined)?.semanticConcepts instanceof Array, true);
  assert.equal((windowsSecurityPolicyRule as JsonRecord | undefined)?.mappingStatus, "partial");
  assert.deepEqual((windowsSecurityPolicyRule as JsonRecord | undefined)?.mappings, []);

  const result = importRulesetWorkspace(ruleset, loadTemplateBundle(), loadAppleSchemaCatalog());

  assert.equal(result.report.conflicts.length, 0);
  assert.equal(result.report.unresolved.length, 0);
  assert.notEqual(result.workspace, undefined);
  assert.equal(result.workspace?.policies.length, 4);
  assert.equal(
    result.workspace?.policies.some((policy) => JSON.stringify(policy.document).includes("ANDROID_ENTERPRISE_ADVANCED_SECURITY_OVERRIDES")),
    true,
  );
  assert.equal(
    result.workspace?.policies.some((policy) => JSON.stringify(policy.document).includes("com.apple.security.firewall")),
    true,
  );
});

function assertBsiMappingCoverage(recommendations: BsiRecommendation[]): void {
  const exactCounts: Record<string, number> = mappingCountByPlatform(recommendations, "exact");
  assert.equal(sumCounts(exactCounts), recommendations.filter((entry) => entry.status === "active" && entry.relutionMapping.status === "exact").length);
  assert.equal(Object.keys(exactCounts).length > 0, true);
  assert.equal((exactCounts.WINDOWS ?? 0) > 0, true);

  const candidateCounts = candidateCountByPlatform(recommendations);
  assert.equal((candidateCounts.WINDOWS ?? 0) >= 53, true, `WINDOWS candidate count ${candidateCounts.WINDOWS ?? 0}`);
  assert.equal((candidateCounts.MACOS ?? 0) >= 44, true, `MACOS candidate count ${candidateCounts.MACOS ?? 0}`);
  assert.equal((candidateCounts.IOS ?? 0) >= 54, true, `IOS candidate count ${candidateCounts.IOS ?? 0}`);
  assert.equal((candidateCounts.ANDROID_ENTERPRISE ?? 0) >= 45, true, `ANDROID_ENTERPRISE candidate count ${candidateCounts.ANDROID_ENTERPRISE ?? 0}`);
}

function assertBsiRepresentativeRecommendations(recommendations: BsiRecommendation[]): void {
  assertBsiErrataRecommendation(findBsiRecommendation(recommendations, "WINDOWS", "SYS.2.2.3.A6"));
  assertAndroidRecommendations(recommendations);
  assertWindowsRecommendations(recommendations);
  assertMacosRecommendations(recommendations);
  assertIosRecommendations(recommendations);
}

function assertAndroidRecommendations(recommendations: BsiRecommendation[]): void {
  const developerMode = findBsiRecommendation(recommendations, "ANDROID_ENTERPRISE", "SYS.3.2.4.A2");
  assert.notEqual(developerMode, undefined);
  assert.equal(developerMode?.relutionMapping.status, "exact");
  assert.equal(developerMode?.relutionMapping.rulesetMappings.length, 1);
  assert.equal(developerMode?.grundschutzKompendium?.individualChecklistSourcePath?.endsWith("Checkliste_SYS.3.2.4.xlsx"), true);
  assert.equal(developerMode?.grundschutzKompendium?.individualChecklistRequirementType, "Standard");
  assert.equal(hasPlusPlusControl(developerMode, "KONF.2.4"), true);
  assert.equal(hasPlusPlusControl(developerMode, "KONF.6.4"), true);

  const privacy = findBsiRecommendation(recommendations, "ANDROID_ENTERPRISE", "SYS.3.2.1.A6");
  assert.notEqual(privacy, undefined);
  assert.equal(privacy?.relutionMapping.status, "exact");
  assert.equal(hasSemanticConcept(privacy, "permissions_privacy"), true);
  assert.equal(hasCandidate(privacy, "relution-native", "ANDROID_ENTERPRISE_PERMISSION_MANAGEMENT"), true);
  assert.equal(hasNativeValue(privacy, "ANDROID_ENTERPRISE_PERMISSION_MANAGEMENT", "defaultPermissionPolicy", "DENY"), true);

  assertAndroidCandidateRecommendation(recommendations, "SYS.3.2.1.A16", "ANDROID_ENTERPRISE_DEVICE_CONNECTIVITY", ["ASST.4.1", "KONF.11.8"]);
  assertAndroidCandidateRecommendation(recommendations, "SYS.3.2.1.A29", "ANDROID_ENTERPRISE_DEVICE_CONNECTIVITY", []);

  const compliance = findBsiRecommendation(recommendations, "ANDROID_ENTERPRISE", "SYS.3.2.2.A20");
  assert.notEqual(compliance, undefined);
  assert.equal(hasSemanticConcept(compliance, "mdm_compliance"), true);
  assert.equal(hasCandidate(compliance, "relution-native", "ANDROID_ENTERPRISE_COMPLIANCE_ENFORCEMENT"), true);

  const mdmProduct = findBsiRecommendation(recommendations, "ANDROID_ENTERPRISE", "SYS.3.2.2.A3");
  assert.notEqual(mdmProduct, undefined);
  assert.notEqual(mdmProduct?.relutionMapping.status, "exact");
  assert.equal(hasSemanticConcept(mdmProduct, "mdm_strategy_selection"), true);
  assert.equal(hasCandidate(mdmProduct, "relution-native", "ANDROID_ENTERPRISE_APP_POLICY"), true);
  assert.equal(hasCandidate(mdmProduct, "relution-native", "ANDROID_ENTERPRISE_RESTRICTION"), true);
}

function assertAndroidCandidateRecommendation(recommendations: BsiRecommendation[], requirementId: string, target: string, controlIds: readonly string[]): void {
  const entry = findBsiRecommendation(recommendations, "ANDROID_ENTERPRISE", requirementId);
  assert.notEqual(entry, undefined);
  assert.equal(hasCandidate(entry, "relution-native", target), true);
  for (const controlId of controlIds) {
    assert.equal(hasPlusPlusControl(entry, controlId), true);
  }
}

function assertWindowsRecommendations(recommendations: BsiRecommendation[]): void {
  assertPartialWindowsRecommendation(recommendations, "SYS.2.1.A31", "firewall", "WINDOWS_FIREWALL");
  assertPartialWindowsRecommendation(recommendations, "SYS.2.1.A43", "policy_governance", "WINDOWS_LOCAL_DEVICE_SECURITY");

  const defender = findBsiRecommendation(recommendations, "WINDOWS", "SYS.2.1.A6");
  assert.notEqual(defender, undefined);
  assert.equal(defender?.relutionMapping.status, "exact");
  assert.equal(hasNativeValue(defender, "WINDOWS_ANTIVIRUS", "allowRealtimeMonitoring", true), true);
}

function assertPartialWindowsRecommendation(recommendations: BsiRecommendation[], requirementId: string, conceptId: string, nativeTarget: string): void {
  const entry = findBsiRecommendation(recommendations, "WINDOWS", requirementId);
  assert.notEqual(entry, undefined);
  assert.equal(entry?.relutionMapping.status, "partial");
  assert.equal(entry?.relutionMapping.rulesetMappings.length, 0);
  assert.equal(hasSemanticConcept(entry, conceptId), true);
  assert.equal(hasCandidate(entry, "relution-native", nativeTarget), true);
  assert.equal(hasCandidate(entry, "relution-native", "WINDOWS_CUSTOM_CSP"), true);
}

function assertMacosRecommendations(recommendations: BsiRecommendation[]): void {
  const firewall = findBsiRecommendation(recommendations, "MACOS", "SYS.2.4.A10");
  assert.notEqual(firewall, undefined);
  assert.equal(firewall?.relutionMapping.status, "exact");
  assert.equal(hasSemanticConcept(firewall, "firewall"), true);
  assert.equal(hasPlusPlusControl(firewall, "KONF.7.15"), true);
  assert.equal(hasSchemaProfileMapping(firewall, "profile:com.apple.security.firewall"), true);
  assert.equal(firewall?.implementation?.category, "relution-achievable");

  const criticalFunctions = findBsiRecommendation(recommendations, "MACOS", "SYS.2.4.A5");
  assert.notEqual(criticalFunctions, undefined);
  assert.notEqual(criticalFunctions?.relutionMapping.status, "exact");
  assert.equal(hasSemanticConcept(criticalFunctions, "security_critical_functions"), true);
  assert.equal(hasCandidate(criticalFunctions, "relution-native", "MACOS_RESTRICTION"), true);
  assert.equal(hasCandidate(criticalFunctions, "relution-native", "MACOS_SYSTEM_POLICY_CONTROL"), true);

  const autoupdate = findBsiRecommendation(recommendations, "MACOS", "SYS.2.1.A3");
  assert.notEqual(autoupdate, undefined);
  assert.equal(autoupdate?.relutionMapping.status, "exact");
  assert.equal(hasSchemaValue(autoupdate, "profile:com.apple.SoftwareUpdate", "AutomaticCheckEnabled", true), true);
  assert.equal(hasSchemaValue(autoupdate, "profile:com.apple.SoftwareUpdate", "CriticalUpdateInstall", true), true);
}

function assertIosRecommendations(recommendations: BsiRecommendation[]): void {
  const voiceAssistant = findBsiRecommendation(recommendations, "IOS", "SYS.3.2.1.A19");
  assert.notEqual(voiceAssistant, undefined);
  assert.equal(voiceAssistant?.relutionMapping.status, "exact");
  assert.equal(hasNativeValue(voiceAssistant, "IOS_RESTRICTION", "allowAssistant", false), true);
  assert.equal(hasNativeValue(voiceAssistant, "IOS_RESTRICTION", "allowAssistantWhileLocked", false), true);

  const webProxy = findBsiRecommendation(recommendations, "IOS", "SYS.3.2.1.A28");
  assert.notEqual(webProxy, undefined);
  assert.notEqual(webProxy?.relutionMapping.status, "exact");

  const cloud = findBsiRecommendation(recommendations, "IOS", "SYS.3.2.3.A14");
  assert.notEqual(cloud, undefined);
  assert.notEqual(cloud?.relutionMapping.status, "exact");
  assert.equal(hasSemanticConcept(cloud, "cloud_sync"), true);
  assert.equal(hasCandidate(cloud, "apple-schema-profile", "profile:com.apple.applicationaccess"), true);

  const strategy = findBsiRecommendation(recommendations, "IOS", "SYS.3.2.3.A1");
  assert.notEqual(strategy, undefined);
  assert.notEqual(strategy?.relutionMapping.status, "exact");
  assert.equal(hasSemanticConcept(strategy, "mdm_strategy_selection"), true);
  assert.equal(hasCandidate(strategy, "relution-native", "IOS_RESTRICTION"), true);
  assert.equal(hasCandidate(strategy, "relution-native", "IOS_SECURED_SHARED_DEVICE"), true);
}

function assertBsiErrataRecommendation(entry: BsiRecommendation | undefined): void {
  assert.notEqual(entry, undefined);
  assert.equal(entry?.errata.length, 1);
  assert.equal(entry?.errata[0]?.sourceId, "it-grundschutz-errata-2023");
  assert.equal(entry?.errata[0]?.excerpt.includes("SOLLTE"), true);
}

function findBsiRecommendation(recommendations: BsiRecommendation[], platform: string, requirementId: string): BsiRecommendation | undefined {
  return recommendations.find((entry) => entry.platform === platform && entry.requirementId === requirementId);
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(path), "utf8")) as T;
}

function hasSchemaValue(entry: BsiRecommendation | undefined, schemaId: string, path: string, expected: unknown): boolean {
  return entry?.relutionMapping.rulesetMappings.some((mapping) =>
    mapping.kind === "apple-schema-profile"
    && mapping.schemaId === schemaId
    && valueAtPath(mapping.values, path) === expected,
  ) ?? false;
}

function hasNativeValue(entry: BsiRecommendation | undefined, targetType: string, path: string, expected: unknown): boolean {
  return entry?.relutionMapping.rulesetMappings.some((mapping) =>
    mapping.kind === "relution-native"
    && mapping.type === targetType
    && valueAtPath(mapping.values, path) === expected,
  ) ?? false;
}

function hasSchemaProfileMapping(entry: BsiRecommendation | undefined, schemaId: string): boolean {
  return entry?.relutionMapping.rulesetMappings.some((mapping) => mapping.kind === "apple-schema-profile" && mapping.schemaId === schemaId) ?? false;
}

function hasCandidate(entry: BsiRecommendation | undefined, kind: string, target: string): boolean {
  return entry?.relutionMapping.candidates.some((candidate) => candidate.kind === kind && candidate.target === target) ?? false;
}

function hasSemanticConcept(entry: BsiRecommendation | undefined, conceptId: string): boolean {
  return entry?.semanticConcepts?.some((concept) => concept.id === conceptId) ?? false;
}

function hasPlusPlusControl(entry: BsiRecommendation | undefined, controlId: string): boolean {
  return entry?.grundschutzPlusPlus?.relatedControls.some((control) => control.id === controlId) ?? false;
}

function countByStatus(recommendations: BsiRecommendation[]): Record<BsiRecommendation["status"], number> {
  return recommendations.reduce(
    (counts, recommendation) => {
      counts[recommendation.status] += 1;
      return counts;
    },
    { active: 0, retired: 0 },
  );
}

function countByPlatform(recommendations: BsiRecommendation[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of recommendations) {
    counts[entry.platform] = (counts[entry.platform] ?? 0) + 1;
  }
  return counts;
}

function mappingCountByPlatform(recommendations: BsiRecommendation[], status: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of recommendations.filter((recommendation) => recommendation.status === "active" && recommendation.relutionMapping.status === status)) {
    counts[entry.platform] = (counts[entry.platform] ?? 0) + 1;
  }
  return counts;
}

function candidateCountByPlatform(recommendations: BsiRecommendation[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of recommendations.filter((recommendation) => recommendation.status === "active" && recommendation.relutionMapping.candidates.length > 0)) {
    counts[entry.platform] = (counts[entry.platform] ?? 0) + 1;
  }
  return counts;
}

function sumCounts(counts: Record<string, number>): number {
  return Object.values(counts).reduce((sum, count) => sum + count, 0);
}
