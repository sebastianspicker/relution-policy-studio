/** Decides whether optional profile fields should be omitted from Apple payloads. */
import type { AppleSchemaField } from "./apple-schema-types.js";

export function isEmptyOptionalAppleSchemaValue(field: AppleSchemaField, value: unknown): boolean {
  return (OPTIONAL_EMPTY_CHECKS[field.kind] ?? isEmptyStringValue)(value);
}

const OPTIONAL_EMPTY_CHECKS: Partial<Record<AppleSchemaField["kind"], (value: unknown) => boolean>> = {
  boolean: isBlankScalarValue,
  integer: isBlankScalarValue,
  number: isBlankScalarValue,
  list: (value) => Array.isArray(value) ? value.length === 0 : String(value ?? "").trim().length === 0,
  json: isEmptyJsonValue,
};

function isBlankScalarValue(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

function isEmptyStringValue(value: unknown): boolean {
  return String(value ?? "").length === 0;
}

function isEmptyJsonValue(value: unknown): boolean {
  const parsed = typeof value === "string" ? JSON.parse(value.length === 0 ? "null" : value) as unknown : value;
  if (Array.isArray(parsed)) {
    return parsed.length === 0;
  }
  return parsed !== null && typeof parsed === "object" ? Object.keys(parsed).length === 0 : parsed === null;
}
