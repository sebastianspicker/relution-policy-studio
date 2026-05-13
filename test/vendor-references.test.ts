import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadAppleSchemaCatalog } from "../src/apple-schema-catalog.js";
import { extractRexp } from "../src/rexp.js";
import { loadTemplateBundle } from "../src/templates.js";
import { importRulesetWorkspace } from "../web/src/editor/ruleset-import.js";

type JsonRecord = Record<string, unknown>;

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

type VendorSummary = {
  verifiedAsOf: string;
  settingBundleCatalogPath?: string;
  guidanceModel: {
    windows: {
      model: string;
      currentPrimarySourceId: string;
      currentPrimaryVersion: string;
    };
    android: {
      model: string;
      currentPrimarySourceId: string;
    };
    macos: {
      model: string;
      currentPrimarySourceId: string;
    };
  };
  platforms: Record<string, unknown>;
};

type VendorRecommendation = {
  id: string;
  platform: string;
  sourceIds: string[];
  title: string;
  recommendedValue: unknown;
  reason: string;
  implementation?: {
    category: string;
    surfaces: string[];
    importableVia: string[];
    blockingReasons: string[];
  };
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
    }>;
    rulesetMappings: Array<JsonRecord>;
  };
};

type WindowsRexpEvidence = {
  customCspSettings: Array<{
    name: string;
    sourceFile: string;
    policyName: string;
    locUri: string;
  }>;
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

test("download manifest covers every referenced vendor source", () => {
  const sources = readJson<SourceEntry[]>("example/vendor-references/sources.json");
  const manifest = readJson<DownloadManifestEntry[]>("example/vendor-references/downloads/manifest.json");

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

test("checked-in vendor raw downloads redact public token-shaped page config", () => {
  const manifest = readJson<DownloadManifestEntry[]>("example/vendor-references/downloads/manifest.json");
  const alertPatterns = [
    /AIza[0-9A-Za-z_-]{30,45}/u,
    /pk_live_[0-9A-Za-z]{40,120}/u,
  ];

  for (const entry of manifest.filter((item) => item.localPath.endsWith(".html"))) {
    if (!existsSync(resolve(entry.localPath))) {
      continue;
    }
    const raw = readFileSync(resolve(entry.localPath), "utf8");
    for (const pattern of alertPatterns) {
      assert.equal(pattern.test(raw), false, `${entry.localPath} contains ${pattern.source}`);
    }
  }
});

test("vendor baseline summary exposes the current vendor guidance model and platform coverage", () => {
  const summary = readJson<VendorSummary>("example/vendor-references/vendor-relution-baseline.json");

  assert.equal(summary.verifiedAsOf, "2026-04-23");
  assert.equal(summary.guidanceModel.windows.model, "named-security-baseline");
  assert.equal(summary.guidanceModel.windows.currentPrimarySourceId, "microsoft-windows-11-25h2-security-baseline");
  assert.equal(summary.guidanceModel.windows.currentPrimaryVersion, "Windows 11 version 25H2");
  assert.equal(summary.guidanceModel.android.model, "equivalent-vendor-guidance-stack");
  assert.equal(summary.guidanceModel.macos.model, "equivalent-vendor-guidance-stack");
  assert.equal(summary.settingBundleCatalogPath, "example/vendor-references/vendor-relution-settings-catalog.json");
  assert.deepEqual(Object.keys(summary.platforms).sort(), ["android", "macos", "windows"]);
});

test("vendor recommendation catalog contains reasons and relution mapping metadata for every platform", () => {
  const recommendations = readJson<VendorRecommendation[]>("example/vendor-references/vendor-recommendations.json");

  assert.equal(recommendations.length > 50, true);
  assert.deepEqual([...new Set(recommendations.map((entry) => entry.platform))].sort(), ["ANDROID", "MACOS", "WINDOWS"]);

  for (const entry of recommendations) {
    assert.equal(typeof entry.id, "string");
    assert.equal(entry.id.length > 0, true, entry.id);
    assert.equal(entry.sourceIds.length > 0, true, entry.id);
    assert.equal(typeof entry.title, "string");
    assert.equal(entry.title.length > 0, true, entry.id);
    assert.equal(typeof entry.reason, "string");
    assert.equal(entry.reason.trim().length > 0, true, entry.id);
    assert.equal(typeof entry.implementation?.category, "string", entry.id);
    assert.equal(
      (Array.isArray(entry.semanticConcepts) && entry.semanticConcepts.length > 0) || typeof entry.semanticNoConceptReason === "string",
      true,
      entry.id,
    );
    assert.equal(typeof entry.relutionMapping.status, "string");
    assert.equal(Array.isArray(entry.relutionMapping.candidates), true, entry.id);
    assert.equal(Array.isArray(entry.relutionMapping.rulesetMappings), true, entry.id);
  }

  assert.equal(
    recommendations.some((entry) => entry.platform === "WINDOWS" && entry.relutionMapping.rulesetMappings.length > 0),
    true,
    "windows should include at least one directly mappable recommendation",
  );
  assert.equal(
    recommendations.filter((entry) => entry.platform === "WINDOWS" && entry.relutionMapping.status === "exact").length >= 170,
    true,
    "windows exact coverage should include Relution CSP-backed security baseline settings",
  );
  assert.equal(
    recommendations.some((entry) => entry.platform === "ANDROID" && entry.relutionMapping.rulesetMappings.length > 0),
    true,
    "android should include at least one directly mappable recommendation",
  );
  assert.equal(
    recommendations.some((entry) => entry.platform === "MACOS" && entry.relutionMapping.rulesetMappings.length > 0),
    true,
    "macos should include at least one directly mappable recommendation",
  );

  const androidPlayProtect = recommendations.find((entry) => entry.id === "android-001-enforcegoogleplayprotectonmanageddevices");
  assert.notEqual(androidPlayProtect, undefined);
  assert.equal(hasSemanticConcept(androidPlayProtect, "malware_protection"), true);

  const macosFileVault = recommendations.find((entry) => entry.id === "macos-001-enablefilevaultonmanagedmacs");
  assert.notEqual(macosFileVault, undefined);
  assert.equal(hasSemanticConcept(macosFileVault, "encryption"), true);
});

test("Windows Relution CSP evidence matches the example REXP exports", () => {
  const evidence = readJson<WindowsRexpEvidence>("example/vendor-references/downloads/derived/windows-relution-csp-evidence.json");
  const expectedKeys = evidence.customCspSettings.map((entry) => evidenceKey(entry)).sort();
  const observedKeys: string[] = [];

  for (const sourceFile of [
    "example/Windows Group Policy Definitions.rexp",
    "example/Windows Policies Win11 24H2.rexp",
    "example/Windows Security Baselines Edge v128.rexp",
    "example/Windows Security Baselines Win11 24H2.rexp",
  ]) {
    const outputRoot = mkdtempSync(resolve(tmpdir(), "relution-rexp-evidence-"));
    extractRexp(resolve(sourceFile), outputRoot, "Relution", { force: true, pretty: true });
    for (const policyFile of readdirSync(join(outputRoot, "policies")).filter((entry) => entry.endsWith(".json"))) {
      const policy = readJson<{ name: string; versions?: Array<{ configurations?: Array<{ details?: JsonRecord }> }> }>(join(outputRoot, "policies", policyFile));
      for (const configuration of policy.versions?.flatMap((version) => version.configurations ?? []) ?? []) {
        const details = configuration.details;
        if (details?.type !== "WINDOWS_CUSTOM_CSP" || typeof details.name !== "string" || typeof details.installSyncML !== "string") {
          continue;
        }
        observedKeys.push(evidenceKey({
          name: details.name,
          sourceFile,
          policyName: policy.name,
          locUri: extractLocUri(details.installSyncML),
        }));
      }
    }
  }

  assert.deepEqual(observedKeys.sort(), expectedKeys);
  assert.equal(expectedKeys.some((key) => key.includes("PreventEnablingLockScreenCamera")), true);
});

test("offline vendor harvester reproduces committed vendor source artifacts", () => {
  const outputRoot = mkdtempSync(resolve(tmpdir(), "relution-vendor-harvest-"));

  execFileSync("python3", ["tools/harvest_vendor_guidance.py", "--offline", "--output-root", outputRoot], {
    cwd: resolve("."),
    stdio: "pipe",
  });

  for (const path of [
    "example/vendor-references/vendor-recommendations.json",
    "example/vendor-references/vendor-relution-baseline.json",
    "example/vendor-references/downloads/derived/windows-25h2-intune-baseline.json",
    "example/vendor-references/downloads/derived/windows-24h2-policy-rules.json",
    "example/vendor-references/downloads/derived/windows-24h2-workbook.json",
    "example/vendor-references/downloads/derived/windows-relution-csp-evidence.json",
  ]) {
    assert.deepEqual(readJson<unknown>(resolve(outputRoot, path)), readJson<unknown>(path), path);
  }
});

test("vendor ruleset is importable and preserves rule metadata", () => {
  const ruleset = readJson<ImportableRuleset>("example/vendor-references/vendor-relution-ruleset.json");

  assert.equal(ruleset.version, 1);
  assert.deepEqual([...new Set(ruleset.policies.map((policy) => policy.platform))].sort(), ["ANDROID_ENTERPRISE", "MACOS", "WINDOWS"]);
  assert.equal(ruleset.policies.every((policy) => policy.rules.length > 0), true);
  assert.equal(
    ruleset.policies.every((policy) =>
      policy.rules.every((rule) => typeof rule.reason === "string" && rule.reason.length > 0 && Array.isArray(rule.sourceIds) && rule.sourceIds.length > 0),
    ),
    true,
  );

  const result = importRulesetWorkspace(ruleset, loadTemplateBundle(), loadAppleSchemaCatalog());

  assert.equal(result.report.conflicts.length, 0);
  assert.equal(result.report.unresolved.length, 0);
  assert.notEqual(result.workspace, undefined);
  assert.equal((result.workspace?.policies.length ?? 0) >= 3, true);
});

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(path), "utf8")) as T;
}

function hasSemanticConcept(entry: VendorRecommendation | undefined, conceptId: string): boolean {
  return entry?.semanticConcepts?.some((concept) => concept.id === conceptId) ?? false;
}

function extractLocUri(syncMl: string): string {
  return /<LocURI>(.*?)<\/LocURI>/su.exec(syncMl)?.[1] ?? "";
}

function evidenceKey(entry: { sourceFile: string; policyName: string; name: string; locUri: string }): string {
  return `${entry.sourceFile}\u0000${entry.policyName}\u0000${entry.name}\u0000${entry.locUri}`;
}
