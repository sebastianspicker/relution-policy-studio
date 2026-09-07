/** Normalizes editor values into the scalar forms expected by Apple schema payloads. */
import { parseAppleFiniteNumber, parseAppleInteger } from "./apple-profile-values.js";
import { schemaListValue } from "./apple-schema-payload-values.js";
import type { AppleSchemaEntry, AppleSchemaField, AppleSchemaValues } from "./apple-schema-types.js";
import type { JsonRecord } from "../platform/serialization/json-guards.js";

export function normalizeAppleSchemaValues(entry: AppleSchemaEntry, values: AppleSchemaValues): AppleSchemaValues {
  const normalized: AppleSchemaValues = {};
  const providedValues = values as JsonRecord;
  for (const field of entry.fields) {
    const provided = hasOwn(providedValues, field.path);
    if (!field.required && (!provided || providedValues[field.path] === undefined)) {
      continue;
    }
    normalized[field.path] = normalizeAppleSchemaValue(field, provided ? providedValues[field.path] : field.defaultValue);
  }
  return normalized;
}

export function normalizeAppleSchemaValue(field: AppleSchemaField, value: unknown): unknown {
  return (SCHEMA_VALUE_NORMALIZERS[field.kind] ?? normalizeStringValue)(field, value);
}

const SCHEMA_VALUE_NORMALIZERS: Partial<Record<AppleSchemaField["kind"], (field: AppleSchemaField, value: unknown) => unknown>> = {
  boolean: (_field, value) => value === true,
  integer: (_field, value) => parseAppleInteger(value) ?? 0,
  number: (_field, value) => parseAppleFiniteNumber(value) ?? 0,
  list: (_field, value) => schemaListValue(value),
  json: (field, value) => typeof value === "string" ? value : JSON.stringify(value ?? field.defaultValue, null, 2),
  data: (_field, value) => typeof value === "string" ? value : undefined,
};

function normalizeStringValue(_field: AppleSchemaField, value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function hasOwn(record: JsonRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}
