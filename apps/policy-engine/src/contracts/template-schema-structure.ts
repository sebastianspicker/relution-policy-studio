// Provides Relution template-bundle construction, schema, and labeling helpers.
import { asMaybeObject, resolveAllOf, type JsonObject } from "../contracts/template.js";

export function enumValues(schema: unknown): string[] {
  const values = asMaybeObject(schema)?.enum;
  return Array.isArray(values) ? values.filter((value): value is string => typeof value === "string") : [];
}

export function objectProperties(schema: unknown, schemas: Record<string, JsonObject>): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const candidate of resolveAllOf(schema, schemas)) {
    const candidateProperties = candidate.properties;
    if (asMaybeObject(candidateProperties) !== undefined) {
      Object.assign(properties, candidateProperties);
    }
  }
  return properties;
}

export function requiredProperties(schema: unknown, schemas: Record<string, JsonObject>): string[] {
  const result = new Set<string>();
  for (const candidate of resolveAllOf(schema, schemas)) {
    const required = candidate.required;
    if (Array.isArray(required)) {
      for (const item of required) {
        if (typeof item === "string") {
          result.add(item);
        }
      }
    }
  }
  return [...result].sort();
}

export function schemaType(schema: JsonObject): string {
  const type = schema.type;
  if (typeof type === "string") {
    return type;
  }
  if (Array.isArray(type)) {
    return type.filter((value): value is string => typeof value === "string").join("|");
  }
  if (schema.properties !== undefined || schema.allOf !== undefined) {
    return "object";
  }
  return schema.enum !== undefined ? "string" : "unknown";
}
