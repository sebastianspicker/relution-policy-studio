/** Loads derived recommendation coverage and semantic analysis artifacts. */
import { resolve } from "node:path";
import {
  COVERAGE_PATH,
  loadCachedRecommendationArtifact,
  SEMANTIC_INDEX_PATH,
  UNIFIED_ANALYSIS_PATH,
  type RecommendationRootOptions,
} from "./recommendation-artifacts.js";
import type {
  RecommendationCoverageMatrix,
  RecommendationSemanticIndex,
  RecommendationUnifiedAnalysis,
} from "./recommendation-types.js";
import { readJsonCatalog } from "../platform/serialization/json-catalog.js";
import { asRecord } from "../platform/serialization/json-guards.js";

export function loadRecommendationCoverage(options: RecommendationRootOptions = {}): RecommendationCoverageMatrix {
  return loadCachedRecommendationArtifact("coverage", options, (rootDir) =>
    readJsonCatalog<RecommendationCoverageMatrix>(resolve(rootDir, COVERAGE_PATH), "Recommendation coverage matrix", (value) => {
      const record = asRecord(value);
      return record !== undefined && Array.isArray(record.rows) && asRecord(record.summary) !== undefined;
    }));
}

export function loadRecommendationSemanticIndex(options: RecommendationRootOptions = {}): RecommendationSemanticIndex {
  return loadCachedRecommendationArtifact("semantic-index", options, (rootDir) =>
    readJsonCatalog<RecommendationSemanticIndex>(resolve(rootDir, SEMANTIC_INDEX_PATH), "Recommendation semantic index", (value) => {
      const record = asRecord(value);
      return record !== undefined
        && Array.isArray(record.concepts)
        && Array.isArray(record.relutionTargets)
        && Array.isArray(record.recommendations);
    }));
}

export function loadUnifiedRecommendationAnalysis(options: RecommendationRootOptions = {}): RecommendationUnifiedAnalysis {
  return loadCachedRecommendationArtifact("unified-analysis", options, (rootDir) =>
    readJsonCatalog<RecommendationUnifiedAnalysis>(resolve(rootDir, UNIFIED_ANALYSIS_PATH), "Unified recommendation analysis", (value) => {
      const record = asRecord(value);
      return record !== undefined
        && Array.isArray(record.commonGroups)
        && Array.isArray(record.contradictions)
        && Array.isArray(record.differences);
    }));
}
