/** Reads and applies one exact assurance mapping against a policy configuration array. */
import {
  extractAppleCompatValues,
  findAppleCompatSettingForDetails,
  updateAppleCompatDetails,
} from "../apple/apple-compat-values.js";
import { findAppleSchemaProfileForDetails } from "../apple/apple-schema-catalog-access.js";
import { extractAppleSchemaValues } from "../apple/apple-schema-body.js";
import { updateAppleSchemaProfileDetails } from "../apple/apple-schema-profile-details.js";
import type { AppleSchemaCatalog } from "../apple/apple-schema-types.js";
import type { RelutionTemplateBundle } from "../contracts/template.js";
import { asRecord, type JsonRecord } from "../platform/serialization/json-guards.js";
import type { AssuranceMapping } from "./assurance-contracts.js";
import { applyAppleCompatValues, applyAppleSchemaValues } from "./compliance-apple-application.js";
import { applyNativeValues } from "./compliance-native-application.js";
import { deepMergePreservingExistingUuids } from "./compliance-deep-values.js";
import type { AppleProfileCreateOptions } from "../apple/apple-profile.js";

export function assuranceMappingKey(mapping: AssuranceMapping): string {
  return `${mapping.family}:${mapping.target}${mapping.instanceId === undefined ? "" : `:${mapping.instanceId}`}`;
}

export function currentAssuranceMappingValues(
  configurations: readonly JsonRecord[],
  mapping: AssuranceMapping,
  appleSchema: AppleSchemaCatalog,
): JsonRecord | undefined {
  const candidates = configurations.flatMap((configuration) => {
    const details = asRecord(configuration.details);
    return details !== undefined && mappingMatches(details, mapping, appleSchema) ? [details] : [];
  });
  const identified = mapping.instanceId === undefined
    ? nativeIdentityCandidates(candidates, mapping)
    : candidates.filter((details) => details.uuid === mapping.instanceId || details.name === mapping.instanceId);
  if (identified.length > 1) throw new Error(`Assurance mapping target is ambiguous: ${assuranceMappingKey(mapping)}`);
  const details = identified[0];
  if (details === undefined) return undefined;
  if (mapping.family === "relution-native") return details;
  if (mapping.family === "apple-schema-profile") {
    const entry = findAppleSchemaProfileForDetails(appleSchema, details);
    return entry === undefined ? undefined : extractAppleSchemaValues(details, entry);
  }
  const setting = findAppleCompatSettingForDetails(details);
  return setting === undefined ? undefined : extractAppleCompatValues(details, setting);
}

export function applyAssuranceMappingValues(
  configurations: JsonRecord[],
  mapping: AssuranceMapping,
  values: JsonRecord,
  bundle: RelutionTemplateBundle,
  appleSchema: AppleSchemaCatalog,
  createOptions: AppleProfileCreateOptions,
): void {
  if (mapping.instanceId !== undefined) {
    applyIdentifiedMappingValues(configurations, mapping, values, appleSchema, createOptions);
    return;
  }
  if (mapping.family === "relution-native") applyNativeValues(configurations, mapping.target, values, bundle, createOptions);
  else if (mapping.family === "apple-schema-profile") applyAppleSchemaValues(configurations, mapping.target, values, appleSchema, createOptions);
  else applyAppleCompatValues(configurations, mapping.target, values, createOptions);
}

function applyIdentifiedMappingValues(
  configurations: JsonRecord[],
  mapping: AssuranceMapping,
  values: JsonRecord,
  appleSchema: AppleSchemaCatalog,
  createOptions: AppleProfileCreateOptions,
): void {
  const matches = configurations.flatMap((configuration) => {
    const details = asRecord(configuration.details);
    return details !== undefined
      && mappingMatches(details, mapping, appleSchema)
      && (details.uuid === mapping.instanceId || details.name === mapping.instanceId)
      ? [{ configuration, details }]
      : [];
  });
  if (matches.length !== 1) throw new Error(`Assurance instance target is missing or ambiguous: ${assuranceMappingKey(mapping)}`);
  const { configuration, details } = matches[0]!;
  if (mapping.family === "relution-native") {
    configuration.details = deepMergePreservingExistingUuids(details, values);
    return;
  }
  if (mapping.family === "apple-schema-profile") {
    const entry = findAppleSchemaProfileForDetails(appleSchema, details);
    if (entry === undefined) throw new Error(`Apple schema profile not found: ${mapping.target}`);
    configuration.details = updateAppleSchemaProfileDetails(
      details,
      entry,
      deepMergePreservingExistingUuids(extractAppleSchemaValues(details, entry), values),
      createOptions,
    );
    return;
  }
  const setting = findAppleCompatSettingForDetails(details);
  if (setting === undefined) throw new Error(`Apple mobileconfig payload type not found: ${mapping.target}`);
  configuration.details = updateAppleCompatDetails(
    details,
    setting.id,
    deepMergePreservingExistingUuids(extractAppleCompatValues(details, setting), values),
    createOptions,
  );
}

function mappingMatches(details: JsonRecord, mapping: AssuranceMapping, appleSchema: AppleSchemaCatalog): boolean {
  if (mapping.family === "relution-native") return details.type === mapping.target;
  if (mapping.family === "apple-schema-profile") return findAppleSchemaProfileForDetails(appleSchema, details)?.id === mapping.target;
  return findAppleCompatSettingForDetails(details)?.payloadType === mapping.target;
}

function nativeIdentityCandidates(candidates: JsonRecord[], mapping: AssuranceMapping): JsonRecord[] {
  if (mapping.family !== "relution-native" || mapping.target !== "WINDOWS_CUSTOM_CSP" || typeof mapping.values.name !== "string") {
    return candidates;
  }
  return candidates.filter((details) => details.name === mapping.values.name);
}
