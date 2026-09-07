import { cleanDescription, labelEnumValue, labelFieldPath } from "./template-label-core.js";
import { appendArrayItemFields, nextSeenRefs } from "../contracts/template-field-values.js";
import { resolveSchema, schemaRef } from "../contracts/template.js";
import { enumValues, objectProperties, requiredProperties, schemaType } from "../contracts/template-schema-structure.js";
import type { JsonObject, TemplateField } from "../contracts/template.js";

export function collectFields(
  schema: unknown,
  schemas: Record<string, JsonObject>,
  prefix = "",
  requiredAtLevel = new Set<string>(),
  seenRefs = new Set<string>(),
): TemplateField[] {
  const fields: TemplateField[] = [];
  const properties = objectProperties(schema, schemas);
  const required = new Set(requiredProperties(schema, schemas));
  for (const [name, propertySchema] of Object.entries(properties)) {
    const path = prefix.length > 0 ? `${prefix}.${name}` : name;
    const resolved = resolveSchema(propertySchema, schemas) ?? {};
    const ref = schemaRef(propertySchema);
    const field = createField(path, name, resolved, ref, required, requiredAtLevel);
    appendArrayItemFields(field, resolved, schemas, seenRefs, collectFields);
    fields.push(field);
    if (field.kind === "object" && !path.endsWith(".uuid") && (ref === undefined || !seenRefs.has(ref))) {
      fields.push(...collectFields(resolved, schemas, path, requiredAtLevel, nextSeenRefs(seenRefs, ref)));
    }
  }
  return fields;
}

function createField(path: string, name: string, schema: JsonObject, ref: string | undefined, required: Set<string>, requiredAtLevel: Set<string>): TemplateField {
  const description = cleanDescription(typeof schema.description === "string" ? schema.description : undefined);
  return {
    path,
    label: labelFieldPath(path),
    kind: schemaType(schema),
    required: required.has(name) || requiredAtLevel.has(path),
    nullable: schema.nullable === true,
    enumValues: enumValues(schema),
    enumLabels: Object.fromEntries(enumValues(schema).map((value) => [value, labelEnumValue(value)])),
    ...(description === undefined ? {} : { description, descriptionSource: "openapi" as const }),
    ...(schema.default === undefined ? {} : { defaultValue: schema.default }),
    ...(ref === undefined ? {} : { ref }),
  };
}
