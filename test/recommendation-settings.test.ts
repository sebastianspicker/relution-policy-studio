import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseSettingDetailsJson } from "../web/src/editor/json-template-import.js";

type SourceKey = "bsi" | "cis" | "vendor";

type SettingsCatalog = {
  version: number;
  name: string;
  verifiedAsOf?: string;
  sourceRecommendationCatalogPath: string;
  importableRulesetPath: string;
  bundles: Array<{
    bundleId: string;
    source: SourceKey;
    sourcePlatform: string;
    policyPlatform: string;
    targetType: string;
    variantId?: string;
    importFilePath: string;
    details: Record<string, unknown>;
    derivedFromRecommendationIds: string[];
    sourceIds: string[];
    mergeStrategy: string;
  }>;
  variantGroups: Array<{
    groupId: string;
    policyPlatform: string;
    targetType: string;
    conflictingPaths: string[];
    variants: Array<{
      bundleId: string;
      variantId: string;
      importFilePath: string;
    }>;
  }>;
  nonImportableRecommendations: Array<{
    recommendationId: string;
    mappingStatus: string;
    candidateTargets: string[];
    notes: string[];
  }>;
};

type RecommendationCatalogEntry = {
  id: string;
  platform: string;
  fallbackTranslations?: unknown[];
  implementation?: {
    category?: string;
    importableVia?: string[];
  };
  relutionMapping: {
    status: string;
    mergeableInImportableRuleset: boolean;
    parameterRequirements?: Array<{
      id: string;
      path: string;
    }>;
    candidates: Array<{
      target?: string;
      match?: {
        valueCompatibility?: string;
      };
    }>;
    rulesetMappings: Array<{
      kind?: string;
      type?: string;
      payloadType?: string;
      schemaId?: string;
      constraints?: Array<{
        path: string;
        operator: string;
        value: unknown;
      }>;
    }>;
  };
};

type SummaryWithSettingsCatalogPath = {
  settingBundleCatalogPath?: string;
};

const SOURCES: Array<{
  source: SourceKey;
  recommendationCatalogPath: string;
  settingsCatalogPath: string;
  baselineSummaryPath: string;
}> = [
  {
    source: "bsi",
    recommendationCatalogPath: "example/bsi-references/bsi-recommendations.json",
    settingsCatalogPath: "example/bsi-references/bsi-relution-settings-catalog.json",
    baselineSummaryPath: "example/bsi-references/bsi-relution-baseline.json",
  },
  {
    source: "cis",
    recommendationCatalogPath: "example/cis-references/cis-recommendations.json",
    settingsCatalogPath: "example/cis-references/cis-relution-settings-catalog.json",
    baselineSummaryPath: "example/cis-references/cis-relution-baseline.json",
  },
  {
    source: "vendor",
    recommendationCatalogPath: "example/vendor-references/vendor-recommendations.json",
    settingsCatalogPath: "example/vendor-references/vendor-relution-settings-catalog.json",
    baselineSummaryPath: "example/vendor-references/vendor-relution-baseline.json",
  },
];

const ALLOWED_MAPPING_STATUSES = new Set(["exact", "parameterized", "partial", "suggested", "none"]);

test("generated settings catalogs exist and stay internally consistent with their recommendation catalogs", () => {
  for (const sourceConfig of SOURCES) {
    const summary = readJson<SummaryWithSettingsCatalogPath>(sourceConfig.baselineSummaryPath);
    const recommendationCatalog = readJson<RecommendationCatalogEntry[]>(sourceConfig.recommendationCatalogPath);
    const settingsCatalog = readJson<SettingsCatalog>(sourceConfig.settingsCatalogPath);

    assert.equal(summary.settingBundleCatalogPath, sourceConfig.settingsCatalogPath, sourceConfig.source);
    assert.equal(settingsCatalog.version, 1, sourceConfig.source);
    assert.equal(settingsCatalog.sourceRecommendationCatalogPath, sourceConfig.recommendationCatalogPath, sourceConfig.source);
    assert.equal(existsSync(resolve(settingsCatalog.importableRulesetPath)), true, settingsCatalog.importableRulesetPath);
    assert.equal(settingsCatalog.bundles.length > 0, true, sourceConfig.source);

    const importableIds = new Set(
      recommendationCatalog
        .filter(
          (entry) =>
            entry.relutionMapping.status === "exact"
            && entry.relutionMapping.rulesetMappings.some((mapping) => mapping.kind === "relution-native"),
        )
        .map((entry) => entry.id),
    );
    const nonImportableIds = new Set(settingsCatalog.nonImportableRecommendations.map((entry) => entry.recommendationId));

    for (const bundle of settingsCatalog.bundles) {
      assert.equal(bundle.source, sourceConfig.source);
      assert.equal(bundle.details.type, bundle.targetType, bundle.bundleId);
      assert.equal(bundle.derivedFromRecommendationIds.length > 0, true, bundle.bundleId);
      assert.equal(bundle.sourceIds.length > 0, true, bundle.bundleId);
      assert.equal(existsSync(resolve(bundle.importFilePath)), true, bundle.importFilePath);
      const parsed = parseSettingDetailsJson(readFileSync(resolve(bundle.importFilePath), "utf8"));
      assert.equal(parsed.type, bundle.targetType, bundle.importFilePath);
      for (const recommendationId of bundle.derivedFromRecommendationIds) {
        assert.equal(importableIds.has(recommendationId), true, recommendationId);
      }
    }

    assert.equal(nonImportableIds.size + importableIds.size, recommendationCatalog.length, sourceConfig.source);
  }
});

test("recommendation catalogs use normalized mapping status and importability metadata", () => {
  for (const sourceConfig of SOURCES) {
    const recommendationCatalog = readJson<RecommendationCatalogEntry[]>(sourceConfig.recommendationCatalogPath);

    for (const entry of recommendationCatalog) {
      assert.equal(ALLOWED_MAPPING_STATUSES.has(entry.relutionMapping.status), true, `${sourceConfig.source}:${entry.id}`);

      if (entry.relutionMapping.status !== "exact") {
        continue;
      }

      assert.equal(entry.relutionMapping.rulesetMappings.length > 0, true, `${sourceConfig.source}:${entry.id}`);
      assert.equal(entry.relutionMapping.mergeableInImportableRuleset, true, `${sourceConfig.source}:${entry.id}`);
      assert.equal(entry.implementation?.importableVia?.includes("ruleset-import"), true, `${sourceConfig.source}:${entry.id}`);
      assert.equal(
        entry.relutionMapping.rulesetMappings.every(
          (mapping) => typeof (mapping.type ?? mapping.payloadType ?? mapping.schemaId) === "string",
        ),
        true,
        `${sourceConfig.source}:${entry.id}`,
      );
    }
  }
});

test("mapping class invariants prevent false exact promotion and preserve concrete import behavior", () => {
  for (const sourceConfig of SOURCES) {
    const recommendationCatalog = readJson<RecommendationCatalogEntry[]>(sourceConfig.recommendationCatalogPath);

    for (const entry of recommendationCatalog) {
      const parameterRequirements = entry.relutionMapping.parameterRequirements ?? [];
      if (entry.relutionMapping.status === "exact") {
        assert.equal(parameterRequirements.length, 0, `${sourceConfig.source}:${entry.id}`);
      }
      if (entry.relutionMapping.status === "parameterized") {
        assert.equal(parameterRequirements.length > 0, true, `${sourceConfig.source}:${entry.id}`);
        assert.equal(entry.relutionMapping.rulesetMappings.length, 0, `${sourceConfig.source}:${entry.id}`);
        assert.equal(entry.relutionMapping.mergeableInImportableRuleset, false, `${sourceConfig.source}:${entry.id}`);
        assert.deepEqual(entry.implementation?.importableVia ?? [], [], `${sourceConfig.source}:${entry.id}`);
      }
      if (entry.implementation?.category === "helper-only") {
        assert.equal(entry.relutionMapping.rulesetMappings.length, 0, `${sourceConfig.source}:${entry.id}`);
        assert.deepEqual(entry.implementation.importableVia ?? [], [], `${sourceConfig.source}:${entry.id}`);
        assert.equal((entry.fallbackTranslations ?? []).length > 0, true, `${sourceConfig.source}:${entry.id}`);
      }
    }
  }

  const bsiCatalog = readJson<RecommendationCatalogEntry[]>("example/bsi-references/bsi-recommendations.json");
  const scopedPolicy = recommendationById(bsiCatalog, "android-enterprise-sys-3-2-1-a1");
  assert.equal(scopedPolicy.relutionMapping.status, "parameterized");
  assert.deepEqual(scopedPolicy.relutionMapping.parameterRequirements?.map((requirement) => requirement.path), ["scope.assetGroup"]);
  assert.equal(scopedPolicy.relutionMapping.candidates.some((candidate) => candidate.target === "ANDROID_ENTERPRISE_RESTRICTION"), true);

  const cisCatalog = readJson<RecommendationCatalogEntry[]>("example/cis-references/cis-recommendations.json");
  const constrainedPasscode = recommendationById(cisCatalog, "cis-apple-ios-17-ipados-17-intune-1-0-0-2-7-4");
  assert.deepEqual(constrainedPasscode.relutionMapping.rulesetMappings[0]?.constraints, [
    { path: "minLength", operator: "atLeast", value: 6 },
  ]);
  const cisSettings = readJson<SettingsCatalog>("example/cis-references/cis-relution-settings-catalog.json");
  const passcodeBundle = bundleForRecommendation(cisSettings, constrainedPasscode.id);
  assert.equal(passcodeBundle.targetType, "IOS_PASSCODE");
  assert.equal(passcodeBundle.details.minLength, 6);

  const helperOnly = recommendationById(cisCatalog, "cis-microsoft-windows-11-standalone-5-0-0-5-1");
  assert.equal(helperOnly.implementation?.category, "helper-only");
  assert.equal(helperOnly.fallbackTranslations?.some((fallback) => JSON.stringify(fallback).includes("Set-Service -Name BTAGService")), true);

  const vendorCatalog = readJson<RecommendationCatalogEntry[]>("example/vendor-references/vendor-recommendations.json");
  const androidOta = recommendationById(vendorCatalog, "android-008-offerautomaticotasystemupdates");
  assert.equal(androidOta.platform, "ANDROID");
  assert.deepEqual(androidOta.relutionMapping.rulesetMappings, [
    {
      kind: "relution-native",
      type: "ANDROID_ENTERPRISE_SYSTEM_UPDATE",
      values: { systemUpdateType: "AUTOMATIC" },
    },
  ]);
  const vendorSettings = readJson<SettingsCatalog>("example/vendor-references/vendor-relution-settings-catalog.json");
  const otaBundle = bundleForRecommendation(vendorSettings, androidOta.id);
  assert.equal(otaBundle.sourcePlatform, "ANDROID");
  assert.equal(otaBundle.policyPlatform, "ANDROID_ENTERPRISE");
  assert.equal(otaBundle.targetType, "ANDROID_ENTERPRISE_SYSTEM_UPDATE");
  assert.equal(otaBundle.details.systemUpdateType, "AUTOMATIC");
});

test("generated recommendation mappings preserve safe exact evidence and comparison constraints", () => {
  const cisCatalog = readJson<RecommendationCatalogEntry[]>("example/cis-references/cis-recommendations.json");

  const minimumLength = cisCatalog.find((entry) => entry.id === "cis-microsoft-windows-11-standalone-5-0-0-1-1-4");
  assert.notEqual(minimumLength, undefined);
  assert.deepEqual(minimumLength?.relutionMapping.rulesetMappings[0]?.constraints, [
    { path: "minLength", operator: "atLeast", value: 14 },
  ]);

  const tlsPrompt = cisCatalog.find((entry) => entry.id === "cis-apple-ios-18-2-0-0-2-2-1-5");
  assert.notEqual(tlsPrompt, undefined);
  assert.equal(tlsPrompt?.relutionMapping.status, "exact");
  assert.equal(tlsPrompt?.relutionMapping.candidates[0]?.match?.valueCompatibility, "curated-analog");
});

test("vendor Android system update settings emit explicit variants instead of silently choosing one value", () => {
  const catalog = readJson<SettingsCatalog>("example/vendor-references/vendor-relution-settings-catalog.json");
  const variantGroup = catalog.variantGroups.find(
    (group) => group.policyPlatform === "ANDROID_ENTERPRISE" && group.targetType === "ANDROID_ENTERPRISE_SYSTEM_UPDATE",
  );

  assert.notEqual(variantGroup, undefined);
  assert.deepEqual(variantGroup?.conflictingPaths, ["systemUpdateType"]);
  assert.deepEqual(variantGroup?.variants.map((variant) => variant.variantId).sort(), [
    "systemupdatetype-automatic",
    "systemupdatetype-postpone",
    "systemupdatetype-windowed",
  ]);

  const detailsByVariant = new Map(
    variantGroup?.variants.map((variant) => [
      variant.variantId,
      parseSettingDetailsJson(readFileSync(resolve(variant.importFilePath), "utf8")).systemUpdateType,
    ]) ?? [],
  );
  assert.equal(detailsByVariant.get("systemupdatetype-automatic"), "AUTOMATIC");
  assert.equal(detailsByVariant.get("systemupdatetype-postpone"), "POSTPONE");
  assert.equal(detailsByVariant.get("systemupdatetype-windowed"), "WINDOWED");
});

test("vendor Windows Custom CSP mappings emit additive bundles from Relution REXP evidence", () => {
  const catalog = readJson<SettingsCatalog>("example/vendor-references/vendor-relution-settings-catalog.json");
  const customCspBundles = catalog.bundles.filter((bundle) => bundle.policyPlatform === "WINDOWS" && bundle.targetType === "WINDOWS_CUSTOM_CSP");

  assert.equal(customCspBundles.length >= 130, true);
  assert.equal(catalog.variantGroups.some((group) => group.targetType === "WINDOWS_CUSTOM_CSP"), false);
  assert.equal(
    customCspBundles.some((bundle) => bundle.details.name === "PreventEnablingLockScreenCamera" && typeof bundle.details.installSyncML === "string"),
    true,
  );
});

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(path), "utf8")) as T;
}

function recommendationById(catalog: RecommendationCatalogEntry[], id: string): RecommendationCatalogEntry {
  const entry = catalog.find((candidate) => candidate.id === id);
  assert.notEqual(entry, undefined);
  return entry as RecommendationCatalogEntry;
}

function bundleForRecommendation(catalog: SettingsCatalog, recommendationId: string): SettingsCatalog["bundles"][number] {
  const matches = catalog.bundles.filter((bundle) => bundle.derivedFromRecommendationIds.includes(recommendationId));
  assert.equal(matches.length, 1, recommendationId);
  return matches[0] as SettingsCatalog["bundles"][number];
}
