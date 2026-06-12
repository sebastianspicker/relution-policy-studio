import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadAppleSchemaCatalog } from "../src/apple-schema-catalog.js";
import { loadTemplateBundle } from "../src/templates.js";
import { importRulesetWorkspace } from "../web/src/editor/ruleset-import.js";
import { valueAtPath, type DownloadManifestEntry, type ImportableRuleset, type JsonRecord, type SourceEntry } from "./reference-test-helpers.js";

type CisBaselineSummary = {
  verifiedAsOf: string;
  sourceIndexPath: string;
  downloadManifestPath: string;
  harvestedBenchmarkPdfs: Array<{
    benchmarkId: string;
    sourcePdfPath: string;
    version: string;
    documentDate: string;
    platform: string;
  }>;
  currentFamilies: Record<
    string,
    {
      familySourceId: string;
      currentVersions: string[];
    }
  >;
  recommendationCatalogPath: string;
  importableRulesetPath: string;
  settingBundleCatalogPath?: string;
  recommendationCounts: {
    total: number;
    byPlatform: Record<string, number>;
  };
  helperFallbackCounts?: {
    total: number;
    byPlatform: Record<string, number>;
    byMethod: Record<string, number>;
  };
};

type CisHelperFallback = {
  id: string;
  role: "audit" | "remediation";
  method: string;
  title: string;
  rawText: string;
  commands: string[];
  groupPolicyPaths?: string[];
  registryPaths?: string[];
  profilePayloadType?: string;
  profileKeys?: Array<{
    key: string;
    value: string;
  }>;
};

type RecommendationImplementation = {
  category: string;
  surfaces: string[];
  importableVia: string[];
  blockingReasons: string[];
};

type CisRecommendation = {
  id: string;
  platform: string;
  osFamily: string;
  benchmarkId: string;
  recommendationId: string;
  title: string;
  assessmentStatus: "Automated" | "Manual";
  profileApplicability: string[];
  description: string;
  rationale: string;
  impact: string;
  audit: string;
  remediation: string;
  references: string[];
  fallbackTranslations: CisHelperFallback[];
  implementation?: RecommendationImplementation;
  semanticConcepts?: Array<{
    id: string;
    candidateTargets: JsonRecord[];
  }>;
  semanticNoConceptReason?: string;
  relutionMapping: {
    status: string;
    candidates: Array<{
      kind: string;
      target: string;
      fieldPaths: string[];
      semanticConceptId?: string;
    }>;
    rulesetMappings: JsonRecord[];
  };
};

type AppleMobileconfigEvidence = {
  version: number;
  settings: Array<{
    id: string;
    payloadType: string;
    status: string;
    relutionTransportType?: string;
    fields: Array<{
      path: string;
      kind: string;
    }>;
  }>;
};

test("download manifest covers every referenced CIS source", () => {
  const sources = readJson<SourceEntry[]>("example/cis-references/sources.json");
  const manifest = readJson<DownloadManifestEntry[]>("example/cis-references/downloads/manifest.json");

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

test("CIS baseline summary exposes current family context and harvested PDF coverage", () => {
  const summary = readJson<CisBaselineSummary>("example/cis-references/cis-relution-baseline.json");

  assert.equal(summary.verifiedAsOf, "2026-04-23");
  assert.equal(summary.sourceIndexPath, "example/cis-references/sources.json");
  assert.equal(summary.downloadManifestPath, "example/cis-references/downloads/manifest.json");
  assert.equal(summary.recommendationCatalogPath, "example/cis-references/cis-recommendations.json");
  assert.equal(summary.importableRulesetPath, "example/cis-references/cis-relution-ruleset.json");
  assert.equal(summary.settingBundleCatalogPath, "example/cis-references/cis-relution-settings-catalog.json");
  assert.equal(summary.harvestedBenchmarkPdfs.length, 10);
  assert.deepEqual(Object.keys(summary.currentFamilies).sort(), ["android", "ios", "macos", "windows"]);
  assert.equal(summary.currentFamilies.windows?.currentVersions.includes("Microsoft Windows 11 Stand-alone (5.0.0)"), true);
  assert.equal(summary.currentFamilies.android?.currentVersions.includes("Google Android (1.6.0)"), true);
  assert.equal(summary.currentFamilies.ios?.currentVersions.includes("Apple iOS 26 (1.0.0)"), true);
  assert.equal(summary.currentFamilies.macos?.currentVersions.includes("Apple macOS 26 Tahoe (1.0.0)"), true);
  assert.equal((summary.helperFallbackCounts?.total ?? 0) > 0, true);
  assert.equal((summary.helperFallbackCounts?.byPlatform.WINDOWS ?? 0) > 0, true);
  assert.equal((summary.helperFallbackCounts?.byPlatform.MACOS ?? 0) > 0, true);
  assert.equal((summary.helperFallbackCounts?.byMethod.powershell ?? 0) > 0, true);
  assert.equal((summary.helperFallbackCounts?.byMethod["profile-method"] ?? 0) > 0, true);
  assert.deepEqual(summary.recommendationCounts, {
    total: 1336,
    byPlatform: {
      ANDROID_ENTERPRISE: 45,
      IOS: 496,
      MACOS: 248,
      WINDOWS: 547,
    },
  });
});

test("CIS recommendation catalog preserves benchmark coverage and Relution mapping metadata", () => {
  const recommendations = readJson<CisRecommendation[]>("example/cis-references/cis-recommendations.json");

  assert.equal(recommendations.length, 1336);
  assert.deepEqual([...new Set(recommendations.map((entry) => entry.platform))].sort(), ["ANDROID_ENTERPRISE", "IOS", "MACOS", "WINDOWS"]);
  assert.deepEqual([...new Set(recommendations.map((entry) => entry.osFamily))].sort(), ["ANDROID", "IOS", "MACOS", "WINDOWS"]);
  assert.equal([...new Set(recommendations.map((entry) => entry.benchmarkId))].length, 10);

  for (const entry of recommendations) {
    assert.equal(typeof entry.id, "string");
    assert.equal(entry.id.length > 0, true, entry.recommendationId);
    assert.equal(typeof entry.recommendationId, "string");
    assert.equal(entry.recommendationId.length > 0, true, entry.id);
    assert.equal(typeof entry.title, "string");
    assert.equal(entry.title.length > 0, true, entry.id);
    assert.equal(entry.profileApplicability.length > 0, true, entry.id);
    assert.equal(typeof entry.description, "string");
    assert.equal(entry.description.length > 0, true, entry.id);
    assert.equal(typeof entry.rationale, "string");
    assert.equal(typeof entry.audit, "string");
    assert.equal(entry.audit.length > 0, true, entry.id);
    assert.equal(typeof entry.remediation, "string");
    assert.equal(entry.remediation.length > 0, true, entry.id);
    assert.equal(Array.isArray(entry.references), true, entry.id);
    assert.equal(Array.isArray(entry.fallbackTranslations), true, entry.id);
    assert.equal(typeof entry.implementation?.category, "string", entry.id);
    assert.equal(Array.isArray(entry.implementation?.surfaces ?? []), true, entry.id);
    assert.equal(Array.isArray(entry.implementation?.importableVia ?? []), true, entry.id);
    assert.equal(typeof entry.relutionMapping.status, "string");
    assert.equal(Array.isArray(entry.relutionMapping.candidates), true, entry.id);
    assert.equal(Array.isArray(entry.relutionMapping.rulesetMappings), true, entry.id);
    assert.equal(
      (Array.isArray(entry.semanticConcepts) && entry.semanticConcepts.length > 0) || typeof entry.semanticNoConceptReason === "string",
      true,
      entry.id,
    );
  }

  assertCisAndroidRecommendations(recommendations);
  assertCisWindowsRecommendations(recommendations);
  assertCisMacosRecommendations(recommendations);
  assertCisIosRecommendations(recommendations);
  assertCisCoverageCounts(recommendations);
  assertCisFallbackCounts(recommendations);
});

test("Apple mobileconfig evidence exposes Relution APPLE_MOBILECONFIG-backed payloads for recommendation matching", () => {
  const evidence = readJson<AppleMobileconfigEvidence>("example/vendor-references/downloads/derived/apple-mobileconfig-evidence.json");

  assert.equal(evidence.version, 1);
  assert.equal(evidence.settings.length >= 20, true);

  const lockScreenMessage = evidence.settings.find((entry) => entry.payloadType === "com.apple.shareddeviceconfiguration");
  assert.notEqual(lockScreenMessage, undefined);
  assert.equal(lockScreenMessage?.status, "mobileconfig-backed");
  assert.equal(lockScreenMessage?.relutionTransportType, "APPLE_MOBILECONFIG");
  assert.equal(lockScreenMessage?.fields.some((field) => field.path === "ifLostReturnToMessage"), true);

  const pppc = evidence.settings.find((entry) => entry.payloadType === "com.apple.TCC.configuration-profile-policy");
  assert.notEqual(pppc, undefined);
  assert.equal(pppc?.fields.some((field) => field.path === "authorization"), true);
});

test("CIS ruleset is importable and exposes aggregate exact mappings per OS family", () => {
  const ruleset = readJson<ImportableRuleset>("example/cis-references/cis-relution-ruleset.json");

  assert.equal(ruleset.version, 1);
  assert.deepEqual([...new Set(ruleset.policies.map((policy) => policy.platform))].sort(), ["ANDROID_ENTERPRISE", "IOS", "MACOS", "WINDOWS"]);
  assert.equal(ruleset.policies.every((policy) => policy.rules.length > 0), true);
  assert.equal(
    ruleset.policies.every((policy) =>
      policy.rules.every((rule) => typeof rule.reason === "string" && rule.reason.length > 0 && Array.isArray(rule.sourceIds) && rule.sourceIds.length > 0),
    ),
    true,
  );
  assert.equal(
    ruleset.policies.every((policy) =>
      policy.rules
        .filter((rule) => rule.informational === true)
        .every((rule) =>
          Array.isArray((rule as JsonRecord).semanticConcepts) || typeof (rule as JsonRecord).semanticNoConceptReason === "string",
        ),
    ),
    true,
  );
  assert.equal(
    ruleset.policies.every((policy) =>
      policy.rules
        .filter((rule) => rule.informational === true)
        .every((rule) => Array.isArray(rule.mappings) && rule.mappings.length === 0),
    ),
    true,
  );

  const result = importRulesetWorkspace(ruleset, loadTemplateBundle(), loadAppleSchemaCatalog());

  assert.equal(result.report.conflicts.length, 0);
  assert.equal(result.report.unresolved.length, 0);
  assert.notEqual(result.workspace, undefined);
  assert.equal((result.workspace?.policies.length ?? 0) >= 4, true);
  assert.equal(
    result.workspace?.policies.some((policy) => JSON.stringify(policy.document).includes("ANDROID_ENTERPRISE_ADVANCED_SECURITY_OVERRIDES")),
    true,
  );
  assert.equal(
    result.workspace?.policies.some((policy) => JSON.stringify(policy.document).includes("IOS_RESTRICTION")),
    true,
  );
  assert.equal(
    result.workspace?.policies.some((policy) => JSON.stringify(policy.document).includes("MACOS_FILE_VAULT")),
    true,
  );
  assert.equal(
    result.workspace?.policies.some((policy) => JSON.stringify(policy.document).includes("com.apple.SoftwareUpdate")),
    true,
  );
  assert.equal(
    result.workspace?.policies.some((policy) => JSON.stringify(policy.document).includes("com.apple.loginwindow")),
    true,
  );
  assert.equal(
    result.workspace?.policies.some((policy) => JSON.stringify(policy.document).includes("WINDOWS_PASSCODE")),
    true,
  );
  assert.equal(
    result.workspace?.policies.some((policy) => JSON.stringify(policy.document).includes("WINDOWS_ANTIVIRUS")),
    true,
  );
});

function assertCisAndroidRecommendations(recommendations: CisRecommendation[]): void {
  assertExactNativeCis(recommendations, "cis-google-android-1-6-0", "1.9", "ANDROID_ENTERPRISE_ADVANCED_SECURITY_OVERRIDES", "developerSettings", "DEVELOPER_SETTINGS_DISABLED");
  assertExactNativeCis(recommendations, "cis-google-android-1-6-0", "1.12", "ANDROID_ENTERPRISE_KEYGUARD_FEATURE_MANAGEMENT", "keyguardDisabledFeatures", ["TRUST_AGENTS"]);
  assertExactNativeCis(recommendations, "cis-google-android-1-6-0", "1.14", "ANDROID_ENTERPRISE_RESTRICTION", "androidAutoDateAndTimeZoneSetting", "AUTO_DATE_AND_TIME_ZONE_ENFORCED");
  assertExactNativeCis(recommendations, "cis-google-android-1-6-0", "1.22", "ANDROID_ENTERPRISE_PLAY_STORE_MANAGEMENT", "appAutoUpdatePolicy", "ALWAYS");
  assertExactNativeCis(recommendations, "cis-google-android-1-6-0", "2.1", "ANDROID_ENTERPRISE_KEYGUARD_FEATURE_MANAGEMENT", "keyguardDisabledFeatures", ["NOTIFICATIONS"]);

  const locationHistory = findCisRecommendation(recommendations, "cis-google-android-1-6-0", "2.8");
  assert.notEqual(locationHistory, undefined);
  assert.notEqual(locationHistory?.relutionMapping.status, "exact");
}

function assertCisWindowsRecommendations(recommendations: CisRecommendation[]): void {
  const passwordHistory = findCisRecommendation(recommendations, "cis-microsoft-windows-11-standalone-5-0-0", "1.1.1");
  assert.notEqual(passwordHistory, undefined);
  assert.equal(passwordHistory?.relutionMapping.status, "exact");

  const serviceFallback = findCisRecommendation(recommendations, "cis-microsoft-windows-11-standalone-5-0-0", "5.1");
  assertNoMappingFallback(serviceFallback);
  assert.equal(hasFallbackCommand(serviceFallback, "powershell", "remediation", "Set-Service -Name BTAGService -StartupType Disabled"), true);
  assert.equal(serviceFallback?.implementation?.category, "helper-only");
  assert.equal(serviceFallback?.implementation?.surfaces.includes("helper"), true);

  const auditPolicyFallback = findCisRecommendation(recommendations, "cis-microsoft-windows-11-standalone-5-0-0", "17.1.1");
  assert.notEqual(auditPolicyFallback, undefined);
  assert.equal(hasFallbackCommand(auditPolicyFallback, "auditpol", "audit", 'auditpol /get /subcategory:"{0cce923f-69ae-11d9-bed3-505054503030}"'), true);
  assert.equal(hasGroupPolicyPath(auditPolicyFallback, "Computer Configuration\\Policies\\Windows Settings\\Security Settings\\Advanced Audit Policy Configuration\\Audit Policies\\Account Logon\\Audit Credential Validation"), true);

  assertNoMappingFallback(findCisRecommendation(recommendations, "cis-microsoft-windows-11-standalone-5-0-0", "2.2.4"));
}

function assertCisMacosRecommendations(recommendations: CisRecommendation[]): void {
  const fileVault = recommendations.find((entry) => entry.benchmarkId === "cis-apple-macos-26-tahoe-1-0-0" && entry.title === "Ensure FileVault Is Enabled");
  assert.notEqual(fileVault, undefined);
  assert.equal(fileVault?.relutionMapping.status, "exact");

  const softwareUpdate = findCisRecommendation(recommendations, "cis-apple-macos-15-sequoia-2-0-0", "1.2");
  assert.notEqual(softwareUpdate, undefined);
  assert.equal(softwareUpdate?.relutionMapping.status, "exact");
  assert.equal(hasSchemaMapping(softwareUpdate, "profile:com.apple.SoftwareUpdate"), true);
  assert.equal(softwareUpdate?.implementation?.category, "relution-achievable");
  assert.equal(softwareUpdate?.implementation?.surfaces.includes("apple-schema-profile"), true);
  assert.equal(softwareUpdate?.implementation?.importableVia.includes("ruleset-import"), true);
  assert.equal(hasFallbackCommand(softwareUpdate, "terminal", "remediation", "/usr/bin/sudo /usr/bin/defaults write /Library/Preferences/com.apple.SoftwareUpdate AutomaticDownload -bool true"), true);
  assert.equal(hasProfileFallbackKey(softwareUpdate, "com.apple.SoftwareUpdate", "AutomaticDownload", "<true/>"), true);
}

function assertCisIosRecommendations(recommendations: CisRecommendation[]): void {
  assertExactSchemaCisById(recommendations, "cis-apple-ios-17-ipados-17-intune-1-0-0-2-2-1", "allowAssistantWhileLocked", false);
  assertExactSchemaCisById(recommendations, "cis-apple-ios-17-ipados-17-intune-1-0-0-2-5-2", "allowScreenShot", false);

  const photoLibrary = findCisRecommendationById(recommendations, "cis-apple-ios-17-ipados-17-intune-1-0-0-2-3-6");
  assert.notEqual(photoLibrary, undefined);
  assert.equal(photoLibrary?.relutionMapping.status, "exact");
  assert.equal(hasSchemaValue(photoLibrary, "profile:com.apple.applicationaccess", "allowCloudPhotoLibrary", false), true);
  assert.equal(hasSchemaValue(photoLibrary, "profile:com.apple.applicationaccess", "allowScreenShot", false), false);

  const lockScreenMessage = findCisRecommendationById(recommendations, "cis-apple-ios-17-ipados-17-intune-1-0-0-3-9-1");
  assert.notEqual(lockScreenMessage, undefined);
  assert.notEqual(lockScreenMessage?.relutionMapping.status, "exact");
  assert.equal(hasCandidate(lockScreenMessage, "apple-mobileconfig", "com.apple.shareddeviceconfiguration"), true);

  const compliance = findCisRecommendationById(recommendations, "cis-apple-ios-17-ipados-17-intune-1-0-0-4-5");
  assert.notEqual(compliance, undefined);
  assert.equal(compliance?.relutionMapping.status, "partial");
  assert.equal(hasSemanticConcept(compliance, "mdm_compliance"), true);
  assert.equal(hasSemanticCandidate(compliance, "IOS_APP_COMPLIANCE"), true);
  assert.equal(compliance?.relutionMapping.rulesetMappings.length, 0);
  assertIosHardenedDevices(recommendations);
}

function assertIosHardenedDevices(recommendations: CisRecommendation[]): void {
  const hardenedDevices = recommendations.filter((entry) => entry.platform === "IOS" && entry.title.includes("latest iOS device architecture"));
  assert.equal(hardenedDevices.length, 4);
  for (const entry of hardenedDevices) {
    assert.equal(entry.relutionMapping.status, "partial", entry.id);
    assert.equal(hasSemanticConcept(entry, "hardened_device_procurement"), true, entry.id);
    assert.equal(hasSemanticCandidate(entry, "IOS_RESTRICTION"), true, entry.id);
    assert.equal(hasSemanticCandidate(entry, "IOS_SECURED_SHARED_DEVICE"), true, entry.id);
    assert.equal(hasSemanticCandidate(entry, "IOS_SHARED_DEVICE"), true, entry.id);
    assert.equal(entry.relutionMapping.rulesetMappings.length, 0, entry.id);
  }
}

function assertCisCoverageCounts(recommendations: CisRecommendation[]): void {
  assert.equal(recommendations.filter((entry) => entry.platform === "WINDOWS" && entry.relutionMapping.status === "exact").length, 24);
  assert.equal(recommendations.filter((entry) => entry.platform === "MACOS" && entry.relutionMapping.status === "exact").length, 52);
  assert.equal(recommendations.filter((entry) => entry.platform === "IOS" && entry.relutionMapping.status === "exact").length, 346);
  assert.equal(recommendations.filter((entry) => entry.platform === "ANDROID_ENTERPRISE" && entry.relutionMapping.status === "exact").length, 9);

  const candidateCounts = recommendations.reduce(
    (acc, recommendation) => {
      if (recommendation.relutionMapping.candidates.length > 0) {
        acc[recommendation.platform] = (acc[recommendation.platform] ?? 0) + 1;
      }
      return acc;
    },
    {} as Record<string, number>,
  );
  assert.equal((candidateCounts.WINDOWS ?? 0) >= 502, true);
  assert.equal((candidateCounts.MACOS ?? 0) >= 248, true);
  assert.equal((candidateCounts.IOS ?? 0) > 491, true);
  assert.equal((candidateCounts.ANDROID_ENTERPRISE ?? 0) >= 45, true);
}

function assertCisFallbackCounts(recommendations: CisRecommendation[]): void {
  const computedFallbackCounts = recommendations.reduce(
    (acc, recommendation) => {
      for (const fallback of recommendation.fallbackTranslations) {
        acc.total += 1;
        acc.byPlatform[recommendation.platform] = (acc.byPlatform[recommendation.platform] ?? 0) + 1;
        acc.byMethod[fallback.method] = (acc.byMethod[fallback.method] ?? 0) + 1;
      }
      return acc;
    },
    { total: 0, byPlatform: {} as Record<string, number>, byMethod: {} as Record<string, number> },
  );
  const summary = readJson<CisBaselineSummary>("example/cis-references/cis-relution-baseline.json");
  assert.deepEqual(summary.helperFallbackCounts, computedFallbackCounts);
}

function assertExactNativeCis(
  recommendations: CisRecommendation[],
  benchmarkId: string,
  recommendationId: string,
  targetType: string,
  path: string,
  expected: unknown,
): void {
  const entry = findCisRecommendation(recommendations, benchmarkId, recommendationId);
  assert.notEqual(entry, undefined);
  assert.equal(entry?.relutionMapping.status, "exact");
  assert.equal(hasNativeValue(entry, targetType, path, expected), true);
}

function assertExactSchemaCisById(recommendations: CisRecommendation[], id: string, path: string, expected: unknown): void {
  const entry = findCisRecommendationById(recommendations, id);
  assert.notEqual(entry, undefined);
  assert.equal(entry?.relutionMapping.status, "exact");
  assert.equal(hasSchemaValue(entry, "profile:com.apple.applicationaccess", path, expected), true);
}

function assertNoMappingFallback(entry: CisRecommendation | undefined): void {
  assert.notEqual(entry, undefined);
  assert.equal(entry?.relutionMapping.status, "none");
  assert.equal(entry?.relutionMapping.candidates.length, 0);
}

function hasFallbackCommand(entry: CisRecommendation | undefined, method: string, role: string, command: string): boolean {
  return entry?.fallbackTranslations.some((fallback) => fallback.method === method && fallback.role === role && fallback.commands.includes(command)) ?? false;
}

function hasGroupPolicyPath(entry: CisRecommendation | undefined, groupPolicyPath: string): boolean {
  return entry?.fallbackTranslations.some((fallback) => fallback.method === "group-policy-path" && fallback.groupPolicyPaths?.includes(groupPolicyPath) === true) ?? false;
}

function hasProfileFallbackKey(entry: CisRecommendation | undefined, payloadType: string, key: string, value: string): boolean {
  return entry?.fallbackTranslations.some((fallback) =>
    fallback.method === "profile-method"
    && fallback.profilePayloadType === payloadType
    && fallback.profileKeys?.some((profileKey) => profileKey.key === key && profileKey.value === value) === true,
  ) ?? false;
}

function hasSchemaMapping(entry: CisRecommendation | undefined, schemaId: string): boolean {
  return entry?.relutionMapping.rulesetMappings.some((mapping) => mapping.kind === "apple-schema-profile" && mapping.schemaId === schemaId) ?? false;
}

function findCisRecommendation(recommendations: CisRecommendation[], benchmarkId: string, recommendationId: string): CisRecommendation | undefined {
  return recommendations.find((entry) => entry.benchmarkId === benchmarkId && entry.recommendationId === recommendationId);
}

function findCisRecommendationById(recommendations: CisRecommendation[], id: string): CisRecommendation | undefined {
  return recommendations.find((entry) => entry.id === id);
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(path), "utf8")) as T;
}

function hasSchemaValue(entry: CisRecommendation | undefined, schemaId: string, path: string, expected: unknown): boolean {
  return entry?.relutionMapping.rulesetMappings.some((mapping) =>
    mapping.kind === "apple-schema-profile"
    && mapping.schemaId === schemaId
    && valueAtPath(mapping.values, path) === expected,
  ) ?? false;
}

function hasCandidate(entry: CisRecommendation | undefined, kind: string, target: string): boolean {
  return entry?.relutionMapping.candidates.some((candidate) => candidate.kind === kind && candidate.target === target) ?? false;
}

function hasSemanticCandidate(entry: CisRecommendation | undefined, target: string): boolean {
  return entry?.relutionMapping.candidates.some((candidate) => candidate.target === target && typeof candidate.semanticConceptId === "string") ?? false;
}

function hasSemanticConcept(entry: CisRecommendation | undefined, conceptId: string): boolean {
  return entry?.semanticConcepts?.some((concept) => concept.id === conceptId) ?? false;
}

function hasNativeValue(entry: CisRecommendation | undefined, type: string, path: string, expected: unknown): boolean {
  return entry?.relutionMapping.rulesetMappings.some((mapping) =>
    mapping.kind === "relution-native"
    && mapping.type === type
    && JSON.stringify(valueAtPath(mapping.values, path)) === JSON.stringify(expected),
  ) ?? false;
}
