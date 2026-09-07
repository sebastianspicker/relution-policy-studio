import type { RecommendationBrowseRow } from "../../../../src/browser/assurance.js";
import type { EditorController } from "../../shared/editor-contracts.js";
import { ALL_RECOMMENDATION_PLATFORMS, RECOMMENDATION_SCOPE_ACTIONABLE, RECOMMENDATION_SCOPE_ALL } from "./recommendation-constants.js";
import { implementationOf } from "./recommendation-implementation.js";
import type { CoverageSummary, RecommendationScope } from "./recommendation-view-contract.js";

export function canImportRuleset(catalog: EditorController["recommendationCatalog"], platform: string): boolean {
  if (catalog === undefined) return false;
  if (platform === ALL_RECOMMENDATION_PLATFORMS) return catalog.actionableImportPlatforms.length > 0;
  const importPlatform = catalog.displayToImportPlatform[platform];
  return importPlatform !== undefined && catalog.actionableImportPlatforms.includes(importPlatform);
}

export function scopeLabel(scope: RecommendationScope): string {
  return scope === RECOMMENDATION_SCOPE_ACTIONABLE ? "actionable settings" : scope === RECOMMENDATION_SCOPE_ALL ? "all recommendations" : "recommendations without settings";
}

export function summarizeCoverage(recommendations: readonly RecommendationBrowseRow[]): CoverageSummary {
  return recommendations.reduce<CoverageSummary>((counts, recommendation) => addCoverageCount(counts, recommendation), emptyCoverageSummary());
}

function addCoverageCount(counts: CoverageSummary, recommendation: RecommendationBrowseRow): CoverageSummary {
  const category = implementationOf(recommendation).category;
  return {
    exactMappings: counts.exactMappings + Number(recommendation.relutionMapping.status === "exact"),
    actionableRecommendations: counts.actionableRecommendations + Number(category === "relution-achievable"),
    partialRecommendations: counts.partialRecommendations + Number(category === "relution-partial"),
    helperOnlyRecommendations: counts.helperOnlyRecommendations + Number(category === "helper-only"),
    gapRecommendations: counts.gapRecommendations + Number(category === "gap"),
  };
}

function emptyCoverageSummary(): CoverageSummary {
  return { exactMappings: 0, actionableRecommendations: 0, partialRecommendations: 0, helperOnlyRecommendations: 0, gapRecommendations: 0 };
}
