/** Normalizes implementation metadata consistently for full evidence and browse projections. */
import type { RecommendationImplementation, RecommendationRecord } from "./recommendation-types.js";

export function implementationOf(recommendation: RecommendationRecord): RecommendationImplementation {
  if (recommendation.implementation !== undefined) {
    return recommendation.implementation;
  }
  const fallbackTranslations = recommendation.fallbackTranslations ?? [];
  const surfaces = [...new Set([
    ...recommendation.relutionMapping.candidates.map((candidate) => candidate.kind),
    ...recommendation.relutionMapping.rulesetMappings.map((mapping) => mapping.kind),
    ...(fallbackTranslations.length > 0 ? ["helper"] : []),
  ])].sort() as RecommendationImplementation["surfaces"];
  return inferredImplementation(recommendation, surfaces, fallbackTranslations.length > 0);
}

function inferredImplementation(
  recommendation: RecommendationRecord,
  surfaces: RecommendationImplementation["surfaces"],
  hasFallbackTranslations: boolean,
): RecommendationImplementation {
  const { relutionMapping } = recommendation;
  if (relutionMapping.status === "exact") {
    return {
      category: "relution-achievable",
      surfaces,
      importableVia: relutionMapping.rulesetMappings.some((mapping) => mapping.kind === "relution-native")
        ? ["apply-json", "ruleset-import"]
        : ["ruleset-import"],
      blockingReasons: relutionMapping.notes,
    };
  }
  return nonExactImplementation(recommendation, surfaces, hasFallbackTranslations);
}

function nonExactImplementation(
  recommendation: RecommendationRecord,
  surfaces: RecommendationImplementation["surfaces"],
  hasFallbackTranslations: boolean,
): RecommendationImplementation {
  const category = recommendation.relutionMapping.candidates.length > 0
    ? "relution-partial"
    : hasFallbackTranslations
      ? "helper-only"
      : "gap";
  return { category, surfaces, importableVia: [], blockingReasons: recommendation.relutionMapping.notes };
}

