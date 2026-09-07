/** Builds canonical compliance mapping results and status classifications. */
import type { ComplianceConfigurationCandidate } from "./compliance-configurations.js";
import type { ComplianceMappingResult, JsonRecord } from "./compliance-types.js";
import type { RecommendationRulesetMapping } from "./recommendation-types.js";

export function mappingResult(
  kind: ComplianceMappingResult["kind"],
  target: string,
  expectedValues: JsonRecord,
  matching: ComplianceConfigurationCandidate[],
  candidates: ComplianceConfigurationCandidate[],
  status: ComplianceMappingResult["status"],
): ComplianceMappingResult {
  return {
    kind,
    target,
    expectedValues,
    status,
    matchingConfigurations: matching.map((entry) => entry.reference),
    candidateConfigurations: candidates.map((entry) => entry.reference),
  };
}

export function unsupportedMapping(kind: ComplianceMappingResult["kind"], target: string, expectedValues: JsonRecord): ComplianceMappingResult {
  return { kind, target, expectedValues, status: "unsupported", matchingConfigurations: [], candidateConfigurations: [] };
}

export function determineMappingStatus(matchingCount: number, candidateCount: number): ComplianceMappingResult["status"] {
  if (matchingCount > 0) return "compliant";
  if (candidateCount === 0) return "missing";
  return candidateCount === 1 ? "mismatch" : "ambiguous";
}

export function unsupportedMappingTarget(mapping: RecommendationRulesetMapping): string {
  if (mapping.kind === "relution-native") return String(mapping.type ?? "");
  if (mapping.kind === "apple-schema-profile") return String(mapping.schemaId ?? "");
  return String(mapping.payloadType ?? "");
}
