/** Selects payload-key JSON or guided fields as the generic-setting source of truth. */
import type { AppleCompatSetting, JsonRecord } from "./apple-compat-types.js";
import { appleProfileMetadata } from "./apple-profile.js";
import { asRecord } from "../platform/serialization/json-guards.js";
import { hasOwn } from "./apple-compat-value-primitives.js";
import { parsePayloadKeysJson } from "./apple-payload-json.js";
import { fieldValueFromPayload, payloadValueFromField } from "./apple-compat-field-values.js";
import { hydrateSystemMigrationValues, mergeSystemMigrationValuesIntoPayloadKeys } from "./apple-compat-system-migration.js";

export function syncPayloadKeysJsonValues(
  setting: AppleCompatSetting,
  normalized: JsonRecord,
  submittedValues: JsonRecord,
  previousDetails?: JsonRecord,
): JsonRecord {
  const payloadKeys = parsePayloadKeysJson(normalized.payloadKeysJson, `setting ${setting.id} payload keys`);
  if (submittedPayloadJsonIsCanonical(setting, submittedValues, previousDetails)) {
    return hydrateGuidedValuesFromPayloadKeys(setting, normalized, payloadKeys);
  }
  const mergedPayloadKeys = mergeGuidedValuesIntoPayloadKeys(setting, normalized, payloadKeys);
  normalized.payloadKeysJson = JSON.stringify(mergedPayloadKeys, null, 2);
  return hydrateGuidedValuesFromPayloadKeys(setting, normalized, mergedPayloadKeys);
}

function mergeGuidedValuesIntoPayloadKeys(setting: AppleCompatSetting, values: JsonRecord, payloadKeys: JsonRecord): JsonRecord {
  if (setting.id === "system-migration") {
    return mergeSystemMigrationValuesIntoPayloadKeys(values, payloadKeys);
  }
  const output: JsonRecord = { ...payloadKeys };
  for (const field of setting.fields) {
    if (field.id !== "payloadKeysJson" && field.payloadKey !== undefined) {
      const value = payloadValueFromField(field, values[field.id]);
      if (value === undefined) delete output[field.payloadKey]; else output[field.payloadKey] = value;
    }
  }
  return output;
}

export function hydrateGuidedValuesFromPayloadKeys(setting: AppleCompatSetting, values: JsonRecord, payloadKeys: JsonRecord): JsonRecord {
  const hydrated: JsonRecord = { ...values, payloadKeysJson: JSON.stringify(payloadKeys, null, 2) };
  if (setting.id === "system-migration") {
    hydrateSystemMigrationValues(hydrated, payloadKeys);
    return hydrated;
  }
  for (const field of setting.fields) {
    if (field.id !== "payloadKeysJson" && field.payloadKey !== undefined && hasOwn(payloadKeys, field.payloadKey)) {
      hydrated[field.id] = fieldValueFromPayload(field, payloadKeys[field.payloadKey]);
    }
  }
  return hydrated;
}

function submittedPayloadJsonIsCanonical(
  setting: AppleCompatSetting,
  submittedValues: JsonRecord,
  previousDetails: JsonRecord | undefined,
): boolean {
  const previousValues = asRecord(appleProfileMetadata(previousDetails)?.values);
  const previousJson = typeof previousValues?.payloadKeysJson === "string" ? previousValues.payloadKeysJson : undefined;
  const submittedJson = typeof submittedValues.payloadKeysJson === "string" ? submittedValues.payloadKeysJson : undefined;
  const guidedValueSubmitted = setting.fields.some((field) => field.id !== "payloadKeysJson" && hasOwn(submittedValues, field.id));
  return (previousJson !== undefined && submittedJson !== undefined && submittedJson !== previousJson)
    || (previousJson === undefined && !guidedValueSubmitted);
}
