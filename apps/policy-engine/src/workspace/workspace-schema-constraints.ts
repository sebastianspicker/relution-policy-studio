/** Normalizes pattern and property constraints in bundled OpenAPI schemas. */
import { asRecord, type JsonRecord } from "../platform/serialization/json-guards.js";
import { allowNull } from "./workspace-schema-nullability.js";
import type { SchemaSanitizationContext, SchemaSanitizer } from "./types.js";

export function sanitizePattern(sanitized: JsonRecord, context: SchemaSanitizationContext): void {
  if (typeof sanitized.pattern !== "string") return;
  const pattern = sanitized.pattern;
  try {
    compileSchemaPattern(pattern);
  } catch (error) {
    context.issues.push({
      schemaName: context.schemaName,
      path: context.path,
      kind: "invalid-pattern",
      pattern,
      message: error instanceof Error ? error.message : String(error),
    });
    delete sanitized.pattern;
  }
}

function compileSchemaPattern(pattern: string): RegExp {
  if (pattern.length > 2048) {
    throw new Error("Pattern exceeds the supported 2048 character limit");
  }
  return Reflect.construct(RegExp, [pattern, "u"]) as RegExp;
}

export function sanitizeProperties(
  record: JsonRecord,
  sanitized: JsonRecord,
  context: SchemaSanitizationContext,
  sanitize: SchemaSanitizer,
): void {
  const properties = asRecord(record.properties);
  if (properties === undefined) return;
  const required = new Set(Array.isArray(record.required) ? record.required.filter((entry): entry is string => typeof entry === "string") : []);
  const sanitizedProperties: JsonRecord = {};
  for (const [propertyName, propertySchema] of Object.entries(properties)) {
    const childSchema = sanitize(propertySchema, { ...context, path: `${context.path}.properties.${propertyName}` });
    sanitizedProperties[propertyName] = required.has(propertyName) ? childSchema : allowNull(childSchema);
  }
  sanitized.properties = sanitizedProperties;
}
