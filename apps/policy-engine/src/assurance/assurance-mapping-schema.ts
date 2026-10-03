/** Rejects schema drift before a reviewed value can be coerced during application. */
import { isDeepStrictEqual } from "node:util";
import type { AppleSchemaCatalog } from "../apple/apple-schema-types.js";
import type { AppleCompatField, AppleCompatObjectField } from "../apple/apple-compat-types.js";
import { APPLE_COMPAT_SETTINGS } from "../apple/apple-compat-settings.js";
import { findAppleSchemaEntry } from "../apple/apple-schema-catalog-access.js";
import { findTemplate, resolveSchema, resolveAllOf, type RelutionTemplateBundle } from "../contracts/template.js";
import { objectProperties, schemaType } from "../contracts/template-schema-structure.js";
import { asRecord, type JsonRecord } from "../platform/serialization/json-guards.js";
import type { AssuranceMapping } from "./assurance-contracts.js";

export function assertAssuranceMappingSchema(mapping: AssuranceMapping, values: JsonRecord, platform: string, bundle: RelutionTemplateBundle, appleSchema: AppleSchemaCatalog): void {
  if (mapping.family === "relution-native") {
    const template = findTemplate(bundle, mapping.target);
    if (template === undefined || !template.platforms.includes(platform)) throw new Error(`Assurance mapping is not supported on ${platform}: ${mapping.target}`);
    assertDeclaredValues(values, bundle.schemas[template.schemaName], bundle, mapping.target);
    return;
  }
  if (mapping.family === "apple-schema-profile") {
    const entry = findAppleSchemaEntry(appleSchema, mapping.target);
    if (entry?.kind !== "profile" || !entry.availability.platforms.includes(platform)) throw new Error(`Assurance Apple profile is not supported on ${platform}: ${mapping.target}`);
    for (const [key, value] of Object.entries(values)) {
      const field = entry.fields.find((candidate) => candidate.path === key);
      if (field === undefined) throw new Error(`Assurance Apple field is not declared: ${mapping.target}/${key}`);
      assertAppleValue(field.kind, field.enumValues, value, `${mapping.target}/${key}`);
    }
    return;
  }
  const setting = APPLE_COMPAT_SETTINGS.find((entry) => entry.payloadType === mapping.target);
  if (setting === undefined || !setting.platforms.includes(platform)) throw new Error(`Assurance Apple payload is not supported on ${platform}: ${mapping.target}`);
  for (const [key, value] of Object.entries(values)) {
    const field = setting.fields.find((candidate) => candidate.id === key);
    if (field === undefined) throw new Error(`Assurance Apple compatibility field is not declared: ${mapping.target}/${key}`);
    assertCompatValue(field, value, `${mapping.target}/${key}`);
  }
}

function assertDeclaredValues(value: unknown, schema: unknown, bundle: RelutionTemplateBundle, path: string): void {
  const resolved = resolveSchema(schema, bundle.schemas);
  if (resolved === undefined) throw new Error(`Assurance configuration schema is unavailable: ${path}`);
  for (const constraint of resolveAllOf(schema, bundle.schemas)) {
    const types = schemaType(constraint).split("|");
    if (!(value === null && constraint.nullable === true) && !types.some((type) => valueHasType(value, type))) invalidValue(path, "schema type");
    if (Array.isArray(constraint.enum) && !constraint.enum.some((allowed) => isDeepStrictEqual(allowed, value))) invalidValue(path, "schema enum");
  }
  if (Array.isArray(value)) {
    if (resolved.items === undefined) invalidValue(path, "array item schema");
    value.forEach((entry, index) => assertDeclaredValues(entry, resolved.items, bundle, `${path}/${String(index)}`));
    return;
  }
  const record = asRecord(value);
  if (record === undefined) return;
  const properties = objectProperties(resolved, bundle.schemas);
  for (const [key, child] of Object.entries(record)) {
    if (!Object.hasOwn(properties, key)) throw new Error(`Assurance field is not declared by the configuration schema: ${path}/${key}`);
    assertDeclaredValues(child, properties[key], bundle, `${path}/${key}`);
  }
}

function valueHasType(value: unknown, type: string): boolean {
  switch (type) {
    case "null": return value === null;
    case "object": return asRecord(value) !== undefined;
    case "array": return Array.isArray(value);
    case "integer": return typeof value === "number" && Number.isSafeInteger(value);
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "string": return typeof value === "string";
    case "boolean": return typeof value === "boolean";
    default: return false;
  }
}

function assertAppleValue(kind: string, options: readonly string[], value: unknown, path: string): void {
  if (kind === "list") {
    if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) invalidValue(path, "list of strings");
  } else if (kind === "json") {
    if (typeof value !== "string") invalidValue(path, "JSON text");
    try { JSON.parse(value); } catch { invalidValue(path, "valid JSON text"); }
  } else if (!valueHasType(value, ["textarea", "data"].includes(kind) ? "string" : kind)) invalidValue(path, kind);
  const members = Array.isArray(value) ? value : [value];
  if (options.length > 0 && members.some((member) => !options.includes(String(member)))) invalidValue(path, "allowed option");
}

function assertCompatValue(field: AppleCompatField | AppleCompatObjectField, value: unknown, path: string): void {
  if (field.kind === "object-list") {
    if (!Array.isArray(value) || field.itemFields === undefined) invalidValue(path, "declared object list");
    for (const [index, item] of value.entries()) {
      const record = asRecord(item);
      if (record === undefined) invalidValue(path, "object list item");
      for (const [key, child] of Object.entries(record)) {
        const itemField = field.itemFields.find((entry) => entry.id === key);
        if (itemField === undefined) throw new Error(`Assurance Apple list field is not declared: ${path}/${String(index)}/${key}`);
        assertCompatValue(itemField, child, `${path}/${String(index)}/${key}`);
      }
    }
  } else if (field.kind === "key-value-list") {
    const record = asRecord(value);
    if (record === undefined || Object.entries(record).some(([key, child]) => key.trim().length === 0 || typeof child !== "string")) invalidValue(path, "string-valued dictionary");
  } else assertAppleValue(field.kind, field.options ?? [], value, path);
}

function invalidValue(path: string, expected: string): never {
  throw new Error(`Assurance value does not match ${expected}: ${path}`);
}
