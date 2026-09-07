/** Loads pre-built native setting bundles for a recommendation source. */
import { resolve } from "node:path";
import {
  loadCachedRecommendationArtifact,
  RECOMMENDATION_SOURCE_FILES,
  type RecommendationRootOptions,
} from "./recommendation-artifacts.js";
import type {
  RecommendationSettingBundleCatalog,
  RecommendationSource,
} from "./recommendation-types.js";
import { readJsonCatalog } from "../platform/serialization/json-catalog.js";
import { asRecord } from "../platform/serialization/json-guards.js";

export function loadRecommendationSettingBundleCatalog(
  source: RecommendationSource,
  options: RecommendationRootOptions = {},
): RecommendationSettingBundleCatalog {
  return loadCachedRecommendationArtifact(`settings:${source}`, options, (rootDir) => {
    const path = resolve(rootDir, RECOMMENDATION_SOURCE_FILES[source].settingBundleCatalogPath);
    return readJsonCatalog<RecommendationSettingBundleCatalog>(path, "Recommendation setting bundle catalog", (value) => {
      const record = asRecord(value);
      return record !== undefined
        && Array.isArray(record.bundles)
        && Array.isArray(record.variantGroups)
        && Array.isArray(record.nonImportableRecommendations);
    });
  });
}
