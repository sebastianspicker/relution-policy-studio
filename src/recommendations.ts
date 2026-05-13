import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  RECOMMENDATION_SOURCES,
  type RecommendationCatalogResponse,
  type RecommendationCoverageMatrix,
  type RecommendationIndexResponse,
  type RecommendationImplementationCategory,
  type RecommendationRecord,
  type RecommendationRuleset,
  type RecommendationSemanticIndex,
  type RecommendationSettingBundleCatalog,
  type RecommendationSource,
  type RecommendationSourceCoverageSummary,
  type RecommendationSourceSummary,
  type RecommendationUnifiedAnalysis,
} from "./recommendation-types.js";

interface RecommendationSourceFiles {
  label: string;
  recommendationsPath: string;
  rulesetPath: string;
  settingBundleCatalogPath: string;
}

export interface RecommendationCatalogOptions {
  rootDir?: string;
}

const DEFAULT_RECOMMENDATION_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const COVERAGE_PATH = "example/recommendation-coverage/relution-achievability-matrix.json";
const SEMANTIC_INDEX_PATH = "example/recommendation-coverage/relution-semantic-index.json";
const UNIFIED_ANALYSIS_PATH = "example/recommendation-coverage/unified-recommendation-analysis.json";

// Each source has three related artifacts: human/control recommendations,
// importable ruleset mappings, and optional pre-built native setting bundles.
// The UI can still load when one source is unavailable; callers receive an
// unavailable catalog instead of a thrown read error.
const SOURCE_FILES: Record<RecommendationSource, RecommendationSourceFiles> = {
  bsi: {
    label: "BSI",
    recommendationsPath: "example/bsi-references/bsi-recommendations.json",
    rulesetPath: "example/bsi-references/bsi-relution-ruleset.json",
    settingBundleCatalogPath: "example/bsi-references/bsi-relution-settings-catalog.json",
  },
  vendor: {
    label: "Vendor",
    recommendationsPath: "example/vendor-references/vendor-recommendations.json",
    rulesetPath: "example/vendor-references/vendor-relution-ruleset.json",
    settingBundleCatalogPath: "example/vendor-references/vendor-relution-settings-catalog.json",
  },
  cis: {
    label: "CIS",
    recommendationsPath: "example/cis-references/cis-recommendations.json",
    rulesetPath: "example/cis-references/cis-relution-ruleset.json",
    settingBundleCatalogPath: "example/cis-references/cis-relution-settings-catalog.json",
  },
};

const catalogCache = new Map<string, RecommendationCatalogResponse>();
const coverageCache = new Map<string, RecommendationCoverageMatrix>();
const semanticIndexCache = new Map<string, RecommendationSemanticIndex>();
const unifiedAnalysisCache = new Map<string, RecommendationUnifiedAnalysis>();
const settingsCatalogCache = new Map<string, RecommendationSettingBundleCatalog>();

export function isRecommendationSource(value: string): value is RecommendationSource {
  return RECOMMENDATION_SOURCES.includes(value as RecommendationSource);
}

export function listRecommendationCatalogs(options: RecommendationCatalogOptions = {}): RecommendationIndexResponse {
  return {
    sources: RECOMMENDATION_SOURCES.map((source) => toSummary(loadRecommendationCatalog(source, options))),
  };
}

export function loadRecommendationCatalog(source: RecommendationSource, options: RecommendationCatalogOptions = {}): RecommendationCatalogResponse {
  const rootDir = options.rootDir ?? DEFAULT_RECOMMENDATION_ROOT;
  const cacheKey = `${rootDir}:${source}`;
  const cached = catalogCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const files = SOURCE_FILES[source];
  try {
    const recommendations = readRecommendations(resolve(rootDir, files.recommendationsPath));
    const ruleset = readRuleset(resolve(rootDir, files.rulesetPath));
    const displayPlatforms = uniqueStrings(recommendations.map((entry) => entry.platform));
    const importPlatforms = uniqueStrings(ruleset.policies.map((policy) => policy.platform));
    const catalog: RecommendationCatalogResponse = {
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
    catalogCache.set(cacheKey, catalog);
    return catalog;
  } catch (error) {
    const unavailable: RecommendationCatalogResponse = {
      source,
      label: files.label,
      available: false,
      recommendationCount: 0,
      coverageSummary: emptyCoverageSummary(),
      displayPlatforms: [],
      importPlatforms: [],
      displayToImportPlatform: {},
      error: error instanceof Error ? error.message : String(error),
      recommendations: [],
    };
    catalogCache.set(cacheKey, unavailable);
    return unavailable;
  }
}

export function loadRecommendationCoverage(options: RecommendationCatalogOptions = {}): RecommendationCoverageMatrix {
  const rootDir = options.rootDir ?? DEFAULT_RECOMMENDATION_ROOT;
  const path = resolve(rootDir, COVERAGE_PATH);
  return loadJsonCatalog(coverageCache, rootDir, path, "Recommendation coverage matrix", (record) =>
    Array.isArray(record.rows) && asRecord(record.summary) !== undefined,
  );
}

export function loadRecommendationSemanticIndex(options: RecommendationCatalogOptions = {}): RecommendationSemanticIndex {
  const rootDir = options.rootDir ?? DEFAULT_RECOMMENDATION_ROOT;
  const path = resolve(rootDir, SEMANTIC_INDEX_PATH);
  return loadJsonCatalog(semanticIndexCache, rootDir, path, "Recommendation semantic index", (record) =>
    Array.isArray(record.concepts) && Array.isArray(record.relutionTargets) && Array.isArray(record.recommendations),
  );
}

export function loadUnifiedRecommendationAnalysis(options: RecommendationCatalogOptions = {}): RecommendationUnifiedAnalysis {
  const rootDir = options.rootDir ?? DEFAULT_RECOMMENDATION_ROOT;
  const path = resolve(rootDir, UNIFIED_ANALYSIS_PATH);
  return loadJsonCatalog(unifiedAnalysisCache, rootDir, path, "Unified recommendation analysis", (record) =>
    Array.isArray(record.commonGroups) && Array.isArray(record.contradictions) && Array.isArray(record.differences),
  );
}

export function loadRecommendationSettingBundleCatalog(
  source: RecommendationSource,
  options: RecommendationCatalogOptions = {},
): RecommendationSettingBundleCatalog {
  const rootDir = options.rootDir ?? DEFAULT_RECOMMENDATION_ROOT;
  const cacheKey = `${rootDir}:${source}`;
  const path = resolve(rootDir, SOURCE_FILES[source].settingBundleCatalogPath);
  return loadJsonCatalog(settingsCatalogCache, cacheKey, path, "Recommendation setting bundle catalog", (record) =>
    Array.isArray(record.bundles) && Array.isArray(record.variantGroups) && Array.isArray(record.nonImportableRecommendations),
  );
}

function loadJsonCatalog<T>(
  cache: Map<string, T>,
  cacheKey: string,
  path: string,
  label: string,
  isValid: (record: Record<string, unknown>) => boolean,
): T {
  const cached = cache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  if (!existsSync(path)) {
    throw new Error(`${label} not found: ${path}`);
  }
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  const record = asRecord(parsed);
  if (record === undefined || !isValid(record)) {
    throw new Error(`Invalid ${label.charAt(0).toLowerCase()}${label.slice(1)}: ${path}`);
  }
  const catalog = parsed as T;
  cache.set(cacheKey, catalog);
  return catalog;
}

function toSummary(catalog: RecommendationCatalogResponse): RecommendationSourceSummary {
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
    if (recommendation.relutionMapping.status === "exact") {
      exactMappings += 1;
    }
    const category = recommendation.implementation?.category ?? "gap";
    counts[category] += 1;
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

function readRecommendations(path: string): RecommendationRecord[] {
  if (!existsSync(path)) {
    throw new Error(`Recommendation catalog not found: ${path}`);
  }
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`Invalid recommendation catalog: ${path}`);
  }
  return parsed as RecommendationRecord[];
}

function readRuleset(path: string): RecommendationRuleset {
  if (!existsSync(path)) {
    throw new Error(`Recommendation ruleset not found: ${path}`);
  }
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  const record = asRecord(parsed);
  if (record === undefined || !Array.isArray(record.policies)) {
    throw new Error(`Invalid recommendation ruleset: ${path}`);
  }
  return parsed as RecommendationRuleset;
}

function createDisplayToImportPlatform(
  source: RecommendationSource,
  displayPlatforms: string[],
  importPlatforms: string[],
): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const displayPlatform of displayPlatforms) {
    if (importPlatforms.includes(displayPlatform)) {
      mapping[displayPlatform] = displayPlatform;
      continue;
    }
    if (source === "vendor" && displayPlatform === "ANDROID" && importPlatforms.includes("ANDROID_ENTERPRISE")) {
      mapping[displayPlatform] = "ANDROID_ENTERPRISE";
    }
  }
  return mapping;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))].sort();
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
