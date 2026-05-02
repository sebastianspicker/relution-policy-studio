import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadAppleSchemaCatalog } from "../src/apple-schema-catalog.js";
import { loadTemplateBundle } from "../src/templates.js";
import { importRulesetWorkspace } from "../web/src/editor/ruleset-import.js";

type SourceEntry = {
  id: string;
  url: string;
};

type DownloadManifestEntry = {
  id: string;
  url: string;
  localPath: string;
  headersPath: string;
  textPath: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
};

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

type JsonRecord = Record<string, unknown>;

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

type RulesetPolicy = {
  platform: string;
  name: string;
  rules: Array<{
    id: string;
    title: string;
    informational?: boolean;
    mappings?: JsonRecord[];
    reason?: string;
    sourceIds?: string[];
  }>;
};

type ImportableRuleset = {
  version: number;
  name: string;
  policies: RulesetPolicy[];
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

  assert.equal(summary.verifiedAsOf, "2026-04-23");
  assert.equal(summary.operativeBaseline.edition, "2023");
  assert.equal(summary.operativeBaseline.noEdition2025Release, true);
  assert.equal(summary.operativeBaseline.currentUpdateLayer.checklistDate, "2025-03-11");
  assert.equal(summary.operativeBaseline.currentUpdateLayer.errataDate, "2025-05-05");
  assert.deepEqual(Object.keys(summary.platforms).sort(), ["android", "ios", "macos", "windows"]);
  assert.equal(summary.recommendationCatalogPath, "example/bsi-references/bsi-recommendations.json");
  assert.equal(summary.importableRulesetPath, "example/bsi-references/bsi-relution-ruleset.json");
  assert.equal(summary.settingBundleCatalogPath, "example/bsi-references/bsi-relution-settings-catalog.json");
  assert.equal((summary as JsonRecord).grundschutzPlusPlus instanceof Object, true);
  assert.equal((summary as JsonRecord).grundschutzKompendiumChecklists instanceof Object, true);
  assert.deepEqual(summary.recommendationCounts, {
    total: 278,
    active: 205,
    retired: 73,
    byPlatform: {
      ANDROID_ENTERPRISE: 65,
      IOS: 85,
      MACOS: 57,
      WINDOWS: 71,
    },
  });
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

  assert.equal(recommendations.length, 278);
  assert.equal(recommendations.filter((entry) => entry.status === "active").length, 205);
  assert.equal(recommendations.filter((entry) => entry.status === "retired").length, 73);
  assert.deepEqual([...new Set(recommendations.map((entry) => entry.platform))].sort(), ["ANDROID_ENTERPRISE", "IOS", "MACOS", "WINDOWS"]);
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

  const exactCounts: Record<string, number> = mappingCountByPlatform(recommendations, "exact");
  const windowsExactCount = exactCounts.WINDOWS ?? 0;
  assert.deepEqual(exactCounts, {
    ANDROID_ENTERPRISE: 5,
    IOS: 6,
    MACOS: 6,
    WINDOWS: 8,
  });
  assert.equal(windowsExactCount, 8);
  const candidateCounts = candidateCountByPlatform(recommendations);
  assert.equal((candidateCounts.WINDOWS ?? 0) >= 53, true, `WINDOWS candidate count ${candidateCounts.WINDOWS ?? 0}`);
  assert.equal((candidateCounts.MACOS ?? 0) >= 44, true, `MACOS candidate count ${candidateCounts.MACOS ?? 0}`);
  assert.equal((candidateCounts.IOS ?? 0) >= 54, true, `IOS candidate count ${candidateCounts.IOS ?? 0}`);
  assert.equal((candidateCounts.ANDROID_ENTERPRISE ?? 0) >= 45, true, `ANDROID_ENTERPRISE candidate count ${candidateCounts.ANDROID_ENTERPRISE ?? 0}`);

  const windowsErrata = recommendations.find(
    (entry) => entry.platform === "WINDOWS" && entry.requirementId === "SYS.2.2.3.A6",
  );
  assert.notEqual(windowsErrata, undefined);
  assert.equal(windowsErrata?.errata.length, 1);
  assert.equal(windowsErrata?.errata[0]?.sourceId, "it-grundschutz-errata-2023");
  assert.equal(windowsErrata?.errata[0]?.excerpt.includes("SOLLTE"), true);

  const androidDeveloperMode = recommendations.find(
    (entry) => entry.platform === "ANDROID_ENTERPRISE" && entry.requirementId === "SYS.3.2.4.A2",
  );
  assert.notEqual(androidDeveloperMode, undefined);
  assert.equal(androidDeveloperMode?.relutionMapping.status, "exact");
  assert.equal(androidDeveloperMode?.relutionMapping.rulesetMappings.length, 1);
  assert.equal(androidDeveloperMode?.grundschutzKompendium?.individualChecklistSourcePath?.endsWith("Checkliste_SYS.3.2.4.xlsx"), true);
  assert.equal(androidDeveloperMode?.grundschutzKompendium?.individualChecklistRequirementType, "Standard");
  assert.equal(hasPlusPlusControl(androidDeveloperMode, "KONF.2.4"), true);
  assert.equal(hasPlusPlusControl(androidDeveloperMode, "KONF.6.4"), true);

  const androidPrivacy = recommendations.find(
    (entry) => entry.platform === "ANDROID_ENTERPRISE" && entry.requirementId === "SYS.3.2.1.A6",
  );
  assert.notEqual(androidPrivacy, undefined);
  assert.equal(androidPrivacy?.relutionMapping.status, "exact");
  assert.equal(hasSemanticConcept(androidPrivacy, "permissions_privacy"), true);
  assert.equal(hasCandidate(androidPrivacy, "relution-native", "ANDROID_ENTERPRISE_PERMISSION_MANAGEMENT"), true);
  assert.equal(hasNativeValue(androidPrivacy, "ANDROID_ENTERPRISE_PERMISSION_MANAGEMENT", "defaultPermissionPolicy", "DENY"), true);

  const androidInterfaces = recommendations.find(
    (entry) => entry.platform === "ANDROID_ENTERPRISE" && entry.requirementId === "SYS.3.2.1.A16",
  );
  assert.notEqual(androidInterfaces, undefined);
  assert.equal(hasCandidate(androidInterfaces, "relution-native", "ANDROID_ENTERPRISE_DEVICE_CONNECTIVITY"), true);
  assert.equal(hasPlusPlusControl(androidInterfaces, "ASST.4.1"), true);
  assert.equal(hasPlusPlusControl(androidInterfaces, "KONF.11.8"), true);

  const androidApn = recommendations.find(
    (entry) => entry.platform === "ANDROID_ENTERPRISE" && entry.requirementId === "SYS.3.2.1.A29",
  );
  assert.notEqual(androidApn, undefined);
  assert.equal(hasCandidate(androidApn, "relution-native", "ANDROID_ENTERPRISE_DEVICE_CONNECTIVITY"), true);

  const androidCompliance = recommendations.find(
    (entry) => entry.platform === "ANDROID_ENTERPRISE" && entry.requirementId === "SYS.3.2.2.A20",
  );
  assert.notEqual(androidCompliance, undefined);
  assert.equal(hasSemanticConcept(androidCompliance, "mdm_compliance"), true);
  assert.equal(hasCandidate(androidCompliance, "relution-native", "ANDROID_ENTERPRISE_COMPLIANCE_ENFORCEMENT"), true);

  const androidMdmProduct = recommendations.find(
    (entry) => entry.platform === "ANDROID_ENTERPRISE" && entry.requirementId === "SYS.3.2.2.A3",
  );
  assert.notEqual(androidMdmProduct, undefined);
  assert.notEqual(androidMdmProduct?.relutionMapping.status, "exact");
  assert.equal(hasSemanticConcept(androidMdmProduct, "mdm_strategy_selection"), true);
  assert.equal(hasCandidate(androidMdmProduct, "relution-native", "ANDROID_ENTERPRISE_APP_POLICY"), true);
  assert.equal(hasCandidate(androidMdmProduct, "relution-native", "ANDROID_ENTERPRISE_RESTRICTION"), true);

  const windowsPacketFilter = recommendations.find(
    (entry) => entry.platform === "WINDOWS" && entry.requirementId === "SYS.2.1.A31",
  );
  assert.notEqual(windowsPacketFilter, undefined);
  assert.equal(windowsPacketFilter?.relutionMapping.status, "partial");
  assert.equal(windowsPacketFilter?.relutionMapping.rulesetMappings.length, 0);
  assert.equal(hasSemanticConcept(windowsPacketFilter, "firewall"), true);
  assert.equal(hasCandidate(windowsPacketFilter, "relution-native", "WINDOWS_FIREWALL"), true);
  assert.equal(hasCandidate(windowsPacketFilter, "relution-native", "WINDOWS_CUSTOM_CSP"), true);

  const windowsSecurityPolicy = recommendations.find(
    (entry) => entry.platform === "WINDOWS" && entry.requirementId === "SYS.2.1.A43",
  );
  assert.notEqual(windowsSecurityPolicy, undefined);
  assert.equal(windowsSecurityPolicy?.relutionMapping.status, "partial");
  assert.equal(windowsSecurityPolicy?.relutionMapping.rulesetMappings.length, 0);
  assert.equal(hasSemanticConcept(windowsSecurityPolicy, "policy_governance"), true);
  assert.equal(hasCandidate(windowsSecurityPolicy, "relution-native", "WINDOWS_LOCAL_DEVICE_SECURITY"), true);
  assert.equal(hasCandidate(windowsSecurityPolicy, "relution-native", "WINDOWS_CUSTOM_CSP"), true);

  const macosFirewall = recommendations.find(
    (entry) => entry.platform === "MACOS" && entry.requirementId === "SYS.2.4.A10",
  );
  assert.notEqual(macosFirewall, undefined);
  assert.equal(macosFirewall?.relutionMapping.status, "exact");
  assert.equal(hasSemanticConcept(macosFirewall, "firewall"), true);
  assert.equal(hasPlusPlusControl(macosFirewall, "KONF.7.15"), true);
  assert.equal(
    macosFirewall?.relutionMapping.rulesetMappings.some(
      (mapping) => mapping.kind === "apple-schema-profile" && mapping.schemaId === "profile:com.apple.security.firewall",
    ),
    true,
  );
  assert.equal(macosFirewall?.implementation?.category, "relution-achievable");

  const macosCriticalFunctions = recommendations.find(
    (entry) => entry.platform === "MACOS" && entry.requirementId === "SYS.2.4.A5",
  );
  assert.notEqual(macosCriticalFunctions, undefined);
  assert.notEqual(macosCriticalFunctions?.relutionMapping.status, "exact");
  assert.equal(hasSemanticConcept(macosCriticalFunctions, "security_critical_functions"), true);
  assert.equal(hasCandidate(macosCriticalFunctions, "relution-native", "MACOS_RESTRICTION"), true);
  assert.equal(hasCandidate(macosCriticalFunctions, "relution-native", "MACOS_SYSTEM_POLICY_CONTROL"), true);

  const iosVoiceAssistant = recommendations.find(
    (entry) => entry.platform === "IOS" && entry.requirementId === "SYS.3.2.1.A19",
  );
  assert.notEqual(iosVoiceAssistant, undefined);
  assert.equal(iosVoiceAssistant?.relutionMapping.status, "exact");
  assert.equal(hasNativeValue(iosVoiceAssistant, "IOS_RESTRICTION", "allowAssistant", false), true);
  assert.equal(hasNativeValue(iosVoiceAssistant, "IOS_RESTRICTION", "allowAssistantWhileLocked", false), true);

  const macosAutoupdate = recommendations.find(
    (entry) => entry.platform === "MACOS" && entry.requirementId === "SYS.2.1.A3",
  );
  assert.notEqual(macosAutoupdate, undefined);
  assert.equal(macosAutoupdate?.relutionMapping.status, "exact");
  assert.equal(hasSchemaValue(macosAutoupdate, "profile:com.apple.SoftwareUpdate", "AutomaticCheckEnabled", true), true);
  assert.equal(hasSchemaValue(macosAutoupdate, "profile:com.apple.SoftwareUpdate", "CriticalUpdateInstall", true), true);

  const windowsDefender = recommendations.find(
    (entry) => entry.platform === "WINDOWS" && entry.requirementId === "SYS.2.1.A6",
  );
  assert.notEqual(windowsDefender, undefined);
  assert.equal(windowsDefender?.relutionMapping.status, "exact");
  assert.equal(hasNativeValue(windowsDefender, "WINDOWS_ANTIVIRUS", "allowRealtimeMonitoring", true), true);

  const iosWebProxy = recommendations.find(
    (entry) => entry.platform === "IOS" && entry.requirementId === "SYS.3.2.1.A28",
  );
  assert.notEqual(iosWebProxy, undefined);
  assert.notEqual(iosWebProxy?.relutionMapping.status, "exact");

  const iosCloud = recommendations.find(
    (entry) => entry.platform === "IOS" && entry.requirementId === "SYS.3.2.3.A14",
  );
  assert.notEqual(iosCloud, undefined);
  assert.notEqual(iosCloud?.relutionMapping.status, "exact");
  assert.equal(hasSemanticConcept(iosCloud, "cloud_sync"), true);
  assert.equal(hasCandidate(iosCloud, "apple-schema-profile", "profile:com.apple.applicationaccess"), true);

  const iosStrategy = recommendations.find(
    (entry) => entry.platform === "IOS" && entry.requirementId === "SYS.3.2.3.A1",
  );
  assert.notEqual(iosStrategy, undefined);
  assert.notEqual(iosStrategy?.relutionMapping.status, "exact");
  assert.equal(hasSemanticConcept(iosStrategy, "mdm_strategy_selection"), true);
  assert.equal(hasCandidate(iosStrategy, "relution-native", "IOS_RESTRICTION"), true);
  assert.equal(hasCandidate(iosStrategy, "relution-native", "IOS_SECURED_SHARED_DEVICE"), true);
});

test("BSI mandatory Basis mapping ledger covers every mandatory client requirement", () => {
  const ledger = readJson<JsonRecord>("example/bsi-references/bsi-mandatory-mapping-ledger.json");
  const rows = ledger.rows as JsonRecord[];
  const summary = ledger.summary as JsonRecord;

  assert.equal(ledger.version, 1);
  assert.equal(rows.length, 49);
  assert.deepEqual(summary.bySolutionStatus, {
    exact: 22,
    parameterized: 27,
  });
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

function hasCandidate(entry: BsiRecommendation | undefined, kind: string, target: string): boolean {
  return entry?.relutionMapping.candidates.some((candidate) => candidate.kind === kind && candidate.target === target) ?? false;
}

function hasSemanticConcept(entry: BsiRecommendation | undefined, conceptId: string): boolean {
  return entry?.semanticConcepts?.some((concept) => concept.id === conceptId) ?? false;
}

function hasPlusPlusControl(entry: BsiRecommendation | undefined, controlId: string): boolean {
  return entry?.grundschutzPlusPlus?.relatedControls.some((control) => control.id === controlId) ?? false;
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

function valueAtPath(value: unknown, path: string): unknown {
  let current = value;
  for (const part of path.split(".")) {
    if (current === null || typeof current !== "object" || !(part in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
