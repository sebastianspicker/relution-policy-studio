import type { RecommendationImplementation, RecommendationRecord, RecommendationBrowseRow } from "../../../../src/browser/assurance.js";
import { implementationOf as fullImplementationOf } from "../../../../src/browser/assurance.js";

export function implementationOf(recommendation: RecommendationRecord | RecommendationBrowseRow): RecommendationImplementation {
  return "hasRulesetMappings" in recommendation ? { ...recommendation.implementation, blockingReasons: [] } : fullImplementationOf(recommendation);
}

export function importabilityLabel(implementation: RecommendationImplementation): string {
  return implementation.importableVia.length === 0 ? "Info only" : `Importable via ${implementation.importableVia.join(", ")}`;
}

export function categoryLabel(category: string): string {
  return ({
    "relution-achievable": "Achievable",
    "relution-partial": "Partial",
    "helper-only": "Helper only",
    gap: "Gap",
  } as Record<string, string>)[category] ?? category;
}

export function surfaceLabel(surface: string): string {
  return ({
    "relution-native": "Native",
    "apple-mobileconfig": "Apple mobileconfig",
    "apple-schema-profile": "Apple schema",
    helper: "Helper",
  } as Record<string, string>)[surface] ?? surface;
}
