// Provides Relution template-bundle construction, schema, and labeling helpers.
import { asMaybeObject, resolveSchema, schemaRef } from "../contracts/template.js";
import { enumValues, objectProperties, requiredProperties, schemaType } from "../contracts/template-schema-structure.js";
import type { JsonObject, TemplateField } from "../contracts/template.js";

export function defaultValueForSchema(schema: unknown, schemas: Record<string, JsonObject>): unknown {
  const resolved = resolveSchema(schema, schemas);
  if (resolved === undefined) {
    return null;
  }
  const enumOptions = enumValues(resolved);
  if (enumOptions.length > 0) {
    return enumOptions[0] ?? null;
  }
  const type = schemaType(resolved);
  if (type === "boolean") return false;
  if (type === "integer" || type === "number") return 0;
  if (type === "array") return [];
  if (type !== "object") return "";
  const value: Record<string, unknown> = {};
  const properties = objectProperties(resolved, schemas);
  for (const property of requiredProperties(resolved, schemas)) {
    const propertySchema = properties[property];
    if (propertySchema !== undefined) {
      value[property] = defaultValueForSchema(propertySchema, schemas);
    }
  }
  return value;
}

export function appendArrayItemFields(
  field: TemplateField,
  schema: JsonObject,
  schemas: Record<string, JsonObject>,
  seenRefs: Set<string>,
  collect: (schema: unknown, schemas: Record<string, JsonObject>, prefix: string, requiredAtLevel: Set<string>, seenRefs: Set<string>) => TemplateField[],
): void {
  const items = asMaybeObject(schema.items);
  if (items === undefined) {
    return;
  }
  const resolvedItems = resolveSchema(items, schemas);
  field.itemKind = schemaType(resolvedItems ?? items);
  const itemRef = schemaRef(items);
  if (field.itemKind === "object" && (itemRef === undefined || !seenRefs.has(itemRef))) {
    const itemFields = collect(resolvedItems ?? items, schemas, "", new Set<string>(), nextSeenRefs(seenRefs, itemRef));
    if (itemFields.length > 0) {
      field.itemFields = itemFields;
    }
  }
}

export function nextSeenRefs(seenRefs: Set<string>, ref: string | undefined): Set<string> {
  return ref === undefined ? seenRefs : new Set([...seenRefs, ref]);
}
