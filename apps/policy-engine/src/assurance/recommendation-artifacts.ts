/** Defines recommendation artifact locations and default-root caching. */
import { fileURLToPath } from "node:url";
import type { RecommendationSource } from "./recommendation-types.js";

export interface RecommendationRootOptions {
  readonly rootDir?: string;
}

export interface RecommendationSourceFiles {
  readonly label: string;
  readonly recommendationsPath: string;
  readonly rulesetPath: string;
  readonly settingBundleCatalogPath: string;
}

const DEFAULT_RECOMMENDATION_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
export const COVERAGE_PATH = "example/recommendation-coverage/relution-achievability-matrix.json";
export const SEMANTIC_INDEX_PATH = "example/recommendation-coverage/relution-semantic-index.json";
export const UNIFIED_ANALYSIS_PATH = "example/recommendation-coverage/unified-recommendation-analysis.json";

export const RECOMMENDATION_SOURCE_FILES: Record<RecommendationSource, RecommendationSourceFiles> = {
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

const artifactCache = new Map<string, unknown>();

export function loadCachedRecommendationArtifact<T>(
  cacheKey: string,
  options: RecommendationRootOptions,
  load: (rootDir: string) => T,
): T {
  const rootDir = options.rootDir ?? DEFAULT_RECOMMENDATION_ROOT;
  if (rootDir === DEFAULT_RECOMMENDATION_ROOT && artifactCache.has(cacheKey)) {
    return artifactCache.get(cacheKey) as T;
  }
  const artifact = load(rootDir);
  if (rootDir === DEFAULT_RECOMMENDATION_ROOT) artifactCache.set(cacheKey, artifact);
  return artifact;
}
