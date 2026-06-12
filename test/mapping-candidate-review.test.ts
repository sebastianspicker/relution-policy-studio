import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type ExactMappingReference = {
  version: number;
  name: string;
  rows: Array<{
    mappingId: string;
    source: string;
    recommendationId: string;
    globalRecommendationId: string;
    platform: string;
    language: string;
    normalizedTokens: string[];
    semanticConcepts: Array<{
      id: string;
      label: {
        de?: string;
        en?: string;
      };
    }>;
    mapping: {
      kind: string;
      target: string;
      fieldPaths: string[];
      values: Record<string, unknown>;
    };
    matchEvidence: {
      valueCompatibility: string;
      reason: string;
    };
  }>;
  summary: {
    totalExactMappings: number;
    bySource: Record<string, number>;
    byLanguage: Record<string, number>;
    byTargetKind: Record<string, number>;
  };
};

type MappingCandidateReview = {
  version: number;
  reviewMethod: {
    mode: string;
    externalLlmApi: boolean;
    exactPromotion: string;
  };
  inputs: {
    exactMappingReferencePath: string;
    manualPromotionLedgerPath: string;
  };
  manualPromotionLedger: {
    validatedEntries: number;
  };
  rows: Array<{
    source: string;
    recommendationId: string;
    globalRecommendationId: string;
    platform: string;
    language: string;
    currentMappingStatus: string;
    extractedIntent: {
      action: string;
      hasConcreteValue: boolean;
      sourceSections: string[];
    };
    semanticConceptIds: string[];
    nearestExactReferences: Array<{
      mappingId: string;
      language: string;
      sharedSemanticConceptIds: string[];
    }>;
    semanticAnalysis: {
      recommendationMeaning: string;
      relutionFit: string;
      exactnessDecision: string;
    };
    rankedCandidates: Array<{
      kind: string;
      target: string;
      fieldPaths: string[];
      semanticConceptId: string;
      provenance: string;
      score: number;
      referenceMappingIds: string[];
      valueCompatibility: string;
      settingMeaning: string;
      decision: string;
    }>;
    suggestedReviewAction: string;
  }>;
  summary: {
    totalReviewedRecommendations: number;
    exactReferenceCount: number;
    bySource: Record<string, number>;
    bySuggestedReviewAction: Record<string, number>;
  };
};

type CoverageMatrix = {
  rows: Array<{
    mappingStatus: string;
  }>;
};

type SourceChangeReport = {
  version: number;
  rows: Array<{
    source: string;
    sourceId: string;
    changeClassification: string;
    classification: string;
    sha256: string;
    textSha256: string;
    affectedRecommendationIds: string[];
    affectedRecommendationCount: number;
  }>;
  summary: {
    totalSources: number;
    bySource: Record<string, number>;
    byClassification: Record<string, number>;
    changedSources: number;
  };
};

type RulesetUpdatePlan = {
  version: number;
  inputs: {
    sourceChangeReportPath: string;
    exactMappingReferencePath: string;
    mappingCandidateReviewPath: string;
    manualPromotionLedgerPath: string;
  };
  rows: Array<{
    source: string;
    sourceId: string;
    recommendationId: string;
    confidenceTier: string;
    requiredAction: string;
  }>;
  summary: {
    totalChangedSources: number;
    proposedUpdates: number;
    byConfidenceTier: Record<string, number>;
  };
};

type RelutionMappingChangeReport = {
  version: number;
  rows: Array<{
    source: string;
    recommendationId: string;
    globalRecommendationId: string;
    platform: string;
    language: string;
    currentMappingStatus: string;
    changeClassification: string;
    exactMappingIds: string[];
    candidateMappings: Array<{
      referenceMappingIds: string[];
    }>;
  }>;
  summary: {
    totalRecommendations: number;
    changedRecommendations: number;
    bySource: Record<string, number>;
    byLanguage: Record<string, number>;
    byChangeClassification: Record<string, number>;
  };
};

type RelutionMappingUpdatePlan = {
  version: number;
  inputs: {
    mappingChangeReportPath: string;
    exactMappingReferencePath: string;
    mappingCandidateReviewPath: string;
    manualPromotionLedgerPath: string;
  };
  rows: Array<{
    source: string;
    recommendationId: string;
    globalRecommendationId: string;
    requiredAction: string;
    confidenceTier: string;
  }>;
  summary: {
    totalChangedRecommendations: number;
    proposedUpdates: number;
    byRequiredAction: Record<string, number>;
  };
  applySummary?: {
    mode: string;
    appliedRows: number;
    skippedRows: number;
    reviewRequiredRows: number;
  };
};

test("exact mapping reference indexes current BSI/CIS/vendor exact mappings bilingually", () => {
  const reference = readJson<ExactMappingReference>("example/recommendation-coverage/exact-mapping-reference.json");

  assert.equal(reference.version, 1);
  assert.equal(reference.rows.length, reference.summary.totalExactMappings);
  assert.equal(countOf(reference.summary.bySource, "bsi") > 0, true);
  assert.equal(countOf(reference.summary.bySource, "cis") > 0, true);
  assert.equal(countOf(reference.summary.bySource, "vendor") > 0, true);
  assert.equal(countOf(reference.summary.byLanguage, "de") > 0, true);
  assert.equal(countOf(reference.summary.byLanguage, "en") > 0, true);
  assert.equal(countOf(reference.summary.byTargetKind, "relution-native") > 0, true);
  assert.equal(countOf(reference.summary.byTargetKind, "apple-schema-profile") > 0, true);

  const bsiPasscode = reference.rows.find(
    (row) => row.source === "bsi" && row.recommendationId === "windows-sys-2-1-a1" && row.mapping.target === "WINDOWS_PASSCODE",
  );
  assert.notEqual(bsiPasscode, undefined);
  assert.equal(bsiPasscode?.language, "de");
  assert.equal(bsiPasscode?.semanticConcepts.some((concept) => concept.label.de === "Authentisierung und Passcode"), true);
  assert.equal(bsiPasscode?.semanticConcepts.some((concept) => concept.label.en === "Authentication and passcode"), true);
  assert.equal(bsiPasscode?.mapping.fieldPaths.includes("minLength"), true);

  const cisManagedOpenIn = reference.rows.find(
    (row) =>
      row.source === "cis"
      && row.recommendationId === "cis-apple-ios-17-ipados-17-intune-1-0-0-2-1-1"
      && row.mapping.target === "profile:com.apple.applicationaccess",
  );
  assert.notEqual(cisManagedOpenIn, undefined);
  assert.equal(cisManagedOpenIn?.language, "en");
  assert.equal(cisManagedOpenIn?.matchEvidence.valueCompatibility, "curated-analog");
});

test("candidate review covers only non-exact mappings and links back to exact references", () => {
  const reference = readJson<ExactMappingReference>("example/recommendation-coverage/exact-mapping-reference.json");
  const review = readJson<MappingCandidateReview>("example/recommendation-coverage/mapping-candidate-review.json");
  const matrix = readJson<CoverageMatrix>("example/recommendation-coverage/relution-achievability-matrix.json");
  const referenceIds = new Set(reference.rows.map((row) => row.mappingId));

  assert.equal(review.version, 1);
  assert.equal(review.reviewMethod.mode, "offline-bilingual-reference-matching");
  assert.equal(review.reviewMethod.externalLlmApi, false);
  assert.equal(review.reviewMethod.exactPromotion, "validated-manual-ledger-only");
  assert.equal(review.inputs.exactMappingReferencePath, "example/recommendation-coverage/exact-mapping-reference.json");
  assert.equal(review.inputs.manualPromotionLedgerPath, "example/recommendation-coverage/manual-mapping-promotions.json");
  assert.equal(review.manualPromotionLedger.validatedEntries, 0);
  assert.equal(review.summary.exactReferenceCount, reference.summary.totalExactMappings);
  assert.equal(review.rows.length, matrix.rows.filter((row) => row.mappingStatus !== "exact").length);
  assert.equal(review.rows.every((row) => row.currentMappingStatus !== "exact"), true);
  assert.equal(countOf(review.summary.bySource, "bsi") > 0, true);
  assert.equal(countOf(review.summary.bySuggestedReviewAction, "review-partial-candidates") > 0, true);

  for (const row of review.rows) {
    assert.equal(row.extractedIntent.sourceSections.length > 0, true, row.recommendationId);
    assert.equal(row.semanticAnalysis.recommendationMeaning.length > 0, true, row.recommendationId);
    assert.equal(row.semanticAnalysis.relutionFit.length > 0, true, row.recommendationId);
    assert.equal(row.semanticAnalysis.exactnessDecision.length > 0, true, row.recommendationId);
    for (const nearest of row.nearestExactReferences) {
      assert.equal(referenceIds.has(nearest.mappingId), true, nearest.mappingId);
    }
    for (const candidate of row.rankedCandidates) {
      assert.equal(candidate.kind.length > 0, true, row.recommendationId);
      assert.equal(candidate.target.length > 0, true, row.recommendationId);
      assert.equal(candidate.score >= 0, true, row.recommendationId);
      assert.equal(candidate.settingMeaning.length > 0, true, row.recommendationId);
      assert.equal(candidate.decision.length > 0, true, row.recommendationId);
      for (const referenceId of candidate.referenceMappingIds) {
        assert.equal(referenceIds.has(referenceId), true, referenceId);
      }
    }
  }

  const bsiIcloud = review.rows.find((row) => row.source === "bsi" && row.recommendationId === "ios-sys-3-2-3-a14");
  assert.notEqual(bsiIcloud, undefined);
  assert.equal(bsiIcloud?.language, "de");
  assert.equal((bsiIcloud?.nearestExactReferences.length ?? 0) > 0, true);
  assert.equal((bsiIcloud?.rankedCandidates.length ?? 0) > 0, true);
});

test("partial semantic review covers concrete language and setting meanings across sources and platforms", () => {
  const review = readJson<MappingCandidateReview>("example/recommendation-coverage/mapping-candidate-review.json");

  const expectedRows = [
    {
      source: "bsi",
      platform: "IOS",
      recommendationId: "ios-sys-3-2-1-a34",
      concept: "dns_resolution",
      target: "APPLE_DNS_SETTINGS",
    },
    {
      source: "bsi",
      platform: "WINDOWS",
      recommendationId: "windows-sys-2-1-a26",
      concept: "exploit_mitigation",
      target: "WINDOWS_CUSTOM_CSP",
    },
    {
      source: "cis",
      platform: "MACOS",
      recommendationId: "cis-apple-macos-15-sequoia-2-0-0-2-3-2-2",
      concept: "time_sync",
      target: "APPLE_TIME_ZONE",
    },
    {
      source: "cis",
      platform: "ANDROID_ENTERPRISE",
      recommendationId: "cis-google-android-1-6-0-1-6",
      concept: "lock_screen_message",
      target: "ANDROID_ENTERPRISE_LOCK_SCREEN_MESSAGES",
    },
    {
      source: "vendor",
      platform: "ANDROID_ENTERPRISE",
      recommendationId: "android-016-lockthebootloaderwhenunknownosisreported",
      concept: "device_attestation_posture",
      target: "ANDROID_ENTERPRISE_ADVANCED_SECURITY_OVERRIDES",
    },
  ];

  for (const expected of expectedRows) {
    const row = review.rows.find((candidate) =>
      candidate.source === expected.source
      && candidate.platform === expected.platform
      && candidate.recommendationId === expected.recommendationId,
    );
    assert.notEqual(row, undefined, expected.recommendationId);
    assert.equal(row?.semanticConceptIds.includes(expected.concept), true, expected.recommendationId);
    assert.equal(row?.rankedCandidates.some((candidate) => candidate.target === expected.target), true, expected.recommendationId);
    assert.match(row?.semanticAnalysis.exactnessDecision ?? "", /candidate|parameter|not exact/iu, expected.recommendationId);
  }
});

test("guideline drift artifacts track source changes before ruleset updates", () => {
  const sourceReport = readJson<SourceChangeReport>("example/recommendation-coverage/source-change-report.json");
  const updatePlan = readJson<RulesetUpdatePlan>("example/recommendation-coverage/ruleset-update-plan.json");

  assert.equal(sourceReport.version, 1);
  assert.equal(sourceReport.rows.length, sourceReport.summary.totalSources);
  assert.equal(countOf(sourceReport.summary.bySource, "bsi") > 0, true);
  assert.equal(countOf(sourceReport.summary.bySource, "cis") > 0, true);
  assert.equal(countOf(sourceReport.summary.bySource, "vendor") > 0, true);
  assert.equal(countOf(sourceReport.summary.byClassification, "unchanged") > 0, true);

  for (const row of sourceReport.rows) {
    assert.equal(row.source.length > 0, true);
    assert.equal(row.sourceId.length > 0, true);
    assert.equal(row.classification, row.changeClassification);
    assert.equal(row.sha256.length > 0, true);
    assert.equal(row.textSha256.length > 0, true, row.sourceId);
    assert.equal(Array.isArray(row.affectedRecommendationIds), true);
    assert.equal(row.affectedRecommendationCount, row.affectedRecommendationIds.length);
  }

  assert.equal(updatePlan.version, 1);
  assert.equal(updatePlan.inputs.sourceChangeReportPath, "example/recommendation-coverage/source-change-report.json");
  assert.equal(updatePlan.inputs.exactMappingReferencePath, "example/recommendation-coverage/exact-mapping-reference.json");
  assert.equal(updatePlan.inputs.mappingCandidateReviewPath, "example/recommendation-coverage/mapping-candidate-review.json");
  assert.equal(updatePlan.inputs.manualPromotionLedgerPath, "example/recommendation-coverage/manual-mapping-promotions.json");
  assert.equal(updatePlan.summary.totalChangedSources, sourceReport.summary.changedSources);
  assert.equal(updatePlan.summary.proposedUpdates, updatePlan.rows.length);
  assert.equal(updatePlan.summary.totalChangedSources, 0);
  assert.equal(updatePlan.summary.proposedUpdates, 0);
});

test("recommendation-to-relution mapping drift artifacts stay review-gated", () => {
  const reference = readJson<ExactMappingReference>("example/recommendation-coverage/exact-mapping-reference.json");
  const review = readJson<MappingCandidateReview>("example/recommendation-coverage/mapping-candidate-review.json");
  const matrix = readJson<CoverageMatrix>("example/recommendation-coverage/relution-achievability-matrix.json");
  const changeReport = readJson<RelutionMappingChangeReport>("example/recommendation-coverage/relution-mapping-change-report.json");
  const updatePlan = readJson<RelutionMappingUpdatePlan>("example/recommendation-coverage/relution-mapping-update-plan.json");
  const referenceIds = new Set(reference.rows.map((row) => row.mappingId));
  const reviewIds = new Set(review.rows.map((row) => row.globalRecommendationId));

  assert.equal(changeReport.version, 1);
  assert.equal(changeReport.rows.length, matrix.rows.length);
  assert.equal(changeReport.summary.totalRecommendations, matrix.rows.length);
  assert.equal(countOf(changeReport.summary.bySource, "bsi") > 0, true);
  assert.equal(countOf(changeReport.summary.bySource, "cis") > 0, true);
  assert.equal(countOf(changeReport.summary.bySource, "vendor") > 0, true);
  assert.equal(countOf(changeReport.summary.byLanguage, "de") > 0, true);
  assert.equal(countOf(changeReport.summary.byLanguage, "en") > 0, true);
  assert.equal(countOf(changeReport.summary.byChangeClassification, "unchanged") > 0, true);

  for (const row of changeReport.rows) {
    assert.equal(row.globalRecommendationId, `${row.source}:${row.recommendationId}`);
    assert.equal(row.changeClassification.length > 0, true);
    for (const mappingId of row.exactMappingIds) {
      assert.equal(referenceIds.has(mappingId), true, mappingId);
    }
    for (const candidate of row.candidateMappings) {
      for (const mappingId of candidate.referenceMappingIds) {
        assert.equal(referenceIds.has(mappingId), true, mappingId);
      }
    }
    if (row.currentMappingStatus !== "exact") {
      assert.equal(reviewIds.has(row.globalRecommendationId), true, row.globalRecommendationId);
    }
  }

  assert.equal(updatePlan.version, 1);
  assert.equal(updatePlan.inputs.mappingChangeReportPath, "example/recommendation-coverage/relution-mapping-change-report.json");
  assert.equal(updatePlan.inputs.exactMappingReferencePath, "example/recommendation-coverage/exact-mapping-reference.json");
  assert.equal(updatePlan.inputs.mappingCandidateReviewPath, "example/recommendation-coverage/mapping-candidate-review.json");
  assert.equal(updatePlan.inputs.manualPromotionLedgerPath, "example/recommendation-coverage/manual-mapping-promotions.json");
  assert.equal(updatePlan.summary.totalChangedRecommendations, changeReport.summary.changedRecommendations);
  assert.equal(updatePlan.summary.proposedUpdates, updatePlan.rows.length);
});

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(path), "utf8")) as T;
}

function countOf(counts: Record<string, number>, key: string): number {
  return counts[key] ?? 0;
}
