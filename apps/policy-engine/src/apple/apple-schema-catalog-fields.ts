/** Normalizes Apple YAML payload-key definitions into editor field definitions. */
import type { AppleSchemaField } from "./apple-schema-types.js";
import { appleSchemaFieldDefault, appleSchemaFieldKind, appleSchemaStringArray, isAppleSchemaVariableSafe, labelAppleSchemaIdentifier } from "./apple-schema-catalog-field-values.js";
import { asRecord, stringValue } from "../platform/serialization/json-guards.js";

function normalizeAppleSchemaField(value: unknown): AppleSchemaField | undefined {
  const definition = asRecord(value);
  if (definition === undefined) return undefined;
  const key = stringValue(definition.key);
  if (!key) return undefined;
  const kind = appleSchemaFieldKind(definition);
  return {
    path: key,
    payloadKey: key,
    title: stringValue(definition.title) ?? labelAppleSchemaIdentifier(key),
    kind,
    required: definition.presence === "required",
    description: stringValue(definition.content) ?? "",
    defaultValue: definition.default ?? appleSchemaFieldDefault(kind),
    enumValues: appleSchemaStringArray(definition.rangelist),
    variableSafe: isAppleSchemaVariableSafe(kind),
  };
}

export function normalizeAppleSchemaFields(values: unknown[]): AppleSchemaField[] {
  return values.flatMap((value) => {
    const field = normalizeAppleSchemaField(value);
    return field === undefined ? [] : [field];
  });
}
