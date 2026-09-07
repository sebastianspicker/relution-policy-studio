import { uniqueStrings } from "../../../../src/browser/json.js";
import type { EditorController } from "../../shared/editor-contracts.js";
import { effectiveScope, matchesScope } from "./recommendation-filtering.js";
import { matchesFilters } from "./recommendation-search.js";
import { implementationOf } from "./recommendation-implementation.js";
import { summarizeCoverage } from "./recommendation-view-metadata.js";

export type { CoverageSummary, RecommendationScope, RecommendationViewState } from "./recommendation-view-contract.js";
import type { RecommendationScope, RecommendationViewState } from "./recommendation-view-contract.js";

export function recommendationViewState(
  controller: EditorController,
  recommendationScope: RecommendationScope,
  achievabilityFilter: string,
  surfaceFilter: string,
): RecommendationViewState {
  const catalogRecommendations = controller.recommendationCatalog?.recommendations ?? [];
  const effectiveRecommendationScope = effectiveScope(catalogRecommendations, recommendationScope);
  const scopedRecommendations = catalogRecommendations.filter((recommendation) => matchesScope(recommendation, effectiveRecommendationScope));
  const filteredRecommendations = scopedRecommendations.filter((recommendation) => matchesFilters(controller.recommendationSource, recommendation, controller.recommendationPlatform, controller.recommendationQuery, achievabilityFilter, surfaceFilter));
  const summary = controller.recommendationIndex?.sources.find((candidate) => candidate.source === controller.recommendationSource);
  return {
    availableCategories: [...new Set(catalogRecommendations.map((recommendation) => implementationOf(recommendation).category))].sort(),
    availableSurfaces: uniqueStrings(catalogRecommendations.flatMap((recommendation) => implementationOf(recommendation).surfaces), { sort: true }),
    effectiveRecommendationScope, filteredCoverage: summarizeCoverage(filteredRecommendations), filteredRecommendations, scopedRecommendations,
    selectedRecommendation: filteredRecommendations.find((recommendation) => recommendation.id === controller.selectedRecommendationId),
    sourceCoverage: summary?.coverageSummary ?? summarizeCoverage(catalogRecommendations), sources: controller.recommendationIndex?.sources ?? [], summary,
  };
}
