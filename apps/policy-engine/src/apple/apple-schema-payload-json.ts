/** Converts plist-compatible Apple schema payload values to the JSON editor representation. */
import type { PlistDataValue } from "./plist-types.js";
import { asRecord, type JsonRecord } from "../platform/serialization/json-guards.js";

export function appleSchemaPayloadBodyToJsonRecord(value: unknown): JsonRecord {
  const normalized = jsonValueFromPayload(value);
  return asRecord(normalized) ?? {};
}

function jsonValueFromPayload(value: unknown): unknown {
  if (isPlistDataValue(value)) {
    return value.base64;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => jsonValueFromPayload(entry));
  }
  const record = asRecord(value);
  if (record !== undefined) {
    return Object.fromEntries(Object.entries(record).map(([key, entry]) => [key, jsonValueFromPayload(entry)]));
  }
  return value;
}

export function appleSchemaDataValueFromPayload(value: unknown): string {
  return typeof value === "string" ? value : isPlistDataValue(value) ? value.base64 : String(value ?? "");
}

function isPlistDataValue(value: unknown): value is PlistDataValue {
  const record = asRecord(value);
  return record?.kind === "data" && typeof record.base64 === "string";
}
