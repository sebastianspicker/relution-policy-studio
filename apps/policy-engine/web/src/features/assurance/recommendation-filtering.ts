import type { RecommendationBrowseRow } from "../../../../src/browser/assurance.js";
import { RECOMMENDATION_SCOPE_ACTIONABLE, RECOMMENDATION_SCOPE_ALL } from "./recommendation-constants.js";
import { implementationOf } from "./recommendation-implementation.js";
import type { RecommendationScope } from "./recommendation-view-contract.js";

export function effectiveScope(recommendations: readonly RecommendationBrowseRow[], scope: RecommendationScope): RecommendationScope {
  const actionableCount = recommendations.filter(isActionableSettingRecommendation).length;
  return scope === RECOMMENDATION_SCOPE_ACTIONABLE && actionableCount === 0 && recommendations.length > 0
    ? "recommendations-without-settings"
    : scope;
}

export function matchesScope(recommendation: RecommendationBrowseRow, scope: RecommendationScope): boolean {
  return scope === RECOMMENDATION_SCOPE_ALL || isActionableSettingRecommendation(recommendation) === (scope === RECOMMENDATION_SCOPE_ACTIONABLE);
}

function isActionableSettingRecommendation(recommendation: RecommendationBrowseRow): boolean {
  const implementation = implementationOf(recommendation);
  return recommendation.relutionMapping.status === "exact"
    && implementation.category === "relution-achievable"
    && implementation.importableVia.some((surface) => surface === "ruleset-import" || surface === "apply-json")
    && recommendation.hasRulesetMappings;
}
