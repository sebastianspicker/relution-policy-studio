/** Dispatches supported recommendation mappings to their platform evaluators. */
import type { AppleSchemaCatalog } from "../apple/apple-schema-types.js";
import type { RecommendationRulesetMapping } from "./recommendation-types.js";
import type { ComplianceMappingResult, JsonRecord } from "./compliance-types.js";
import { evaluateAppleCompatMapping, evaluateAppleSchemaMapping } from "./compliance-apple-mapping.js";
import { evaluateNativeMapping } from "./compliance-native-mapping.js";
import { unsupportedMappingTarget } from "./compliance-mapping-result.js";
import { asRecord } from "../platform/serialization/json-guards.js";

export function supportedComplianceMapping(mapping: RecommendationRulesetMapping): boolean {
  return (mapping.kind === "relution-native" && typeof mapping.type === "string")
    || (mapping.kind === "apple-schema-profile" && typeof mapping.schemaId === "string")
    || (mapping.kind === "apple-mobileconfig" && typeof mapping.payloadType === "string");
}

export function evaluateMapping(
  mapping: RecommendationRulesetMapping,
  configurations: JsonRecord[],
  appleSchema: AppleSchemaCatalog,
): ComplianceMappingResult {
  const expectedValues = asRecord(mapping.values) ?? {};
  if (mapping.kind === "relution-native" && typeof mapping.type === "string") {
    return evaluateNativeMapping(mapping.type, mapping, expectedValues, configurations);
  }
  if (mapping.kind === "apple-schema-profile" && typeof mapping.schemaId === "string") {
    return evaluateAppleSchemaMapping(mapping.schemaId, mapping, expectedValues, configurations, appleSchema);
  }
  if (mapping.kind === "apple-mobileconfig" && typeof mapping.payloadType === "string") {
    return evaluateAppleCompatMapping(mapping.payloadType, mapping, expectedValues, configurations);
  }
  return {
    kind: mapping.kind,
    target: unsupportedMappingTarget(mapping),
    expectedValues,
    status: "unsupported",
    matchingConfigurations: [],
    candidateConfigurations: [],
  };
}
