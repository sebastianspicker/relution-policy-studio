import type {
  RecommendationFallbackTranslation,
  RecommendationRecord,
  RecommendationSource,
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
  if (source === "bsi" && hasStringField(recommendation, "requirementId")) {
    return recommendation.requirementId;
  }
  if (source === "cis" && hasStringField(recommendation, "recommendationId")) {
    return recommendation.recommendationId;
  }
  if (source === "vendor" && hasStringField(recommendation, "section")) {
    return recommendation.section;
  }
  return recommendation.id;
}

function hasStringField<FieldName extends string>(
  value: RecommendationRecord,
  fieldName: FieldName,
): value is RecommendationRecord & Record<FieldName, string> {
  return typeof value[fieldName as keyof RecommendationRecord] === "string";
}
