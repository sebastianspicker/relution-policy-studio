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
import { readJsonCatalog } from "./utils/json-catalog.js";
import { asRecord, uniqueStrings } from "./utils/json-guards.js";

interface RecommendationSourceFiles {
  label: string;
  recommendationsPath: string;
  rulesetPath: string;
  settingBundleCatalogPath: string;
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

const catalogCache: Partial<Record<RecommendationSource, RecommendationCatalogResponse>> = {};
const settingsCatalogCache: Partial<Record<RecommendationSource, RecommendationSettingBundleCatalog>> = {};
let coverageCache: RecommendationCoverageMatrix | undefined;
let semanticIndexCache: RecommendationSemanticIndex | undefined;
let unifiedAnalysisCache: RecommendationUnifiedAnalysis | undefined;

export function isRecommendationSource(value: string): value is RecommendationSource {
  return RECOMMENDATION_SOURCES.includes(value as RecommendationSource);
}

export function listRecommendationCatalogs(options: { rootDir?: string } = {}): RecommendationIndexResponse {
  return {
    sources: RECOMMENDATION_SOURCES.map((source) => toSummary(loadRecommendationCatalog(source, options))),
  };
}

export function loadRecommendationCatalog(source: RecommendationSource, options: { rootDir?: string } = {}): RecommendationCatalogResponse {
  const rootDir = options.rootDir ?? DEFAULT_RECOMMENDATION_ROOT;
  const useCache = rootDir === DEFAULT_RECOMMENDATION_ROOT;
  const cached = catalogCache[source];
  if (useCache && cached !== undefined) {
    return cached;
  }

  const files = SOURCE_FILES[source];
  try {
    const recommendations = readRecommendations(resolve(rootDir, files.recommendationsPath));
    const ruleset = readRuleset(resolve(rootDir, files.rulesetPath));
    const displayPlatforms = uniqueStrings(recommendations.map((entry) => entry.platform), { sort: true });
    const importPlatforms = uniqueStrings(ruleset.policies.map((policy) => policy.platform), { sort: true });
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
    if (useCache) {
      catalogCache[source] = catalog;
    }
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
    if (useCache) {
      catalogCache[source] = unavailable;
    }
    return unavailable;
  }
}

export function loadRecommendationCoverage(options: { rootDir?: string } = {}): RecommendationCoverageMatrix {
  const rootDir = options.rootDir ?? DEFAULT_RECOMMENDATION_ROOT;
  if (rootDir === DEFAULT_RECOMMENDATION_ROOT && coverageCache !== undefined) {
    return coverageCache;
  }
  const path = resolve(rootDir, COVERAGE_PATH);
  const coverage = readJsonCatalog<RecommendationCoverageMatrix>(path, "Recommendation coverage matrix", (value) => {
    const record = asRecord(value);
    return record !== undefined && Array.isArray(record.rows) && asRecord(record.summary) !== undefined;
  });
  if (rootDir === DEFAULT_RECOMMENDATION_ROOT) {
    coverageCache = coverage;
  }
  return coverage;
}

export function loadRecommendationSemanticIndex(options: { rootDir?: string } = {}): RecommendationSemanticIndex {
  const rootDir = options.rootDir ?? DEFAULT_RECOMMENDATION_ROOT;
  if (rootDir === DEFAULT_RECOMMENDATION_ROOT && semanticIndexCache !== undefined) {
    return semanticIndexCache;
  }
  const path = resolve(rootDir, SEMANTIC_INDEX_PATH);
  const semanticIndex = readJsonCatalog<RecommendationSemanticIndex>(path, "Recommendation semantic index", (value) => {
    const record = asRecord(value);
    return (
      record !== undefined &&
      Array.isArray(record.concepts) &&
      Array.isArray(record.relutionTargets) &&
      Array.isArray(record.recommendations)
    );
  });
  if (rootDir === DEFAULT_RECOMMENDATION_ROOT) {
    semanticIndexCache = semanticIndex;
  }
  return semanticIndex;
}

export function loadUnifiedRecommendationAnalysis(options: { rootDir?: string } = {}): RecommendationUnifiedAnalysis {
  const rootDir = options.rootDir ?? DEFAULT_RECOMMENDATION_ROOT;
  if (rootDir === DEFAULT_RECOMMENDATION_ROOT && unifiedAnalysisCache !== undefined) {
    return unifiedAnalysisCache;
  }
  const path = resolve(rootDir, UNIFIED_ANALYSIS_PATH);
  const unifiedAnalysis = readJsonCatalog<RecommendationUnifiedAnalysis>(path, "Unified recommendation analysis", (value) => {
    const record = asRecord(value);
    return (
      record !== undefined &&
      Array.isArray(record.commonGroups) &&
      Array.isArray(record.contradictions) &&
      Array.isArray(record.differences)
    );
  });
  if (rootDir === DEFAULT_RECOMMENDATION_ROOT) {
    unifiedAnalysisCache = unifiedAnalysis;
  }
  return unifiedAnalysis;
}

export function loadRecommendationSettingBundleCatalog(
  source: RecommendationSource,
  options: { rootDir?: string } = {},
): RecommendationSettingBundleCatalog {
  const rootDir = options.rootDir ?? DEFAULT_RECOMMENDATION_ROOT;
  const useCache = rootDir === DEFAULT_RECOMMENDATION_ROOT;
  const cached = settingsCatalogCache[source];
  if (useCache && cached !== undefined) {
    return cached;
  }
  const path = resolve(rootDir, SOURCE_FILES[source].settingBundleCatalogPath);
  const catalog = readJsonCatalog<RecommendationSettingBundleCatalog>(path, "Recommendation setting bundle catalog", (value) => {
    const record = asRecord(value);
    return (
      record !== undefined &&
      Array.isArray(record.bundles) &&
      Array.isArray(record.variantGroups) &&
      Array.isArray(record.nonImportableRecommendations)
    );
  });
  if (useCache) {
    settingsCatalogCache[source] = catalog;
  }
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
  return readJsonCatalog<RecommendationRecord[]>(path, "Recommendation catalog", Array.isArray);
}

function readRuleset(path: string): RecommendationRuleset {
  return readJsonCatalog<RecommendationRuleset>(path, "Recommendation ruleset", (value) => {
    const record = asRecord(value);
    return record !== undefined && Array.isArray(record.policies);
  });
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
