/** Normalizes submitted Apple compatibility editor values. */
import type { AppleCompatSetting, JsonRecord } from "./apple-compat-types.js";
import { hasOwn } from "./apple-compat-value-primitives.js";
import { normalizeFieldValue } from "./apple-compat-field-values.js";
import { syncPayloadKeysJsonValues } from "./apple-compat-generic-sync.js";
import { asRecord } from "../platform/serialization/json-guards.js";
import { appleProfileMetadata } from "./apple-profile.js";
import { tryParsePayloadKeysJson } from "./apple-payload-json.js";
import { hydrateGuidedValuesFromPayloadKeys } from "./apple-compat-generic-sync.js";

export function normalizeAppleCompatValues(
  setting: AppleCompatSetting,
  values: JsonRecord,
  previousDetails?: JsonRecord,
): JsonRecord {
  const normalized: JsonRecord = {};
  for (const field of setting.fields) {
    const value = hasOwn(values, field.id) ? values[field.id] : field.defaultValue;
    normalized[field.id] = normalizeFieldValue(field, value);
  }
  return setting.builder === "generic-json"
    ? syncPayloadKeysJsonValues(setting, normalized, values, previousDetails)
    : normalized;
}

export function extractAppleCompatValues(details: JsonRecord | undefined, setting: AppleCompatSetting): JsonRecord {
  const stored = asRecord(appleProfileMetadata(details)?.values);
  const values: JsonRecord = {};
  for (const field of setting.fields) values[field.id] = stored?.[field.id] ?? field.defaultValue;
  const payloadKeys = setting.builder === "generic-json" ? tryParsePayloadKeysJson(values.payloadKeysJson) : undefined;
  return payloadKeys === undefined ? values : hydrateGuidedValuesFromPayloadKeys(setting, values, payloadKeys);
}
