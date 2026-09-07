/** Normalizes bundled OpenAPI schemas for the local AJV validator. */
import type { SchemaCompatibilityIssue, SchemaSanitizationContext } from "./types.js";
import { asRecord, requireRecord, type JsonRecord } from "../platform/serialization/json-guards.js";
import { sanitizePattern, sanitizeProperties } from "./workspace-schema-constraints.js";

export interface PreparedValidationSchemas {
  schemas: Record<string, JsonRecord>;
  issues: SchemaCompatibilityIssue[];
}

export function prepareValidationSchemas(schemas: Record<string, JsonRecord>): PreparedValidationSchemas {
  const issues: SchemaCompatibilityIssue[] = [];
  const prepared: Record<string, JsonRecord> = {};
  for (const [schemaName, schema] of Object.entries(schemas)) {
    const sanitized = sanitizeSchema(schema, { schemaName, path: schemaName, issues });
    prepared[schemaName] = requireRecord(sanitized, schemaName);
  }
  return { schemas: prepared, issues };
}

function sanitizeSchema(value: unknown, context: SchemaSanitizationContext): unknown {
  if (Array.isArray(value)) {
    return value.map((entry, index) => sanitizeSchema(entry, { ...context, path: `${context.path}[${index}]` }));
  }
  const record = asRecord(value);
  return record === undefined ? value : sanitizeSchemaRecord(record, context);
}

function sanitizeSchemaRecord(record: JsonRecord, context: SchemaSanitizationContext): JsonRecord {
  const sanitized = sanitizeSchemaChildren(record, context);
  sanitizePattern(sanitized, context);
  sanitizeProperties(record, sanitized, context, sanitizeSchema);
  return sanitized;
}

function sanitizeSchemaChildren(record: JsonRecord, context: SchemaSanitizationContext): JsonRecord {
  const sanitized: JsonRecord = {};
  for (const [key, childValue] of Object.entries(record)) {
    if (key !== "properties") {
      sanitized[key] = sanitizeSchema(childValue, { ...context, path: `${context.path}.${key}` });
    }
  }
  return sanitized;
}
