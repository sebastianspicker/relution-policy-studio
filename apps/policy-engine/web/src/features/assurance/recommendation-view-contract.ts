import type { RecommendationBrowseRow, RecommendationSourceSummary } from "../../../../src/browser/assurance.js";

export type RecommendationScope = "actionable-settings" | "recommendations-without-settings" | "all-recommendations";

export interface CoverageSummary {
  readonly exactMappings: number;
  readonly actionableRecommendations: number;
  readonly partialRecommendations: number;
  readonly helperOnlyRecommendations: number;
  readonly gapRecommendations: number;
}

export interface RecommendationViewState {
  readonly availableCategories: readonly string[];
  readonly availableSurfaces: readonly string[];
  readonly effectiveRecommendationScope: RecommendationScope;
  readonly filteredCoverage: CoverageSummary;
  readonly filteredRecommendations: RecommendationBrowseRow[];
  readonly scopedRecommendations: RecommendationBrowseRow[];
  readonly selectedRecommendation: RecommendationBrowseRow | undefined;
  readonly sourceCoverage: CoverageSummary;
  readonly sources: readonly RecommendationSourceSummary[];
  readonly summary: RecommendationSourceSummary | undefined;
}
