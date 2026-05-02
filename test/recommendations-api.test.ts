import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startEditorServer } from "../src/editor-server.js";
import { loadRecommendationCatalog } from "../src/recommendations.js";
import { loadTemplateBundle } from "../src/templates.js";
import { createNewWorkspace } from "../src/workspace.js";

test("recommendation catalog marks missing corpora unavailable instead of throwing", () => {
  const root = mkdtempSync(join(tmpdir(), "relution-recommendations-missing-"));

  const catalog = loadRecommendationCatalog("bsi", { rootDir: root });

  assert.equal(catalog.source, "bsi");
  assert.equal(catalog.available, false);
  assert.deepEqual(catalog.recommendations, []);
  assert.equal(catalog.recommendationCount, 0);
  assert.match(catalog.error ?? "", /not found/u);
});

test("editor recommendation APIs expose source summaries and vendor Android import mapping", async () => {
  const root = mkdtempSync(join(tmpdir(), "relution-recommendations-api-"));
  const workspace = join(root, "workspace");
  const out = join(root, "output.rexp");
  const bundle = loadTemplateBundle();
  createNewWorkspace({
    workspace,
    platform: "IOS",
    name: "Recommendation API",
    serverVersion: bundle.serverVersion,
  });

  const handle = await startEditorServer({
    workspace,
    key: "",
    out,
    host: "127.0.0.1",
    port: 0,
  });

  try {
    const summaryResponse = await fetch(new URL("api/recommendations", handle.url));
    assert.equal(summaryResponse.status, 200);
    const summary = await summaryResponse.json() as {
      sources: Array<{
        source: string;
        available: boolean;
        recommendationCount: number;
        coverageSummary: {
          exactMappings: number;
          actionableRecommendations: number;
          partialRecommendations: number;
          helperOnlyRecommendations: number;
          gapRecommendations: number;
        };
      }>;
    };
    assert.deepEqual(summary.sources.map((entry) => entry.source).sort(), ["bsi", "cis", "vendor"]);
    assert.equal(summary.sources.every((entry) => entry.available), true);
    assert.equal(summary.sources.every((entry) => entry.recommendationCount > 0), true);
    assert.equal(summary.sources.every((entry) => entry.coverageSummary.exactMappings >= 0), true);
    assert.equal(summary.sources.some((entry) => entry.coverageSummary.partialRecommendations > 0), true);

    const vendorResponse = await fetch(new URL("api/recommendations/vendor", handle.url));
    assert.equal(vendorResponse.status, 200);
    const vendor = await vendorResponse.json() as {
      source: string;
      available: boolean;
      displayPlatforms: string[];
      importPlatforms: string[];
      displayToImportPlatform: Record<string, string>;
      recommendations: Array<{ id: string }>;
      ruleset?: { policies: Array<{ platform: string }> };
    };
    assert.equal(vendor.source, "vendor");
    assert.equal(vendor.available, true);
    assert.deepEqual(vendor.displayPlatforms, ["ANDROID", "MACOS", "WINDOWS"]);
    assert.equal(vendor.importPlatforms.includes("ANDROID_ENTERPRISE"), true);
    assert.equal(vendor.displayToImportPlatform.ANDROID, "ANDROID_ENTERPRISE");
    assert.equal(vendor.recommendations.length > 0, true);
    assert.equal((vendor.ruleset?.policies.length ?? 0) > 0, true);

    const cisResponse = await fetch(new URL("api/recommendations/cis", handle.url));
    assert.equal(cisResponse.status, 200);
    const cis = await cisResponse.json() as {
      source: string;
      recommendations: Array<{
        platform: string;
        fallbackTranslations?: Array<{ method: string; commands: string[] }>;
        implementation?: { category: string; surfaces: string[] };
      }>;
    };
    assert.equal(cis.source, "cis");
    assert.equal(
      cis.recommendations.some(
        (entry) =>
          entry.platform === "MACOS"
          && entry.fallbackTranslations?.some((fallback) => fallback.method === "profile-method") === true,
      ),
      true,
    );
    assert.equal(
      cis.recommendations.some(
        (entry) =>
          entry.platform === "WINDOWS"
          && entry.fallbackTranslations?.some((fallback) => fallback.method === "powershell" && fallback.commands.length > 0) === true,
      ),
      true,
    );
    assert.equal(
      cis.recommendations.some(
        (entry) =>
          entry.platform === "MACOS"
          && entry.implementation?.category === "relution-achievable"
          && entry.implementation.surfaces.includes("apple-schema-profile"),
      ),
      true,
    );

    const coverageResponse = await fetch(new URL("api/recommendations/coverage", handle.url));
    assert.equal(coverageResponse.status, 200);
    const coverage = await coverageResponse.json() as {
      summary: {
        totalRecommendations: number;
        bySource: Record<string, number>;
        byCategory: Record<string, number>;
      };
      rows: Array<{ source: string; recommendationId: string; category: string; surfaces: string[]; targetTypes: string[]; candidateTargetTypes: string[] }>;
    };
    assert.equal(coverage.summary.totalRecommendations > 0, true);
    assert.deepEqual(Object.keys(coverage.summary.bySource).sort(), ["bsi", "cis", "vendor"]);
    assert.equal((coverage.summary.byCategory["relution-achievable"] ?? 0) > 0, true);
    assert.equal(
      coverage.rows.some(
        (row) =>
          row.source === "cis"
          && row.recommendationId === "cis-apple-macos-15-sequoia-2-0-0-1-2"
          && row.category === "relution-achievable"
          && row.surfaces.includes("apple-schema-profile"),
      ),
      true,
    );
    const vendorOtaCoverage = coverage.rows.find((row) => row.source === "vendor" && row.recommendationId === "android-008-offerautomaticotasystemupdates");
    assert.deepEqual(vendorOtaCoverage?.targetTypes, ["ANDROID_ENTERPRISE_SYSTEM_UPDATE"]);
    assert.equal(vendorOtaCoverage?.candidateTargetTypes.includes("ANDROID_SCHEDULED_OTA_UPDATE"), true);
    assert.equal(vendorOtaCoverage?.candidateTargetTypes.some((target) => target.startsWith("ANDROID_IFP")), false);

    const semanticsResponse = await fetch(new URL("api/recommendations/semantics", handle.url));
    assert.equal(semanticsResponse.status, 200);
    const semantics = await semanticsResponse.json() as {
      summary: { totalConcepts: number; bySource: Record<string, number> };
      relutionTargets: Array<{ target: string; conceptIds: string[]; exactRecommendationIds: string[] }>;
      recommendations: Array<{ source: string; recommendationId: string; semanticConceptIds: string[] }>;
    };
    assert.equal(semantics.summary.totalConcepts > 0, true);
    assert.deepEqual(Object.keys(semantics.summary.bySource).sort(), ["bsi", "cis", "vendor"]);
    assert.equal(
      semantics.relutionTargets.some(
        (target) =>
          target.target === "WINDOWS_ANTIVIRUS"
          && target.conceptIds.includes("malware_protection")
          && target.exactRecommendationIds.some((id) => id.startsWith("vendor:")),
      ),
      true,
    );
    assert.equal(
      semantics.recommendations.some(
        (entry) =>
          entry.source === "vendor"
          && entry.recommendationId === "android-001-enforcegoogleplayprotectonmanageddevices"
          && entry.semanticConceptIds.includes("malware_protection"),
      ),
      true,
    );

    const semanticAnalysisResponse = await fetch(new URL("api/recommendations/semantic-analysis", handle.url));
    assert.equal(semanticAnalysisResponse.status, 200);
    const semanticAnalysis = await semanticAnalysisResponse.json() as {
      precedence: { authoritativeSource: string; behavior: string };
      summary: { totalCommonGroups: number; hardContradictions: number; sourceRecommendationCounts: Record<string, number> };
      commonGroups: Array<{ platform: string; conceptId: string; sources: string[]; authoritativeSource: string | null }>;
      contradictions: Array<{ severity: string }>;
    };
    assert.equal(semanticAnalysis.precedence.authoritativeSource, "bsi");
    assert.equal(semanticAnalysis.precedence.behavior, "rank-and-annotate");
    assert.equal(semanticAnalysis.summary.totalCommonGroups > 0, true);
    assert.deepEqual(Object.keys(semanticAnalysis.summary.sourceRecommendationCounts).sort(), ["bsi", "cis", "vendor"]);
    assert.equal(
      semanticAnalysis.commonGroups.some(
        (group) =>
          group.platform === "IOS"
          && group.conceptId === "passcode_authentication"
          && group.sources.includes("bsi")
          && group.sources.includes("cis"),
      ),
      true,
    );
    assert.equal(semanticAnalysis.contradictions.every((entry) => entry.severity === "error"), true);

    const missingResponse = await fetch(new URL("api/recommendations/not-a-source", handle.url));
    assert.equal(missingResponse.status, 404);
    assert.match(await missingResponse.text(), /unknown recommendation source/iu);
  } finally {
    await handle.close();
  }
});
