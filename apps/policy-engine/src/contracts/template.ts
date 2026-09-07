// Provides Relution template-bundle construction, schema, and labeling helpers.
export interface RelutionTemplateBundle {
  serverVersion: string;
  sourceImage: string;
  sourceImageDigest?: string;
  generatedAt: string;
  refreshDiagnostics: TemplateRefreshDiagnostics;
  platforms: string[];
  enrollmentTypes: string[];
  configurationTypes: ConfigurationTemplate[];
  schemas: Record<string, JsonObject>;
  iosSystemApps: unknown;
  springConfigurationMetadata: unknown;
}

export interface TemplateRefreshDiagnostics {
  runtimeMetadata: { source: "reflected" | "heuristic"; reflectedCount: number; configurationTypeCount: number };
  iosSystemAppsLoaded: boolean;
  springConfigurationMetadataLoaded: boolean;
}

export interface ConfigurationTemplate {
  type: string;
  label: string;
  description?: string;
  descriptionSource?: TemplateDescriptionSource;
  schemaName: string;
  platforms: string[];
  enrollmentTypes: string[];
  multiConfig: boolean;
  portalHidden: boolean;
  placeholders: string[];
  required: string[];
  fields: TemplateField[];
}

export function findTemplate(bundle: RelutionTemplateBundle, type: string): ConfigurationTemplate | undefined {
  return bundle.configurationTypes.find((template) => template.type === type);
}

export interface TemplateField {
  path: string;
  label: string;
  kind: string;
  required: boolean;
  nullable: boolean;
  enumValues: string[];
  enumLabels: Record<string, string>;
  description?: string;
  descriptionSource?: TemplateDescriptionSource;
  defaultValue?: unknown;
  itemKind?: string;
  itemFields?: TemplateField[];
  ref?: string;
}

export interface RuntimeConfigurationTypeMetadata {
  type: string;
  platforms: string[];
  enrollmentTypes: string[];
  multiConfig: boolean;
  placeholders: string[];
  portalHidden: boolean;
}

export type JsonObject = Record<string, unknown>;
type TemplateDescriptionSource = "schema" | "openapi" | "generated";

export function asObject(value: unknown, label: string): JsonObject {
  if (!isObject(value)) {
    throw new Error(`${label} is not an object`);
  }
  return value;
}

export function asMaybeObject(value: unknown): JsonObject | undefined {
  return isObject(value) ? value : undefined;
}

export function resolveAllOf(schema: unknown, schemas: Record<string, JsonObject>, seenRefs = new Set<string>()): JsonObject[] {
  const ref = schemaRefName(schema);
  if (ref !== undefined && seenRefs.has(ref)) {
    return [];
  }
  const nextSeenRefs = ref === undefined ? seenRefs : new Set([...seenRefs, ref]);
  const resolved = resolveSchema(schema, schemas);
  if (resolved === undefined) {
    return [];
  }
  const allOf = resolved.allOf;
  return Array.isArray(allOf) ? [resolved, ...allOf.flatMap((entry) => resolveAllOf(entry, schemas, nextSeenRefs))] : [resolved];
}

export function resolveSchema(schema: unknown, schemas: Record<string, JsonObject>): JsonObject | undefined {
  const record = asMaybeObject(schema);
  if (record === undefined) {
    return undefined;
  }
  const schemaName = schemaRefName(record);
  return schemaName === undefined ? record : schemas[schemaName] ?? record;
}

export function schemaRef(value: unknown): string | undefined {
  const record = asMaybeObject(value);
  return typeof record?.$ref === "string" ? record.$ref : undefined;
}

function schemaRefName(schema: unknown): string | undefined {
  const ref = schemaRef(schema);
  return ref?.split("/").at(-1);
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
