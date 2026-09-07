/** Extracts stable secondary identifiers across heterogeneous recommendation records. */
import type {
  RecommendationRecord,
  RecommendationBrowseRow,
  RecommendationSource,
} from "../../../../src/browser/assurance.js";

export function secondaryRecommendationId(source: RecommendationSource, recommendation: RecommendationRecord | RecommendationBrowseRow): string {
  if ("displayIdentifier" in recommendation) return recommendation.displayIdentifier;
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
