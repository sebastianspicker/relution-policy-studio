/** Dispatches supported recommendation mappings to their target configuration families. */
import type { AppleSchemaCatalog } from "../apple/apple-schema-types.js";
import { applyAppleCompatValues, applyAppleSchemaValues } from "./compliance-apple-application.js";
import { deepMergePreservingExistingUuids } from "./compliance-deep-values.js";
import { supportedComplianceMapping } from "./compliance-mapping-evaluation.js";
import { applyNativeValues } from "./compliance-native-application.js";
import type { JsonRecord } from "./compliance-types.js";
import type { RecommendationRecord, RecommendationRulesetMapping } from "./recommendation-types.js";
import type { RelutionTemplateBundle } from "../contracts/template.js";
import { asRecord } from "../platform/serialization/json-guards.js";

export { applyNativeBundle } from "./compliance-native-application.js";

interface GroupedMapping {
  readonly mapping: RecommendationRulesetMapping;
  readonly values: JsonRecord;
}

export function applyRecommendationMappings(
  configurations: JsonRecord[],
  recommendation: RecommendationRecord,
  templateBundle: RelutionTemplateBundle,
  appleSchema: AppleSchemaCatalog,
): void {
  for (const { mapping, values } of groupRecommendationMappings(recommendation).values()) {
    if (mapping.kind === "relution-native" && typeof mapping.type === "string") {
      applyNativeValues(configurations, mapping.type, values, templateBundle);
    } else if (mapping.kind === "apple-schema-profile" && typeof mapping.schemaId === "string") {
      applyAppleSchemaValues(configurations, mapping.schemaId, values, appleSchema);
    } else if (mapping.kind === "apple-mobileconfig" && typeof mapping.payloadType === "string") {
      applyAppleCompatValues(configurations, mapping.payloadType, values);
    } else {
      throw new Error(`Unsupported compliance mapping kind: ${mapping.kind}`);
    }
  }
}

function groupRecommendationMappings(recommendation: RecommendationRecord): Map<string, GroupedMapping> {
  const grouped = new Map<string, GroupedMapping>();
  for (const mapping of recommendation.relutionMapping.rulesetMappings.filter(supportedComplianceMapping)) {
    const key = mappingKey(mapping);
    const values = deepMergePreservingExistingUuids(
      grouped.get(key)?.values ?? {},
      asRecord(mapping.values) ?? {},
    );
    grouped.set(key, { mapping, values });
  }
  return grouped;
}

function mappingKey(mapping: RecommendationRulesetMapping): string {
  if (mapping.kind === "relution-native") return `relution-native:${mapping.type}`;
  if (mapping.kind === "apple-schema-profile") return `apple-schema-profile:${mapping.schemaId}`;
  return `apple-mobileconfig:${mapping.payloadType}`;
}
