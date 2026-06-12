import assert from "node:assert/strict";
import test from "node:test";
import { appliesToPolicy } from "../src/compliance-internals.js";
import type { RecommendationCatalogResponse } from "../src/recommendation-types.js";

test("appliesToPolicy uses the catalog platform map for vendor Android recommendations", () => {
  const catalog: RecommendationCatalogResponse = {
    source: "vendor",
    label: "VENDOR",
    available: true,
    verifiedAsOf: "2026-04-24",
    recommendationCount: 0,
    displayPlatforms: ["ANDROID"],
    importPlatforms: ["ANDROID_ENTERPRISE"],
    displayToImportPlatform: { ANDROID: "ANDROID_ENTERPRISE" },
    recommendations: [],
  };

  assert.equal(appliesToPolicy("vendor", catalog, "ANDROID", "ANDROID_ENTERPRISE"), true);
});
