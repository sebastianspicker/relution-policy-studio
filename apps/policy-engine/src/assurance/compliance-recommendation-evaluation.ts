/** Evaluates one recommendation across all supported mapping targets. */
import type { AppleSchemaCatalog } from "../apple/apple-schema-types.js";
import type { RecommendationRecord, RecommendationSource } from "./recommendation-types.js";
import type {
  ComplianceRecommendationResult,
  ComplianceSourceCatalogs,
  ComplianceStatus,
  JsonRecord,
} from "./compliance-types.js";
import { uniqueConfigurationReferences } from "./compliance-value-lookups.js";
import { evaluateMapping } from "./compliance-mapping-evaluation.js";
import { remediationOptionsForRecommendation } from "./compliance-remediation-options.js";
import { blockingReasonsForResult, fallbackBlockingReasons } from "./compliance-blocking-reasons.js";

export function evaluateRecommendation(
  source: RecommendationSource,
  recommendation: RecommendationRecord,
  configurations: JsonRecord[],
  artifacts: ComplianceSourceCatalogs,
  appleSchema: AppleSchemaCatalog,
): ComplianceRecommendationResult {
  const mappings = recommendation.relutionMapping.status === "exact"
    ? recommendation.relutionMapping.rulesetMappings
    : [];
  if (mappings.length === 0) return uncheckedRecommendation(source, recommendation);
  const mappingResults = mappings.map((mapping) => evaluateMapping(mapping, configurations, appleSchema));
  const matchedConfigurations = uniqueConfigurationReferences(mappingResults.flatMap((entry) => entry.matchingConfigurations));
  const allCompliant = mappingResults.every((entry) => entry.status === "compliant");
  const unsupported = mappingResults.some((entry) => entry.status === "unsupported");
  const ambiguous = mappingResults.some((entry) => entry.status === "ambiguous");
  const remediationOptions = allCompliant || unsupported
    ? []
    : remediationOptionsForRecommendation(source, recommendation, artifacts.settingBundleCatalog, artifacts.settingBundleCatalogError, mappingResults);
  const status = recommendationStatus(allCompliant, unsupported, ambiguous, remediationOptions.length);
  return {
    id: `${source}:${recommendation.id}`,
    source,
    recommendationId: recommendation.id,
    recommendation,
    status,
    mappingResults,
    matchedConfigurations,
    blockingReasons: blockingReasonsForResult(recommendation, mappingResults, remediationOptions, status),
    remediationOptions: status === "choice-required" && ambiguous ? [] : remediationOptions,
  };
}

function uncheckedRecommendation(source: RecommendationSource, recommendation: RecommendationRecord): ComplianceRecommendationResult {
  const parameterized = recommendation.relutionMapping.status === "parameterized";
  return {
    id: `${source}:${recommendation.id}`,
    source,
    recommendationId: recommendation.id,
    recommendation,
    status: parameterized ? "parameter-required" : "not-checkable",
    mappingResults: [],
    matchedConfigurations: [],
    blockingReasons: fallbackBlockingReasons(recommendation),
    remediationOptions: [],
  };
}

function recommendationStatus(
  allCompliant: boolean,
  unsupported: boolean,
  ambiguous: boolean,
  remediationCount: number,
): ComplianceStatus {
  if (allCompliant) return "compliant";
  if (unsupported) return "not-checkable";
  return ambiguous || remediationCount > 1 ? "choice-required" : "exact-gap";
}
