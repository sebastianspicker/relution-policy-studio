/** Evaluates Apple schema and mobileconfig recommendation mappings. */
import {
  extractAppleCompatValues,
  findAppleCompatSettingForDetails,
} from "../apple/apple-compat-values.js";
import { APPLE_COMPAT_SETTINGS } from "../apple/apple-compat-settings.js";
import {
  findAppleSchemaEntry,
  findAppleSchemaProfileForDetails,
} from "../apple/apple-schema-catalog-access.js";
import { extractAppleSchemaValues } from "../apple/apple-schema-body.js";
import type { AppleSchemaCatalog } from "../apple/apple-schema-types.js";
import type { RecommendationRulesetMapping } from "./recommendation-types.js";
import { configurationCandidates } from "./compliance-configurations.js";
import type { ComplianceMappingResult, JsonRecord } from "./compliance-types.js";
import { mappingValuesMatch } from "./compliance-value-matching.js";
import { determineMappingStatus, mappingResult, unsupportedMapping } from "./compliance-mapping-result.js";

export function evaluateAppleSchemaMapping(
  schemaId: string,
  mapping: RecommendationRulesetMapping,
  expectedValues: JsonRecord,
  configurations: JsonRecord[],
  appleSchema: AppleSchemaCatalog,
): ComplianceMappingResult {
  const entry = findAppleSchemaEntry(appleSchema, schemaId);
  if (entry === undefined || entry.kind !== "profile") return unsupportedMapping("apple-schema-profile", schemaId, expectedValues);
  const candidates = configurationCandidates(configurations, (details) => findAppleSchemaProfileForDetails(appleSchema, details)?.id === schemaId);
  const matching = candidates.filter((candidate) => mappingValuesMatch(mapping, expectedValues, extractAppleSchemaValues(candidate.details, entry)));
  return mappingResult("apple-schema-profile", schemaId, expectedValues, matching, candidates, determineMappingStatus(matching.length, candidates.length));
}

export function evaluateAppleCompatMapping(
  payloadType: string,
  mapping: RecommendationRulesetMapping,
  expectedValues: JsonRecord,
  configurations: JsonRecord[],
): ComplianceMappingResult {
  const setting = APPLE_COMPAT_SETTINGS.find((candidate) => candidate.payloadType === payloadType);
  if (setting === undefined) return unsupportedMapping("apple-mobileconfig", payloadType, expectedValues);
  const candidates = configurationCandidates(configurations, (details) => findAppleCompatSettingForDetails(details)?.id === setting.id);
  const matching = candidates.filter((candidate) => mappingValuesMatch(mapping, expectedValues, extractAppleCompatValues(candidate.details, setting)));
  return mappingResult("apple-mobileconfig", payloadType, expectedValues, matching, candidates, determineMappingStatus(matching.length, candidates.length));
}
