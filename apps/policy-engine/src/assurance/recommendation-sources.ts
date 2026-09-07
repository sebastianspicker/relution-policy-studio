// Defines the supported recommendation source identifiers used by policy guidance catalogs.
import type { RecommendationSource } from "./recommendation-contracts.js";

export const RECOMMENDATION_SOURCES = ["bsi", "vendor", "cis"] as const satisfies readonly RecommendationSource[];
