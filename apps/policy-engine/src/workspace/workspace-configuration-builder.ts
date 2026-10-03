/** Creates complete configuration records from templates. */
import { randomUUID } from "node:crypto";
import { defaultValueForSchema } from "../contracts/template-field-values.js";
import { objectProperties } from "../contracts/template-schema-structure.js";
import type { ConfigurationTemplate, RelutionTemplateBundle } from "../contracts/template.js";
import type { JsonRecord } from "../platform/serialization/json-guards.js";
export function createConfiguration(template: ConfigurationTemplate, bundle: RelutionTemplateBundle, options: { uuidFactory?: () => string; now?: () => number } = {}): JsonRecord {
  const uuid = options.uuidFactory ?? (() => randomUUID().toUpperCase());
  const schema = bundle.schemas[template.schemaName]; const details = schema === undefined ? {} : defaultValueForSchema(schema, bundle.schemas);
  if (typeof details !== "object" || details === null || Array.isArray(details)) throw new Error(`Default details for ${template.type} must be an object`);
  const detailRecord = details as JsonRecord; Object.assign(detailRecord, { type: template.type, uuid: uuid(), enabled: true });
  if (template.type === "APPLE_MOBILECONFIG") Object.assign(detailRecord, { displayName: "Custom .mobileconfig", rawContent: "", payloadContent: {}, firstLevelPayloadType: "CONFIGURATION", secondLevelPayloadType: "" });
  const properties = schema === undefined ? {} : objectProperties(schema, bundle.schemas);
  for (const required of template.required) if (detailRecord[required] === undefined && properties[required] !== undefined) detailRecord[required] = defaultValueForSchema(properties[required], bundle.schemas);
  const now = options.now?.() ?? Date.now(); return { uuid: uuid(), createdBy: "local", creationDate: now, modifiedBy: "local", modificationDate: now, details: detailRecord };
}
