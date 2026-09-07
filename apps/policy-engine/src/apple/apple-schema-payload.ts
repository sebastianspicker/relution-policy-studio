/** Converts normalized Apple schema field values into profile and protocol payload bodies. */
import { parseAppleJsonFieldValue } from "./apple-profile-values.js";
import { CUSTOM_SETTINGS_ID, customSettingsPayloadFromValues } from "./apple-schema-custom-settings.js";
import { normalizeAppleSchemaValue } from "./apple-schema-normalization.js";
import { isEmptyOptionalAppleSchemaValue } from "./apple-schema-optional-values.js";
import type { AppleSchemaEntry, AppleSchemaField, AppleSchemaValues } from "./apple-schema-types.js";
import type { PlistDataValue } from "./plist-types.js";

export function appleSchemaPayloadFromValues(entry: AppleSchemaEntry, values: AppleSchemaValues): Record<string, unknown> {
  if (entry.id === CUSTOM_SETTINGS_ID) {
    return customSettingsPayloadFromValues(values);
  }
  const payload: Record<string, unknown> = {};
  for (const field of entry.fields) {
    const value = values[field.path];
    if (entry.kind === "profile" && !field.required && isEmptyOptionalAppleSchemaValue(field, value)) {
      continue;
    }
    payload[field.payloadKey] = appleSchemaPayloadValue(field, value);
  }
  return payload;
}

function appleSchemaPayloadValue(field: AppleSchemaField, value: unknown): unknown {
  if (field.kind === "json") {
    return parseAppleJsonFieldValue(value, field.defaultValue);
  }
  if (field.kind === "data") {
    return { kind: "data", base64: typeof value === "string" ? value : String(value ?? "") } satisfies PlistDataValue;
  }
  return normalizeAppleSchemaValue(field, value);
}

export function knownAppleSchemaPayloadKeys(entry: AppleSchemaEntry): Set<string> {
  return new Set(entry.fields.map((field) => field.payloadKey));
}
