/** Recovers editor field values from an Apple schema payload-body JSON document. */
import { appleScalarValueFromPayload } from "./apple-profile-values.js";
import { CUSTOM_SETTINGS_ID, customSettingsValuesFromPayloadBody } from "./apple-schema-custom-settings.js";
import { appleSchemaDataValueFromPayload } from "./apple-schema-payload-json.js";
import type { AppleSchemaEntry, AppleSchemaField, AppleSchemaValues } from "./apple-schema-types.js";
import type { JsonRecord } from "../platform/serialization/json-guards.js";

export function appleSchemaValuesFromPayloadBody(entry: AppleSchemaEntry, payloadBody: JsonRecord): AppleSchemaValues {
  if (entry.id === CUSTOM_SETTINGS_ID) {
    return customSettingsValuesFromPayloadBody(payloadBody);
  }
  const values: AppleSchemaValues = {};
  for (const field of entry.fields) {
    if (hasOwn(payloadBody, field.payloadKey)) {
      values[field.path] = appleSchemaFieldValueFromPayload(field, payloadBody[field.payloadKey]);
      continue;
    }
    if (field.required) {
      values[field.path] = field.defaultValue;
    }
  }
  return values;
}

function appleSchemaFieldValueFromPayload(field: AppleSchemaField, value: unknown): unknown {
  return field.kind === "data"
    ? appleSchemaDataValueFromPayload(value)
    : appleScalarValueFromPayload(field.kind, value, field.defaultValue, schemaListValue);
}

function hasOwn(record: JsonRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

export function schemaListValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }
  return String(value ?? "")
    .split(/\r?\n/u)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}
