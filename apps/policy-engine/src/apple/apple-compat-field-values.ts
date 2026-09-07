/** Chooses the correct converter for each Apple compatibility field kind. */
import type { AppleCompatField, AppleCompatObjectField } from "./apple-compat-types.js";
import { objectListFieldValueFromPayload, objectListPayloadValue, objectListValue } from "./apple-compat-object-list-values.js";
import { normalizeScalarValue } from "./apple-compat-scalar-values.js";
import { parseAppleJsonFieldValue, appleScalarValueFromPayload, type AppleProfileScalarValueKind } from "./apple-profile-values.js";
import { listValue } from "./apple-compat-value-primitives.js";
import { keyValueRecord } from "./apple-compat-key-value-values.js";

export function normalizeFieldValue(field: AppleCompatField | AppleCompatObjectField, value: unknown): unknown {
  return field.kind === "object-list" ? objectListValue(field, value) : normalizeScalarValue(field, value);
}

export function payloadValueFromField(field: AppleCompatField | AppleCompatObjectField, value: unknown): unknown {
  if (field.kind === "object-list") return objectListPayloadValue(field, value, payloadValueFromScalarField);
  return payloadValueFromScalarField(field, value);
}

export function fieldValueFromPayload(field: AppleCompatField | AppleCompatObjectField, value: unknown): unknown {
  if (field.kind === "object-list") return objectListFieldValueFromPayload(field, value, scalarFieldValueFromPayload);
  return scalarFieldValueFromPayload(field, value);
}

function payloadValueFromScalarField(field: AppleCompatField | AppleCompatObjectField, value: unknown): unknown {
  if (field.kind === "json") return parseAppleJsonFieldValue(value, field.defaultValue);
  return field.kind === "key-value-list" ? keyValueRecord(value) : normalizeScalarValue(field, value);
}

function scalarFieldValueFromPayload(field: AppleCompatField | AppleCompatObjectField, value: unknown): unknown {
  if (field.kind === "key-value-list") return keyValueRecord(value);
  return appleScalarValueFromPayload(field.kind as AppleProfileScalarValueKind, value, field.defaultValue, listValue);
}
