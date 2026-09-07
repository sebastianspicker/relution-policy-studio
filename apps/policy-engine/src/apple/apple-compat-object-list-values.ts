/** Converts Apple compatibility object-list fields to and from payload arrays. */
import type { AppleCompatField, AppleCompatObjectField, JsonRecord } from "./apple-compat-types.js";
import { asRecord } from "../platform/serialization/json-guards.js";
import { normalizeScalarValue } from "./apple-compat-scalar-values.js";

export function objectListPayloadValue(
  field: AppleCompatField,
  value: unknown,
  payloadValue: (field: AppleCompatObjectField, value: unknown) => unknown,
): JsonRecord[] {
  return mapObjectListRows(field, value, (itemField, input) => {
    const nextValue = payloadValue(itemField, input[itemField.id] ?? itemField.defaultValue);
    return itemField.payloadKey === undefined || nextValue === undefined ? undefined : [itemField.payloadKey, nextValue];
  });
}

export function objectListFieldValueFromPayload(
  field: AppleCompatField,
  value: unknown,
  fieldValue: (field: AppleCompatObjectField, value: unknown) => unknown,
): JsonRecord[] {
  return mapObjectListRows(field, value, (itemField, input) => {
    const payloadValue = itemField.payloadKey === undefined ? undefined : input[itemField.payloadKey];
    return payloadValue === undefined ? [itemField.id, itemField.defaultValue] : [itemField.id, fieldValue(itemField, payloadValue)];
  });
}

export function objectListValue(field: AppleCompatField, value: unknown): JsonRecord[] {
  return mapObjectListRows(field, value, (itemField, input) => [
    itemField.id,
    normalizeScalarValue(itemField, input[itemField.id] ?? itemField.defaultValue),
  ]);
}

function mapObjectListRows(
  field: AppleCompatField,
  value: unknown,
  itemValue: (itemField: AppleCompatObjectField, input: JsonRecord) => readonly [string, unknown] | undefined,
): JsonRecord[] {
  const rows = Array.isArray(value) ? value : [];
  return rows.map((entry) => objectListRow(field, asRecord(entry) ?? {}, itemValue));
}

function objectListRow(
  field: AppleCompatField,
  input: JsonRecord,
  itemValue: (itemField: AppleCompatObjectField, input: JsonRecord) => readonly [string, unknown] | undefined,
): JsonRecord {
  const output: JsonRecord = {};
  for (const itemField of field.itemFields ?? []) {
    const item = itemValue(itemField, input);
    if (item !== undefined) {
      output[item[0]] = item[1];
    }
  }
  return output;
}
