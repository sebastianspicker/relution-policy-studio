/** Loads compliance source artifacts and reports degraded-source status. */
import type { RecommendationSource } from "./recommendation-types.js";
import { loadRecommendationCatalog } from "./recommendation-catalog-loader.js";
import { loadRecommendationSettingBundleCatalog } from "./recommendation-settings-loader.js";
import type { ComplianceSourceCatalogs, ComplianceSourceStatus } from "./compliance-types.js";

export function loadComplianceArtifacts(
  sources: RecommendationSource[],
): Partial<Record<RecommendationSource, ComplianceSourceCatalogs>> {
  const artifacts: Partial<Record<RecommendationSource, ComplianceSourceCatalogs>> = {};
  for (const source of sources) {
    const recommendationCatalog = loadRecommendationCatalog(source);
    if (!recommendationCatalog.available) {
      artifacts[source] = { recommendationCatalog };
      continue;
    }
    try {
      const settingBundleCatalog = loadRecommendationSettingBundleCatalog(source);
      artifacts[source] = settingBundleCatalog === undefined
        ? { recommendationCatalog }
        : { recommendationCatalog, settingBundleCatalog };
    } catch (error) {
      artifacts[source] = {
        recommendationCatalog,
        settingBundleCatalogError: error instanceof Error ? error.message : String(error),
      };
    }
  }
  return artifacts;
}

export function sourceStatus(
  source: RecommendationSource,
  artifacts: ComplianceSourceCatalogs | undefined,
): ComplianceSourceStatus {
  if (artifacts === undefined) {
    return unavailableStatus(source, `${source} compliance artifacts were not loaded.`);
  }
  if (!artifacts.recommendationCatalog.available) {
    return unavailableStatus(
      source,
      `${source} recommendation catalog unavailable: ${artifacts.recommendationCatalog.error ?? "unknown error"}`,
    );
  }
  if (artifacts.settingBundleCatalog === undefined) {
    return {
      source,
      recommendationCatalog: "loaded",
      settingBundleCatalog: "degraded",
      warnings: [`${source} setting-bundle catalog unavailable: ${artifacts.settingBundleCatalogError ?? "unknown error"}`],
    };
  }
  return { source, recommendationCatalog: "loaded", settingBundleCatalog: "loaded", warnings: [] };
}

function unavailableStatus(source: RecommendationSource, warning: string): ComplianceSourceStatus {
  return {
    source,
    recommendationCatalog: "unavailable",
    settingBundleCatalog: "unavailable",
    warnings: [warning],
  };
}
