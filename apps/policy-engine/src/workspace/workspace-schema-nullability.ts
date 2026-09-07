/** Makes optional OpenAPI object properties compatible with workspace JSON. */
import type { JsonRecord } from "../platform/serialization/json-guards.js";

function wrapsReferenceOrComposition(record: JsonRecord): boolean {
  return typeof record.$ref === "string"
    || record.allOf !== undefined
    || record.oneOf !== undefined
    || record.anyOf !== undefined;
}

function wrapWithNull(record: JsonRecord): JsonRecord {
  return { anyOf: [record, { type: "null" }] };
}

function toNullableType(type: unknown): string | string[] | undefined {
  if (typeof type === "string") {
    return type === "null" ? "null" : [type, "null"];
  }
  if (Array.isArray(type)) {
    const types = type.filter((entry): entry is string => typeof entry === "string");
    return types.includes("null") ? types : [...types, "null"];
  }
  return undefined;
}

function toNullableEnum(enumValues: unknown): unknown {
  if (!Array.isArray(enumValues) || enumValues.includes(null)) {
    return enumValues;
  }
  return [...enumValues, null];
}

export function allowNull(schema: unknown): unknown {
  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
    return schema;
  }

  const record = schema as JsonRecord;
  if (record.nullable === true) {
    return record;
  }
  if (wrapsReferenceOrComposition(record)) {
    return wrapWithNull(record);
  }
  const nullable: JsonRecord = { ...record };
  const nullableType = toNullableType(record.type);
  if (nullableType === undefined) {
    nullable.nullable = true;
  } else {
    nullable.type = nullableType;
  }
  if (Array.isArray(record.enum)) {
    nullable.enum = toNullableEnum(record.enum);
  }
  return nullable;
}
