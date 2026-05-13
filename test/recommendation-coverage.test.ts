import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type CoverageRow = {
  source: string;
  recommendationId: string;
  platform: string;
  title: string;
  category: string;
  surfaces: string[];
  importableVia: string[];
  mappingStatus: string;
  targetTypes: string[];
  candidateTargetTypes: string[];
  blockingReasons: string[];
};

type CoverageMatrix = {
  version: number;
  name: string;
  rows: CoverageRow[];
  summary: {
    totalRecommendations: number;
    bySource: Record<string, number>;
    byPlatform: Record<string, number>;
    byCategory: Record<string, number>;
    bySurface: Record<string, number>;
  };
};

type SemanticIndex = {
  version: number;
  name: string;
  concepts: Array<{
    id: string;
    relutionTargetIds: string[];
    recommendationIds: string[];
    exactRecommendationIds: string[];
    candidateRecommendationIds: string[];
  }>;
  relutionTargets: Array<{
    id: string;
    platform: string;
    kind: string;
    target: string;
    fieldPaths: string[];
    conceptIds: string[];
    exactRecommendationIds: string[];
    candidateRecommendationIds: string[];
  }>;
  recommendations: Array<{
    source: string;
    recommendationId: string;
    semanticConceptIds: string[];
    exactTargetIds: string[];
    candidateTargetIds: string[];
  }>;
  summary: {
    totalConcepts: number;
    totalRelutionTargets: number;
    totalRecommendations: number;
    bySource: Record<string, number>;
    byPlatform: Record<string, number>;
  };
};

type UnifiedAnalysis = {
  version: number;
  name: string;
  precedence: {
    authoritativeSource: string;
    behavior: string;
  };
  commonGroups: Array<{
    id: string;
    platform: string;
    conceptId: string;
    sources: string[];
    missingSources: string[];
    authoritativeSource: string | null;
    sourceCounts: Record<string, number>;
    recommendationsBySource: Record<string, string[]>;
    exactTargetIdsBySource: Record<string, string[]>;
    candidateTargetIdsBySource: Record<string, string[]>;
    sharedRelutionTargetIds: string[];
  }>;
  contradictions: Array<{
    type: string;
    severity: string;
    authoritativeSource?: string;
  }>;
  differences: Array<{
    type: string;
    severity: string;
    authoritativeSource?: string;
  }>;
  summary: {
    totalCommonGroups: number;
    commonGroupsBySourceCoverage: Record<string, number>;
    hardContradictions: number;
    differences: number;
    bsiAuthoritativeDifferences: number;
    sourceRecommendationCounts: Record<string, number>;
  };
};

type LlmMappingTarget = {
  surface: "relution-native" | "apple-schema-profile" | "apple-mobileconfig";
  target: string;
  status: "exact" | "candidate";
};

type LlmMappingReview = {
  version: number;
  name: string;
  generatedAt: string;
  reviewMethod: {
    mode: string;
    sourceScope: string;
    externalLlmApi: boolean;
  };
  sourceSnapshots: Array<{
    source: string;
    verifiedAsOf: string;
    baselinePath: string;
    downloadManifestPath: string;
    recommendationCatalogPath: string;
  }>;
  inputs: {
    achievabilityMatrixPath: string;
    semanticIndexPath: string;
    unifiedAnalysisPath: string;
  };
  precedence: {
    authoritativeSource: string;
    behavior: string;
  };
  rows: Array<{
    source: string;
    recommendationId: string;
    platform: string;
    title: string;
    status: "exact" | "parameterized" | "partial" | "gap" | "helper-only";
    confidence: "high" | "medium" | "low";
    relutionTargets: LlmMappingTarget[];
    appleTargets: LlmMappingTarget[];
    semanticConceptIds: string[];
    evidence: {
      category: string;
      mappingStatus: string;
      surfaces: string[];
      importableVia: string[];
      semanticExactTargetIds: string[];
      semanticCandidateTargetIds: string[];
    };
    reason: string;
    blockedBy: string[];
    reviewedAt: string;
  }>;
  summary: {
    totalRecommendations: number;
    reviewedRecommendations: number;
    pendingRecommendations: number;
    byStatus: Record<string, number>;
    bySource: Record<string, number>;
    byPlatform: Record<string, number>;
    byConfidence: Record<string, number>;
    bySourceAndStatus: Record<string, Record<string, number>>;
    byPlatformAndStatus: Record<string, Record<string, number>>;
    matrixSummary: CoverageMatrix["summary"];
    unifiedAnalysisSummary: UnifiedAnalysis["summary"];
  };
};

test("coverage matrix summarizes relution achievability across all recommendation sources", () => {
  const matrix = readJson<CoverageMatrix>("example/recommendation-coverage/relution-achievability-matrix.json");

  assert.equal(matrix.version, 1);
  assert.equal(matrix.name.length > 0, true);
  assert.equal(matrix.rows.length, matrix.summary.totalRecommendations);
  assert.deepEqual(Object.keys(matrix.summary.bySource).sort(), ["bsi", "cis", "vendor"]);
  assert.equal((matrix.summary.byCategory["relution-achievable"] ?? 0) > 0, true);
  assert.equal((matrix.summary.byCategory["relution-partial"] ?? 0) > 0, true);
  assert.equal((matrix.summary.byCategory.gap ?? 0) > 0, true);
  assert.equal((matrix.summary.bySurface["relution-native"] ?? 0) > 0, true);
  assert.equal((matrix.summary.bySurface["apple-schema-profile"] ?? 0) > 0, true);
  assert.equal((matrix.summary.bySurface["apple-mobileconfig"] ?? 0) > 0, true);
  assert.equal((matrix.summary.bySurface.helper ?? 0) > 0, true);

  const cisSoftwareUpdate = matrix.rows.find((row) => row.source === "cis" && row.recommendationId === "cis-apple-macos-15-sequoia-2-0-0-1-2");
  assert.notEqual(cisSoftwareUpdate, undefined);
  assert.equal(cisSoftwareUpdate?.category, "relution-achievable");
  assert.equal(cisSoftwareUpdate?.surfaces.includes("apple-schema-profile"), true);
  assert.equal(cisSoftwareUpdate?.importableVia.includes("ruleset-import"), true);
  assert.equal(cisSoftwareUpdate?.importableVia.includes("apply-json"), false);

  const bsiFirewall = matrix.rows.find((row) => row.source === "bsi" && row.recommendationId === "macos-sys-2-4-a10");
  assert.notEqual(bsiFirewall, undefined);
  assert.equal(bsiFirewall?.category, "relution-achievable");
  assert.equal(bsiFirewall?.surfaces.includes("apple-schema-profile"), true);

  const windowsHelperOnly = matrix.rows.find((row) => row.source === "cis" && row.recommendationId === "cis-microsoft-windows-11-standalone-5-0-0-5-1");
  assert.notEqual(windowsHelperOnly, undefined);
  assert.equal(windowsHelperOnly?.category, "helper-only");
  assert.equal(windowsHelperOnly?.surfaces.includes("helper"), true);

  const partialBsiIcloud = matrix.rows.find((row) => row.source === "bsi" && row.recommendationId === "ios-sys-3-2-3-a14");
  assert.notEqual(partialBsiIcloud, undefined);
  assert.equal(partialBsiIcloud?.category, "relution-partial");
  assert.equal(partialBsiIcloud?.blockingReasons.length > 0, true);

  const bsiGermanWebFilter = matrix.rows.find((row) => row.source === "bsi" && row.recommendationId === "android-enterprise-sys-3-2-1-a28");
  assert.notEqual(bsiGermanWebFilter, undefined);
  assert.equal(bsiGermanWebFilter?.category, "relution-partial");
  assert.equal(bsiGermanWebFilter?.candidateTargetTypes.includes("ANDROID_ENTERPRISE_WIFI_MANAGEMENT"), true);

  const cisTlsPrompt = matrix.rows.find((row) => row.source === "cis" && row.recommendationId === "cis-apple-ios-18-2-0-0-2-2-1-5");
  assert.notEqual(cisTlsPrompt, undefined);
  assert.equal(cisTlsPrompt?.category, "relution-achievable");
  assert.deepEqual(cisTlsPrompt?.targetTypes, ["profile:com.apple.applicationaccess"]);

  const cisSiriLocked = matrix.rows.find((row) => row.source === "cis" && row.recommendationId === "cis-apple-ios-17-ipados-17-intune-1-0-0-2-2-1");
  assert.notEqual(cisSiriLocked, undefined);
  assert.equal(cisSiriLocked?.category, "relution-achievable");
  assert.deepEqual(cisSiriLocked?.targetTypes, ["profile:com.apple.applicationaccess"]);

  const cisLockScreenMessage = matrix.rows.find((row) => row.source === "cis" && row.recommendationId === "cis-apple-ios-17-ipados-17-intune-1-0-0-3-9-1");
  assert.notEqual(cisLockScreenMessage, undefined);
  assert.equal(cisLockScreenMessage?.category, "relution-partial");
  assert.equal(cisLockScreenMessage?.candidateTargetTypes.includes("com.apple.shareddeviceconfiguration"), true);

  const appleBsiExact = matrix.rows.filter((row) => row.source === "bsi" && ["IOS", "MACOS"].includes(row.platform) && row.mappingStatus === "exact");
  const appleCisExact = matrix.rows.filter((row) => row.source === "cis" && ["IOS", "MACOS"].includes(row.platform) && row.mappingStatus === "exact");
  const androidCisExact = matrix.rows.filter((row) => row.source === "cis" && row.platform === "ANDROID_ENTERPRISE" && row.mappingStatus === "exact");
  const androidBsiCandidates = matrix.rows.filter((row) => row.source === "bsi" && row.platform === "ANDROID_ENTERPRISE" && row.candidateTargetTypes.length > 0);
  assert.equal(appleBsiExact.length >= 3, true);
  assert.equal(appleCisExact.length >= 390, true);
  assert.equal(androidCisExact.length >= 9, true);
  assert.equal(androidBsiCandidates.length >= 30, true);

  const androidOtaAutomatic = matrix.rows.find((row) => row.source === "vendor" && row.recommendationId === "android-008-offerautomaticotasystemupdates");
  assert.notEqual(androidOtaAutomatic, undefined);
  assert.deepEqual(androidOtaAutomatic?.targetTypes, ["ANDROID_ENTERPRISE_SYSTEM_UPDATE"]);
  assert.equal(androidOtaAutomatic?.candidateTargetTypes.includes("ANDROID_SCHEDULED_OTA_UPDATE"), true);
  assert.equal(androidOtaAutomatic?.candidateTargetTypes.some((target) => target.startsWith("ANDROID_IFP")), false);
});

test("semantic index links recommendations and Relution targets in both directions", () => {
  const index = readJson<SemanticIndex>("example/recommendation-coverage/relution-semantic-index.json");

  assert.equal(index.version, 1);
  assert.equal(index.name.length > 0, true);
  assert.equal(index.concepts.length, index.summary.totalConcepts);
  assert.equal(index.relutionTargets.length, index.summary.totalRelutionTargets);
  assert.equal(index.recommendations.length, index.summary.totalRecommendations);
  assert.deepEqual(Object.keys(index.summary.bySource).sort(), ["bsi", "cis", "vendor"]);

  const passcodeTarget = index.relutionTargets.find(
    (target) =>
      target.platform === "IOS"
      && target.kind === "relution-native"
      && target.target === "IOS_PASSCODE"
      && target.fieldPaths.length === 1
      && target.fieldPaths.includes("minLength"),
  );
  assert.notEqual(passcodeTarget, undefined);
  assert.equal(passcodeTarget?.conceptIds.includes("passcode_authentication"), true);
  assert.equal((passcodeTarget?.exactRecommendationIds.length ?? 0) > 0, true);

  const antivirusTarget = index.relutionTargets.find(
    (target) =>
      target.platform === "WINDOWS"
      && target.kind === "relution-native"
      && target.target === "WINDOWS_ANTIVIRUS"
      && target.fieldPaths.includes("allowScriptScanning")
      && target.exactRecommendationIds.some((id) => id.startsWith("vendor:")),
  );
  assert.notEqual(antivirusTarget, undefined);
  assert.equal(antivirusTarget?.conceptIds.includes("malware_protection"), true);
  assert.equal(antivirusTarget?.exactRecommendationIds.some((id) => id.startsWith("vendor:")), true);

  const vendorPlayProtect = index.recommendations.find((entry) => entry.recommendationId === "android-001-enforcegoogleplayprotectonmanageddevices");
  assert.notEqual(vendorPlayProtect, undefined);
  assert.deepEqual(vendorPlayProtect?.semanticConceptIds, ["malware_protection"]);
  assert.equal(vendorPlayProtect?.exactTargetIds.length, 1);

  const malware = index.concepts.find((concept) => concept.id === "malware_protection");
  assert.notEqual(malware, undefined);
  assert.equal(malware?.recommendationIds.some((id) => id.startsWith("vendor:")), true);
  assert.equal(malware?.relutionTargetIds.includes(antivirusTarget?.id ?? ""), true);

  const bsiSoftwareUpdate = index.recommendations.find((entry) => entry.source === "bsi" && entry.recommendationId === "macos-sys-2-1-a3");
  assert.notEqual(bsiSoftwareUpdate, undefined);
  assert.deepEqual(bsiSoftwareUpdate?.semanticConceptIds, ["updates"]);
  assert.equal(bsiSoftwareUpdate?.candidateTargetIds.length, 0);

  const bsiDns = index.recommendations.find((entry) => entry.source === "bsi" && entry.recommendationId === "ios-sys-3-2-1-a34");
  assert.notEqual(bsiDns, undefined);
  assert.equal(bsiDns?.semanticConceptIds.includes("dns_resolution"), true);
  assert.equal(bsiDns?.candidateTargetIds.some((targetId) => targetId.includes("apple-dns-settings")), true);

  const bsiExploitMitigation = index.recommendations.find((entry) => entry.source === "bsi" && entry.recommendationId === "windows-sys-2-1-a26");
  assert.notEqual(bsiExploitMitigation, undefined);
  assert.equal(bsiExploitMitigation?.semanticConceptIds.includes("exploit_mitigation"), true);

  const androidBootloader = index.recommendations.find((entry) => entry.source === "vendor" && entry.recommendationId === "android-016-lockthebootloaderwhenunknownosisreported");
  assert.notEqual(androidBootloader, undefined);
  assert.equal(androidBootloader?.semanticConceptIds.includes("device_attestation_posture"), true);
});

test("unified recommendation analysis groups shared semantics and records BSI precedence", () => {
  const analysis = readJson<UnifiedAnalysis>("example/recommendation-coverage/unified-recommendation-analysis.json");

  assert.equal(analysis.version, 1);
  assert.equal(analysis.name.length > 0, true);
  assert.equal(analysis.precedence.authoritativeSource, "bsi");
  assert.equal(analysis.precedence.behavior, "rank-and-annotate");
  assert.equal(analysis.commonGroups.length, analysis.summary.totalCommonGroups);
  assert.equal((analysis.summary.sourceRecommendationCounts.bsi ?? 0) > 0, true);
  assert.equal((analysis.summary.sourceRecommendationCounts.cis ?? 0) > 0, true);
  assert.equal((analysis.summary.sourceRecommendationCounts.vendor ?? 0) > 0, true);
  assert.equal(analysis.summary.hardContradictions, analysis.contradictions.length);
  assert.equal(analysis.summary.differences, analysis.differences.length);

  const allSourceAppAllowlist = analysis.commonGroups.find(
    (group) =>
      group.platform === "WINDOWS"
      && group.conceptId === "app_allowlist"
      && ["bsi", "cis", "vendor"].every((source) => group.sources.includes(source)),
  );
  assert.notEqual(allSourceAppAllowlist, undefined);
  assert.equal(allSourceAppAllowlist?.authoritativeSource, "bsi");
  assert.equal((allSourceAppAllowlist?.recommendationsBySource.bsi?.length ?? 0) > 0, true);

  assert.equal(
    analysis.differences.some(
      (difference) =>
        difference.authoritativeSource === "bsi"
        && ["source-coverage-gap", "mapping-support-difference", "constraint-compatible-exact-value-difference"].includes(difference.type),
    ),
    true,
  );
  assert.equal(analysis.contradictions.every((difference) => difference.severity === "error"), true);

  const macosAppAllowlist = analysis.commonGroups.find((group) => group.platform === "MACOS" && group.conceptId === "app_allowlist");
  assert.notEqual(macosAppAllowlist, undefined);
  assert.equal(
    macosAppAllowlist?.exactTargetIdsBySource.bsi?.some((targetId) => targetId.includes("softwareupdate")),
    false,
  );
});

test("LLM mapping review covers every recommendation and links to known setting targets", () => {
  const review = readJson<LlmMappingReview>("example/recommendation-coverage/llm-relution-mapping-review.json");
  const matrix = readJson<CoverageMatrix>("example/recommendation-coverage/relution-achievability-matrix.json");
  const semanticIndex = readJson<SemanticIndex>("example/recommendation-coverage/relution-semantic-index.json");
  const templateBundle = readJson<{
    configurationTypes: Array<{ type: string }>;
  }>("data/relution-26.1.1/template-bundle.json");
  const appleCatalog = readJson<{
    entries: Array<{ id: string; kind: string; identifier?: string }>;
  }>("data/apple-device-management/catalog.json");
  const mobileconfigEvidence = readJson<{
    settings: Array<{ payloadType: string }>;
  }>("example/vendor-references/downloads/derived/apple-mobileconfig-evidence.json");
  const doc = readFileSync(resolve("docs/LLM_RELUTION_MAPPING.md"), "utf8");

  assert.equal(review.version, 1);
  assert.equal(review.reviewMethod.mode, "model-reviewed-from-vendored-artifacts");
  assert.equal(review.reviewMethod.sourceScope, "vendored-snapshots");
  assert.equal(review.reviewMethod.externalLlmApi, false);
  assert.equal(review.precedence.authoritativeSource, "bsi");
  assert.equal(review.inputs.achievabilityMatrixPath, "example/recommendation-coverage/relution-achievability-matrix.json");
  assert.equal(review.rows.length, matrix.rows.length);
  assert.equal(review.summary.totalRecommendations, matrix.summary.totalRecommendations);
  assert.equal(review.summary.reviewedRecommendations, matrix.summary.totalRecommendations);
  assert.equal(review.summary.pendingRecommendations, 0);
  assert.deepEqual(review.summary.bySource, matrix.summary.bySource);
  assert.deepEqual(review.summary.byPlatform, matrix.summary.byPlatform);
  assert.deepEqual(review.summary.byStatus, statusCountsFromMatrix(matrix.rows));
  assert.deepEqual(review.summary.matrixSummary, matrix.summary);

  assert.deepEqual(
    review.sourceSnapshots.map((snapshot) => snapshot.source).sort(),
    ["bsi", "cis", "vendor"],
  );
  assert.equal(review.sourceSnapshots.every((snapshot) => snapshot.verifiedAsOf === "2026-04-23"), true);
  assert.equal(doc.includes(`- Total recommendations: \`${review.summary.totalRecommendations}\``), true);
  assert.equal(doc.includes(`- Status counts: \`${JSON.stringify(review.summary.byStatus)}\``), true);

  const reviewSoftwareUpdate = review.rows.find((row) => row.source === "bsi" && row.recommendationId === "macos-sys-2-1-a3");
  assert.notEqual(reviewSoftwareUpdate, undefined);
  assert.deepEqual(reviewSoftwareUpdate?.semanticConceptIds, ["updates"]);

  const matrixKeys = new Set(matrix.rows.map((row) => recommendationKey(row.source, row.recommendationId)));
  const semanticKeys = new Set(semanticIndex.recommendations.map((entry) => recommendationKey(entry.source, entry.recommendationId)));
  const relutionTypes = new Set(templateBundle.configurationTypes.map((entry) => entry.type));
  const appleProfileTargets = new Set(
    appleCatalog.entries
      .filter((entry) => entry.kind === "profile")
      .flatMap((entry) => [entry.id, entry.identifier === undefined ? "" : `profile:${entry.identifier}`])
      .filter((entry) => entry.length > 0),
  );
  const mobileconfigPayloads = new Set(mobileconfigEvidence.settings.map((entry) => entry.payloadType));

  for (const row of review.rows) {
    assert.equal(matrixKeys.has(recommendationKey(row.source, row.recommendationId)), true, row.recommendationId);
    assert.equal(semanticKeys.has(recommendationKey(row.source, row.recommendationId)), true, row.recommendationId);
    assert.equal(row.title.length > 0, true, row.recommendationId);
    assert.equal(row.reason.length > 0, true, row.recommendationId);
    assert.equal(row.reviewedAt.length > 0, true, row.recommendationId);
    assert.equal(row.status === "exact" ? row.confidence === "high" : row.confidence !== "high", true, row.recommendationId);

    for (const target of row.relutionTargets) {
      assert.equal(target.surface, "relution-native", row.recommendationId);
      assert.equal(relutionTypes.has(target.target), true, `${row.recommendationId} ${target.target}`);
    }

    for (const target of row.appleTargets) {
      if (target.surface === "apple-schema-profile") {
        assert.equal(appleProfileTargets.has(target.target), true, `${row.recommendationId} ${target.target}`);
      } else {
        assert.equal(target.surface, "apple-mobileconfig", row.recommendationId);
        assert.equal(mobileconfigPayloads.has(target.target), true, `${row.recommendationId} ${target.target}`);
      }
    }
  }
});

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(path), "utf8")) as T;
}

function recommendationKey(source: string, recommendationId: string): string {
  return `${source}:${recommendationId}`;
}

function statusCountsFromMatrix(rows: CoverageRow[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const status = row.mappingStatus === "parameterized" ? "parameterized" : statusFromCategory(row.category);
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort());
}

function statusFromCategory(category: string): string {
  if (category === "relution-achievable") {
    return "exact";
  }
  if (category === "relution-partial") {
    return "partial";
  }
  return category;
}
