import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadAppleSchemaCatalog } from "../src/apple-schema-catalog.js";
import { loadBaselineExpertOptions } from "../src/baseline-templates.js";
import { loadTemplateBundle } from "../src/templates.js";
import { importRulesetWorkspace } from "../web/src/editor/ruleset-import.js";

type Platform = "WINDOWS" | "MACOS" | "IOS" | "ANDROID_ENTERPRISE";
type Source = "bsi" | "cis" | "vendor";

type TemplateIndexEntry = {
  path: string;
  platform: Platform;
  source?: Source;
  tier?: 1 | 2 | 3;
  tierLabel?: string;
  securityLevel?: string;
  tierSourcePolicy?: "bsi-cis-vendor";
  tierCoverage?: "distinct" | "inherited" | "partial";
  module?: {
    kind: string;
    target: string;
    slug: string;
    label: string;
  };
  policyCount: number;
  ruleCount: number;
  actionableRuleCount: number;
  informationalRuleCount: number;
  suppressedConflictRuleCount?: number;
};

type TemplateIndex = {
  version: number;
  format: string;
  platforms: string[];
  consolidatedTemplates: TemplateIndexEntry[];
  modularBundleTemplates: TemplateIndexEntry[];
  modularTemplates: TemplateIndexEntry[];
  tieredConsolidatedTemplates: TemplateIndexEntry[];
  tieredModularBundleTemplates: TemplateIndexEntry[];
  tieredModularTemplates: TemplateIndexEntry[];
};

type SourceReference = {
  baselinePath: string;
  recommendationCatalogPath: string;
  rulesetPath: string;
};

type RulesetRule = {
  id: string;
  title: string;
  informational?: boolean;
  mappings?: Array<Record<string, unknown>>;
  source?: Source;
  conflict?: {
    source: Source;
    ruleId: string;
    target: string;
    conflictingPaths: string[];
    reason: string;
  };
};

type RulesetPolicy = {
  platform: Platform;
  name: string;
  rules: RulesetRule[];
};

type BaselineTemplate = {
  version: number;
  name: string;
  baselineTemplate: {
    version: number;
    kind:
      | "source-platform"
      | "consolidated-platform"
      | "modular-platform"
      | "modular-target"
      | "tiered-consolidated-platform"
      | "tiered-modular-platform"
      | "tiered-modular-target";
    source?: Source;
    platform: Platform;
    tier?: 1 | 2 | 3;
    tierLabel?: string;
    securityLevel?: string;
    tierSourcePolicy?: "bsi-cis-vendor";
    tierCoverage?: "distinct" | "inherited" | "partial";
    module?: {
      kind: string;
      target: string;
      slug: string;
      label: string;
    };
  };
  consolidation?: {
    platform: Platform;
    sources: Source[];
    precedence: Source[];
    sourceReferences: Record<Source, SourceReference>;
    actionableRuleCounts: Record<Source, number>;
    informationalRuleCounts: Record<Source, number>;
    suppressedConflictRules: Array<{
      source: Source;
      ruleId: string;
      target: string;
      preferredTarget?: string;
      conflictingPaths: string[];
      reason: string;
    }>;
  };
  policies: RulesetPolicy[];
};

type RecommendationRecord = {
  id: string;
  platform: Platform;
  relutionMapping: {
    status: string;
    rulesetMappings: Array<{
      kind: string;
      target?: string;
      type?: string;
      schemaId?: string;
      payloadType?: string;
      values?: Record<string, unknown>;
    }>;
  };
};

const SOURCES: Source[] = ["bsi", "cis", "vendor"];
const PLATFORMS: Platform[] = ["WINDOWS", "MACOS", "IOS", "ANDROID_ENTERPRISE"];
const TIERS: Array<1 | 2 | 3> = [1, 2, 3];

test("baseline template index exposes full and modular import templates", () => {
  const index = readJson<TemplateIndex>("example/relution-baseline-templates/index.json");

  assert.equal(index.version, 1);
  assert.equal(index.format, "relution-ruleset-json");
  assert.deepEqual(index.platforms, ["windows", "macos", "ios", "android-enterprise"]);
  assert.equal(index.consolidatedTemplates.length, PLATFORMS.length);
  assert.equal(index.modularBundleTemplates.length, PLATFORMS.length);
  assert.equal(index.modularTemplates.length > PLATFORMS.length, true);
  assert.equal(index.tieredConsolidatedTemplates.length, PLATFORMS.length * TIERS.length);
  assert.equal(index.tieredModularBundleTemplates.length, PLATFORMS.length * TIERS.length);
  assert.equal(index.tieredModularTemplates.length > index.modularTemplates.length, true);
  assert.equal("sourceTemplates" in index, false);
  assert.equal(existsSync(resolve("example/relution-baseline-templates/sources")), false);

  for (const platform of PLATFORMS) {
    const fullEntry = index.consolidatedTemplates.find((candidate) => candidate.platform === platform);
    const bundleEntry = index.modularBundleTemplates.find((candidate) => candidate.platform === platform);
    const moduleEntries = index.modularTemplates.filter((candidate) => candidate.platform === platform);
    assert.notEqual(fullEntry, undefined, platform);
    assert.notEqual(bundleEntry, undefined, platform);
    assert.equal(existsSync(resolve(fullEntry?.path ?? "")), true, fullEntry?.path);
    assert.equal(existsSync(resolve(bundleEntry?.path ?? "")), true, bundleEntry?.path);
    assert.equal(fullEntry?.policyCount, 1);
    assert.equal((fullEntry?.actionableRuleCount ?? 0) > 0, true, platform);
    assert.equal(bundleEntry?.policyCount, moduleEntries.length, platform);
    assert.equal((bundleEntry?.policyCount ?? 0) > 1, true, platform);
    assert.equal(
      moduleEntries.every((entry) => entry.policyCount === 1 && entry.actionableRuleCount > 0 && entry.module !== undefined && existsSync(resolve(entry.path))),
      true,
      platform,
    );
  }
});

test("tiered baseline templates expose three monotonic security tiers per OS", () => {
  const index = readJson<TemplateIndex>("example/relution-baseline-templates/index.json");

  for (const platform of PLATFORMS) {
    const tierTargets = new Map<number, string[]>();
    for (const tier of TIERS) {
      const fullEntry = index.tieredConsolidatedTemplates.find((entry) => entry.platform === platform && entry.tier === tier);
      const bundleEntry = index.tieredModularBundleTemplates.find((entry) => entry.platform === platform && entry.tier === tier);
      const moduleEntries = index.tieredModularTemplates.filter((entry) => entry.platform === platform && entry.tier === tier);
      assert.notEqual(fullEntry, undefined, `${platform}:tier-${tier}:full`);
      assert.notEqual(bundleEntry, undefined, `${platform}:tier-${tier}:bundle`);
      assert.equal(existsSync(resolve(fullEntry?.path ?? "")), true, fullEntry?.path);
      assert.equal(existsSync(resolve(bundleEntry?.path ?? "")), true, bundleEntry?.path);
      assert.equal(fullEntry?.policyCount, 1, `${platform}:tier-${tier}:full policy count`);
      assert.equal((fullEntry?.actionableRuleCount ?? 0) > 0, true, `${platform}:tier-${tier}:actionable`);
      assert.equal(bundleEntry?.policyCount, moduleEntries.length, `${platform}:tier-${tier}:module count`);
      assert.equal(
        moduleEntries.every(
          (entry) =>
            entry.policyCount === 1 &&
            entry.actionableRuleCount > 0 &&
            entry.module !== undefined &&
            entry.tierLabel !== undefined &&
            entry.securityLevel !== undefined &&
            entry.tierSourcePolicy === "bsi-cis-vendor" &&
            entry.tierCoverage !== undefined &&
            existsSync(resolve(entry.path)),
        ),
        true,
        `${platform}:tier-${tier}:modules`,
      );

      const fullTemplate = readJson<BaselineTemplate>(fullEntry?.path ?? "");
      assert.equal(fullTemplate.baselineTemplate.kind, "tiered-consolidated-platform");
      assert.equal(fullTemplate.baselineTemplate.tier, tier);
      assert.equal(fullTemplate.baselineTemplate.tierSourcePolicy, "bsi-cis-vendor");
      assert.equal(fullTemplate.baselineTemplate.tierCoverage !== undefined, true);
      tierTargets.set(tier, sortedActionableTargets(fullTemplate));
    }

    assert.equal(isSubset(tierTargets.get(3) ?? [], tierTargets.get(2) ?? []), true, `${platform}:tier-3 subset tier-2`);
    assert.equal(isSubset(tierTargets.get(2) ?? [], tierTargets.get(1) ?? []), true, `${platform}:tier-2 subset tier-1`);
  }
});

test("baseline templates are valid ruleset imports for the current editor importer", () => {
  const index = readJson<TemplateIndex>("example/relution-baseline-templates/index.json");
  const bundle = loadTemplateBundle();
  const appleSchema = loadAppleSchemaCatalog();

  for (const entry of allTemplateEntries(index)) {
    const template = readJson<BaselineTemplate>(entry.path);
    const result = importRulesetWorkspace(template, bundle, appleSchema);

    assert.equal(result.report.conflicts.length, 0, entry.path);
    assert.equal(result.report.unresolved.length, 0, entry.path);
    assert.notEqual(result.workspace, undefined, entry.path);
    assert.equal(template.policies.every((policy) => policy.platform === entry.platform), true, entry.path);
  }
});

test("expert baseline options expose selectable settings with recommendation evidence", () => {
  for (const platform of PLATFORMS) {
    const expert = loadBaselineExpertOptions({ platform, shape: "modules" });
    assert.equal(expert.platform, platform);
    assert.equal(expert.shape, "modules");
    assert.equal(expert.settings.length > 0, true, platform);
    assert.equal(expert.settings.every((setting) => setting.tierMappings.length > 0), true, platform);
    assert.equal(expert.settings.every((setting) => setting.recommendations.length > 0), true, platform);

    const tier1 = expert.tierCoverage.find((entry) => entry.tier === 1)?.totalSettings ?? 0;
    const tier2 = expert.tierCoverage.find((entry) => entry.tier === 2)?.totalSettings ?? 0;
    const tier3 = expert.tierCoverage.find((entry) => entry.tier === 3)?.totalSettings ?? 0;
    assert.equal(tier3 <= tier2, true, `${platform}:tier-3 <= tier-2`);
    assert.equal(tier2 <= tier1, true, `${platform}:tier-2 <= tier-1`);
  }
});

test("iOS expert baseline metadata is scoped to the selected tier", () => {
  const expert = loadBaselineExpertOptions({ platform: "IOS", shape: "modules" });
  const restriction = expert.settings.find((setting) => setting.id === "relution-native:IOS_RESTRICTION");
  assert.notEqual(restriction, undefined);

  const tier3 = restriction?.tierMappings.find((entry) => entry.tier === 3);
  assert.equal(tier3?.policyName, "iOS Tier 3 Baseline - iOS Restriction");
  assert.deepEqual(tier3?.recommendations?.map((recommendation) => recommendation.source), ["bsi"]);

  const tier1 = restriction?.tierMappings.find((entry) => entry.tier === 1);
  assert.deepEqual(tier1?.recommendations?.map((recommendation) => recommendation.source), ["bsi", "cis"]);
});

test("tiered baselines cover every exact BSI actionable setting across platforms", () => {
  const recommendations = readJson<RecommendationRecord[]>("example/bsi-references/bsi-recommendations.json")
    .filter((recommendation) => recommendation.relutionMapping.status === "exact" && recommendation.relutionMapping.rulesetMappings.length > 0);

  for (const platform of PLATFORMS) {
    const platformRecommendations = recommendations.filter((recommendation) => recommendation.platform === platform);
    for (const tier of TIERS) {
      const platformSlug = platform.toLowerCase().replaceAll("_", "-");
      const template = readJson<BaselineTemplate>(`example/relution-baseline-templates/tiered/${platformSlug}/tier-${tier}-modules.json`);
      const templateMappings = template.policies.flatMap((policy) =>
        policy.rules.flatMap((rule) =>
          (rule.mappings ?? []).map((mapping) => ({ target: mappingTarget(mapping), values: mapping.values })),
        ),
      );

      assert.deepEqual(
        platformRecommendations.flatMap((recommendation) =>
          recommendation.relutionMapping.rulesetMappings
            .filter((mapping) => !mappingCovered(mapping, templateMappings))
            .map((mapping) => `${platform}:tier-${tier}:${recommendation.id}:${mappingTarget(mapping)}`),
        ),
        [],
      );
    }
  }
});

test("modular baseline templates split each OS into non-conflicting policy blocks", () => {
  const index = readJson<TemplateIndex>("example/relution-baseline-templates/index.json");

  for (const platform of PLATFORMS) {
    const fullEntry = index.consolidatedTemplates.find((candidate) => candidate.platform === platform);
    const bundleEntry = index.modularBundleTemplates.find((candidate) => candidate.platform === platform);
    assert.notEqual(fullEntry, undefined, platform);
    assert.notEqual(bundleEntry, undefined, platform);
    const fullTemplate = readJson<BaselineTemplate>(fullEntry?.path ?? "");
    const bundleTemplate = readJson<BaselineTemplate>(bundleEntry?.path ?? "");
    const moduleEntries = index.modularTemplates.filter((candidate) => candidate.platform === platform);
    const moduleTemplates = moduleEntries.map((entry) => readJson<BaselineTemplate>(entry.path));

    assert.equal(bundleTemplate.baselineTemplate.kind, "modular-platform");
    assert.equal(bundleTemplate.policies.length, moduleEntries.length, platform);
    assert.equal(
      bundleTemplate.policies.every((policy) => policy.platform === platform && policy.rules.every((rule) => rule.informational !== true)),
      true,
      platform,
    );
    assert.equal(
      moduleTemplates.every(
        (template) =>
          template.baselineTemplate.kind === "modular-target" &&
          template.baselineTemplate.module !== undefined &&
          template.policies.length === 1 &&
          template.policies[0]?.rules.every((rule) => rule.informational !== true),
      ),
      true,
      platform,
    );
    assert.deepEqual(
      sortedActionableTargets(bundleTemplate),
      sortedActionableTargets(fullTemplate),
      platform,
    );
  }
});

test("consolidated baseline templates preserve BSI precedence and suppress lower-priority conflicts", () => {
  for (const platform of PLATFORMS) {
    const template = readJson<BaselineTemplate>(`example/relution-baseline-templates/consolidated/${platform.toLowerCase().replaceAll("_", "-")}-full.json`);
    const consolidation = template.consolidation;

    assert.notEqual(consolidation, undefined, platform);
    assert.deepEqual(consolidation?.sources, SOURCES);
    assert.deepEqual(consolidation?.precedence, SOURCES);
    assert.equal(consolidation?.platform, platform);
    assert.equal(Object.keys(consolidation?.sourceReferences ?? {}).sort().join(","), [...SOURCES].sort().join(","));
    for (const source of SOURCES) {
      const references: SourceReference | undefined = consolidation?.sourceReferences[source];
      assert.equal(references?.baselinePath.startsWith(`example/${source}-references/`), true, `${platform}:${source}`);
      assert.equal(references?.recommendationCatalogPath.startsWith(`example/${source}-references/`), true, `${platform}:${source}`);
      assert.equal(references?.rulesetPath.startsWith(`example/${source}-references/`), true, `${platform}:${source}`);
      assert.equal(existsSync(resolve(references?.baselinePath ?? "")), true, references?.baselinePath);
      assert.equal(existsSync(resolve(references?.recommendationCatalogPath ?? "")), true, references?.recommendationCatalogPath);
      assert.equal(existsSync(resolve(references?.rulesetPath ?? "")), true, references?.rulesetPath);
    }
    assert.equal((consolidation?.actionableRuleCounts.bsi ?? 0) > 0, true, platform);
    assert.equal(
      template.policies[0]?.rules
        .filter((rule) => rule.conflict !== undefined)
        .every((rule) => rule.informational === true && rule.mappings?.length === 0),
      true,
      platform,
    );
  }

  const windows = readJson<BaselineTemplate>("example/relution-baseline-templates/consolidated/windows-full.json");
  assert.equal(
    windows.consolidation?.suppressedConflictRules.some(
      (conflict) =>
        conflict.source === "cis"
        && conflict.target === "WINDOWS_PASSCODE"
        && conflict.conflictingPaths.includes("minLength"),
    ),
    true,
  );

  const macos = readJson<BaselineTemplate>("example/relution-baseline-templates/consolidated/macos-full.json");
  assert.equal(
    macos.consolidation?.suppressedConflictRules.some(
      (conflict) =>
        conflict.source === "cis"
        && conflict.target === "profile:com.apple.screensaver"
        && conflict.preferredTarget === "MACOS_SCREENSAVER",
    ),
    true,
  );
});

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(path), "utf8")) as T;
}

function allTemplateEntries(index: TemplateIndex): TemplateIndexEntry[] {
  return [
    ...index.consolidatedTemplates,
    ...index.modularBundleTemplates,
    ...index.modularTemplates,
    ...index.tieredConsolidatedTemplates,
    ...index.tieredModularBundleTemplates,
    ...index.tieredModularTemplates,
  ];
}

function sortedActionableTargets(template: BaselineTemplate): string[] {
  const targets = new Set<string>();
  for (const policy of template.policies) {
    for (const rule of policy.rules) {
      for (const mapping of rule.mappings ?? []) {
        const target = String(mapping.type ?? mapping.payloadType ?? mapping.schemaId ?? "");
        if (target.length > 0) {
          targets.add(target);
        }
      }
    }
  }
  return [...targets].sort();
}

function mappingTarget(mapping: Record<string, unknown>): string {
  return String(mapping.type ?? mapping.payloadType ?? mapping.schemaId ?? mapping.target ?? "");
}

function mappingCovered(
  mapping: RecommendationRecord["relutionMapping"]["rulesetMappings"][number],
  templateMappings: Array<{ target: string; values: unknown }>,
): boolean {
  const values = mapping.values ?? {};
  return templateMappings.some((candidate) => {
    const candidateValues = candidate.values;
    return candidate.target === mappingTarget(mapping)
      && isObjectRecord(candidateValues)
      && Object.entries(values).every(([key, value]) => deepEqualJson(candidateValues[key], value));
  });
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepEqualJson(left: unknown, right: unknown): boolean {
  try {
    assert.deepEqual(left, right);
    return true;
  } catch {
    return false;
  }
}

function isSubset(left: string[], right: string[]): boolean {
  const rightSet = new Set(right);
  return left.every((value) => rightSet.has(value));
}
