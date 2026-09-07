/** Normalizes non-object-list Apple compatibility field values. */
import type { AppleCompatField, AppleCompatObjectField } from "./apple-compat-types.js";
import { parseAppleFiniteNumber, parseAppleInteger } from "./apple-profile-values.js";
import { listValue } from "./apple-compat-value-primitives.js";
import { keyValueRecord } from "./apple-compat-key-value-values.js";

type AppleCompatScalarValueField = AppleCompatField | AppleCompatObjectField;

export function normalizeScalarValue(field: AppleCompatScalarValueField, value: unknown): unknown {
  switch (field.kind) {
    case "boolean":
      return value === true;
    case "integer":
      return isBlankSubmittedValue(value) ? undefined : parseAppleInteger(value);
    case "number":
      return isBlankSubmittedValue(value) ? undefined : parseAppleFiniteNumber(value);
    case "list":
      return listValue(value);
    case "key-value-list":
      return keyValueRecord(value);
    case "json":
      return typeof value === "string" ? value : JSON.stringify(value ?? field.defaultValue, null, 2);
    default:
      return typeof value === "string" ? value : String(value ?? "");
  }
}

function isBlankSubmittedValue(value: unknown): boolean {
  return value === undefined || (typeof value === "string" && value.trim().length === 0);
}
