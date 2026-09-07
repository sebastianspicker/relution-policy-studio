/** Applies Apple schema and compatibility compliance mappings. */
import {
  createAppleCompatConfiguration,
  extractAppleCompatValues,
  findAppleCompatSettingForDetails,
  updateAppleCompatDetails,
} from "../apple/apple-compat-values.js";
import { APPLE_COMPAT_SETTINGS } from "../apple/apple-compat-settings.js";
import {
  createAppleSchemaProfileConfiguration,
  updateAppleSchemaProfileDetails,
} from "../apple/apple-schema-profile-details.js";
import { extractAppleSchemaValues } from "../apple/apple-schema-body.js";
import { findAppleSchemaEntry, findAppleSchemaProfileForDetails } from "../apple/apple-schema-catalog-access.js";
import type { AppleSchemaCatalog } from "../apple/apple-schema-types.js";
import { configurationCandidates } from "./compliance-configurations.js";
import { applyOrCreateConfiguration } from "./compliance-configuration-application.js";
import { deepMergePreservingExistingUuids, deepSubsetMatch } from "./compliance-deep-values.js";
import type { JsonRecord } from "./compliance-types.js";
import { asRecord } from "../platform/serialization/json-guards.js";

export function applyAppleSchemaValues(
  configurations: JsonRecord[],
  schemaId: string,
  values: JsonRecord,
  appleSchema: AppleSchemaCatalog,
): void {
  const entry = findAppleSchemaEntry(appleSchema, schemaId);
  if (entry === undefined || entry.kind !== "profile") throw new Error(`Apple schema profile not found: ${schemaId}`);
  const candidates = configurationCandidates(
    configurations,
    (details) => findAppleSchemaProfileForDetails(appleSchema, details)?.id === schemaId,
  );
  applyOrCreateConfiguration({
    configurations,
    candidates,
    target: schemaId,
    targetLabel: "Apple schema configuration",
    ambiguityReason: "multiple matching Apple profiles exist",
    matches: (candidate) => deepSubsetMatch(values, extractAppleSchemaValues(candidate.details, entry)),
    updateCandidate: (candidateRecord) => {
      const details = asRecord(candidateRecord.details) ?? {};
      const merged = deepMergePreservingExistingUuids(extractAppleSchemaValues(details, entry), values);
      candidateRecord.details = updateAppleSchemaProfileDetails(details, entry, merged);
    },
    createCandidate: () => createAppleSchemaProfileConfiguration(entry, values),
  });
}

export function applyAppleCompatValues(configurations: JsonRecord[], payloadType: string, values: JsonRecord): void {
  const setting = APPLE_COMPAT_SETTINGS.find((candidate) => candidate.payloadType === payloadType);
  if (setting === undefined) throw new Error(`Apple mobileconfig payload type not found: ${payloadType}`);
  const candidates = configurationCandidates(
    configurations,
    (details) => findAppleCompatSettingForDetails(details)?.id === setting.id,
  );
  applyOrCreateConfiguration({
    configurations,
    candidates,
    target: payloadType,
    targetLabel: "Apple mobileconfig configuration",
    ambiguityReason: "multiple matching Apple settings exist",
    matches: (candidate) => deepSubsetMatch(values, extractAppleCompatValues(candidate.details, setting)),
    updateCandidate: (candidateRecord) => {
      const details = asRecord(candidateRecord.details) ?? {};
      const merged = deepMergePreservingExistingUuids(extractAppleCompatValues(details, setting), values);
      candidateRecord.details = updateAppleCompatDetails(details, setting.id, merged);
    },
    createCandidate: () => createAppleCompatConfiguration(setting.id, values),
  });
}
