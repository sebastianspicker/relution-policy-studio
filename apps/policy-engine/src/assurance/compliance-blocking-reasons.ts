/** Explains why a recommendation cannot be checked or remediated automatically. */
import type { RecommendationRecord } from "./recommendation-types.js";
import type {
  ComplianceMappingResult,
  ComplianceRecommendationResult,
  ComplianceStatus,
} from "./compliance-types.js";
import { recommendationImplementationOf } from "./compliance-remediation-options.js";
import { uniqueStrings } from "../platform/serialization/json-guards.js";

export function fallbackBlockingReasons(recommendation: RecommendationRecord): string[] {
  const reasons = [...recommendationImplementationOf(recommendation).blockingReasons, ...recommendation.relutionMapping.notes];
  for (const parameter of recommendation.relutionMapping.parameterRequirements ?? []) {
    reasons.push(`Local parameter required: ${parameter.label} (${parameter.path}).`);
  }
  for (const support of recommendation.relutionMapping.processSupport ?? []) {
    reasons.push(`Relution function evidence required: ${support.relutionFunction}.`);
  }
  return reasons.length > 0 ? uniqueStrings(reasons) : ["No exact Relution mapping is available for automatic compliance checking."];
}

export function blockingReasonsForResult(
  recommendation: RecommendationRecord,
  mappingResults: ComplianceMappingResult[],
  remediationOptions: ComplianceRecommendationResult["remediationOptions"],
  status: ComplianceStatus,
): string[] {
  if (status === "compliant") return [];
  const reasons = [...recommendation.relutionMapping.notes, ...recommendationImplementationOf(recommendation).blockingReasons];
  for (const result of mappingResults) addMappingReason(reasons, result);
  if (status === "choice-required" && remediationOptions.length > 1) {
    reasons.push("Multiple exact remediation variants are available; choose one explicit variant.");
  }
  for (const option of remediationOptions) {
    if (option.available === false && option.unavailableReason !== undefined) reasons.push(option.unavailableReason);
  }
  return uniqueStrings(reasons);
}

function addMappingReason(reasons: string[], result: ComplianceMappingResult): void {
  if (result.status === "missing") reasons.push(`Missing ${result.target}.`);
  else if (result.status === "mismatch") reasons.push(`${result.target} exists but does not match the recommendation.`);
  else if (result.status === "ambiguous") reasons.push(`Multiple candidate settings exist for ${result.target}; Relution remediation cannot choose one safely.`);
  else if (result.status === "unsupported") reasons.push(`The mapping target ${result.target} is not supported for compliance automation.`);
}
