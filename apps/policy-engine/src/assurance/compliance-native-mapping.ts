/** Evaluates Relution-native mapping candidates, including Windows CSP identity. */
import type { RecommendationRulesetMapping } from "./recommendation-types.js";
import {
  candidatesWithSameNativeIdentity,
  configurationCandidates,
  type ComplianceConfigurationCandidate,
} from "./compliance-configurations.js";
import type { ComplianceMappingResult, JsonRecord } from "./compliance-types.js";
import { mappingResult } from "./compliance-mapping-result.js";
import { mappingValuesMatch } from "./compliance-value-matching.js";

export function evaluateNativeMapping(
  type: string,
  mapping: RecommendationRulesetMapping,
  expectedValues: JsonRecord,
  configurations: JsonRecord[],
): ComplianceMappingResult {
  const candidates = configurationCandidates(configurations, (details) => details.type === type);
  const matching = candidates.filter((candidate) => mappingValuesMatch(mapping, expectedValues, candidate.details));
  return mappingResult("relution-native", type, expectedValues, matching, candidates, nativeMappingStatus(type, expectedValues, matching.length, candidates));
}

function nativeMappingStatus(
  type: string,
  expectedValues: JsonRecord,
  matchingCount: number,
  candidates: ComplianceConfigurationCandidate[],
): ComplianceMappingResult["status"] {
  if (matchingCount > 0) return "compliant";
  if (candidates.length === 0) return "missing";
  if (type !== "WINDOWS_CUSTOM_CSP") return candidates.length === 1 ? "mismatch" : "ambiguous";
  const sameIdentity = candidatesWithSameNativeIdentity(type, expectedValues, candidates);
  if (sameIdentity.length === 0) return "missing";
  return sameIdentity.length === 1 ? "mismatch" : "ambiguous";
}
