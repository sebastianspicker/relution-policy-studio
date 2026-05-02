import type {
  BsiRecommendationRecord,
  CisRecommendationRecord,
  RecommendationFallbackTranslation,
  RecommendationRecord,
  RecommendationSource,
  VendorRecommendationRecord,
} from "../../../src/recommendation-types.js";

export function fallbackTranslationsOf(recommendation: RecommendationRecord): RecommendationFallbackTranslation[] {
  if (Array.isArray(recommendation.fallbackTranslations)) {
    return recommendation.fallbackTranslations;
  }
  if ("helperFallbacks" in recommendation && Array.isArray(recommendation.helperFallbacks)) {
    return recommendation.helperFallbacks;
  }
  return [];
}

export function secondaryRecommendationId(source: RecommendationSource, recommendation: RecommendationRecord): string {
  if (source === "bsi") {
    return (recommendation as BsiRecommendationRecord).requirementId;
  }
  if (source === "cis") {
    return (recommendation as CisRecommendationRecord).recommendationId;
  }
  return (recommendation as VendorRecommendationRecord).section;
}
