/** Loads per-source recommendation catalogs and their public index. */
import { resolve } from "node:path";
import {
  RECOMMENDATION_SOURCES,
  type RecommendationCatalogResponse,
  type RecommendationIndexResponse,
  type RecommendationRecord,
  type RecommendationRuleset,
  type RecommendationSource,
} from "./recommendation-types.js";
import {
  loadCachedRecommendationArtifact,
  RECOMMENDATION_SOURCE_FILES,
  type RecommendationRootOptions,
} from "./recommendation-artifacts.js";
import {
  availableRecommendationCatalog,
  recommendationCatalogSummary,
  unavailableRecommendationCatalog,
} from "./recommendation-catalog-summary.js";
import { readJsonCatalog } from "../platform/serialization/json-catalog.js";
import { asRecord } from "../platform/serialization/json-guards.js";

export function isRecommendationSource(value: string): value is RecommendationSource {
  return RECOMMENDATION_SOURCES.includes(value as RecommendationSource);
}

export function listRecommendationCatalogs(options: RecommendationRootOptions = {}): RecommendationIndexResponse {
  return { sources: RECOMMENDATION_SOURCES.map((source) => recommendationCatalogSummary(loadRecommendationCatalog(source, options))) };
}

export function loadRecommendationCatalog(source: RecommendationSource, options: RecommendationRootOptions = {}): RecommendationCatalogResponse {
  return loadCachedRecommendationArtifact(`catalog:${source}`, options, (rootDir) => loadSourceCatalog(source, rootDir));
}

function loadSourceCatalog(source: RecommendationSource, rootDir: string): RecommendationCatalogResponse {
  const files = RECOMMENDATION_SOURCE_FILES[source];
  try {
    const recommendations = readRecommendations(resolve(rootDir, files.recommendationsPath));
    const ruleset = readRuleset(resolve(rootDir, files.rulesetPath));
    return availableRecommendationCatalog(source, files, recommendations, ruleset);
  } catch (error) {
    console.error(`[recommendation catalog] ${source} unavailable`, error);
    return unavailableRecommendationCatalog(source, files);
  }
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
