/** Derives catalog coverage, platform mapping, and public source summaries. */
import type {
  RecommendationCatalogResponse,
  RecommendationImplementationCategory,
  RecommendationRecord,
  RecommendationRuleset,
  RecommendationSource,
  RecommendationSourceCoverageSummary,
  RecommendationSourceSummary,
} from "./recommendation-types.js";
import type { RecommendationSourceFiles } from "./recommendation-artifacts.js";
import { uniqueStrings } from "../platform/serialization/json-guards.js";

export function availableRecommendationCatalog(
  source: RecommendationSource,
  files: RecommendationSourceFiles,
  recommendations: RecommendationRecord[],
  ruleset: RecommendationRuleset,
): RecommendationCatalogResponse {
  const displayPlatforms = uniqueStrings(recommendations.map((entry) => entry.platform), { sort: true });
  const importPlatforms = uniqueStrings(ruleset.policies.map((policy) => policy.platform), { sort: true });
  return {
    source,
    label: files.label,
    available: true,
    recommendationCount: recommendations.length,
    coverageSummary: summarizeRecommendationCoverage(recommendations),
    displayPlatforms,
    importPlatforms,
    displayToImportPlatform: createDisplayToImportPlatform(source, displayPlatforms, importPlatforms),
    recommendations,
    ruleset,
    ...(ruleset.verifiedAsOf === undefined ? {} : { verifiedAsOf: ruleset.verifiedAsOf }),
  };
}

export function unavailableRecommendationCatalog(
  source: RecommendationSource,
  files: RecommendationSourceFiles,
): RecommendationCatalogResponse {
  return {
    source,
    label: files.label,
    available: false,
    recommendationCount: 0,
    coverageSummary: emptyCoverageSummary(),
    displayPlatforms: [],
    importPlatforms: [],
    displayToImportPlatform: {},
    error: `${files.label} is unavailable`,
    recommendations: [],
  };
}

export function recommendationCatalogSummary(catalog: RecommendationCatalogResponse): RecommendationSourceSummary {
  return {
    source: catalog.source,
    label: catalog.label,
    available: catalog.available,
    recommendationCount: catalog.recommendationCount,
    ...(catalog.coverageSummary === undefined ? {} : { coverageSummary: catalog.coverageSummary }),
    displayPlatforms: catalog.displayPlatforms,
    importPlatforms: catalog.importPlatforms,
    displayToImportPlatform: catalog.displayToImportPlatform,
    ...(catalog.verifiedAsOf === undefined ? {} : { verifiedAsOf: catalog.verifiedAsOf }),
    ...(catalog.error === undefined ? {} : { error: catalog.error }),
  };
}

function summarizeRecommendationCoverage(recommendations: RecommendationRecord[]): RecommendationSourceCoverageSummary {
  const counts: Record<RecommendationImplementationCategory, number> = {
    "relution-achievable": 0,
    "relution-partial": 0,
    "helper-only": 0,
    gap: 0,
  };
  let exactMappings = 0;
  for (const recommendation of recommendations) {
    if (recommendation.relutionMapping.status === "exact") exactMappings += 1;
    counts[recommendation.implementation?.category ?? "gap"] += 1;
  }
  return {
    exactMappings,
    actionableRecommendations: counts["relution-achievable"],
    partialRecommendations: counts["relution-partial"],
    helperOnlyRecommendations: counts["helper-only"],
    gapRecommendations: counts.gap,
  };
}

function emptyCoverageSummary(): RecommendationSourceCoverageSummary {
  return {
    exactMappings: 0,
    actionableRecommendations: 0,
    partialRecommendations: 0,
    helperOnlyRecommendations: 0,
    gapRecommendations: 0,
  };
}

function createDisplayToImportPlatform(
  source: RecommendationSource,
  displayPlatforms: string[],
  importPlatforms: string[],
): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const displayPlatform of displayPlatforms) {
    if (importPlatforms.includes(displayPlatform)) mapping[displayPlatform] = displayPlatform;
    else if (source === "vendor" && displayPlatform === "ANDROID" && importPlatforms.includes("ANDROID_ENTERPRISE")) {
      mapping[displayPlatform] = "ANDROID_ENTERPRISE";
    }
  }
  return mapping;
}
