import { cleanDescription, labelConfigurationType } from "./template-label-core.js";
import { collectFields } from "./template-field-collection.js";
import { heuristicMetadata } from "./template-runtime-metadata.js";
import { asObject, type JsonObject, type RelutionTemplateBundle, type RuntimeConfigurationTypeMetadata, type TemplateRefreshDiagnostics } from "../contracts/template.js";
import { enumValues, requiredProperties } from "../contracts/template-schema-structure.js";
import { normalizeTemplateBundle } from "./template-bundle.js";

export interface CreateTemplateBundleInput {
  openApi: JsonObject;
  iosSystemApps: unknown;
  runtimeMetadata: RuntimeConfigurationTypeMetadata[];
  serverVersion: string;
  sourceImage: string;
  sourceImageDigest?: string;
  springConfigurationMetadata: unknown;
  generatedAt?: string;
  refreshDiagnostics?: TemplateRefreshDiagnostics;
}

export function createTemplateBundle(input: CreateTemplateBundleInput): RelutionTemplateBundle {
  const schemas = schemasFromOpenApi(input.openApi);
  const runtimeByType = new Map(input.runtimeMetadata.map((entry) => [entry.type, entry]));
  const platforms = enumValues(schemas.Platform);
  const enrollmentTypes = enumValues(schemas.EnrollmentType);
  const configurationTypes = configurationTypesFromSchemas(schemas, runtimeByType, platforms);
  return normalizeTemplateBundle({
    serverVersion: input.serverVersion,
    sourceImage: input.sourceImage,
    ...(input.sourceImageDigest === undefined ? {} : { sourceImageDigest: input.sourceImageDigest }),
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    refreshDiagnostics: input.refreshDiagnostics ?? defaultRefreshDiagnostics(input),
    platforms,
    enrollmentTypes,
    configurationTypes,
    schemas,
    iosSystemApps: input.iosSystemApps,
    springConfigurationMetadata: input.springConfigurationMetadata,
  });
}

function schemasFromOpenApi(openApi: JsonObject): Record<string, JsonObject> {
  return asObject(asObject(openApi.components, "openapi.components").schemas, "openapi.components.schemas") as Record<string, JsonObject>;
}

function configurationTypesFromSchemas(schemas: Record<string, JsonObject>, runtimeByType: Map<string, RuntimeConfigurationTypeMetadata>, platforms: string[]) {
  const configurationDetails = asObject(schemas.ConfigurationDetails, "ConfigurationDetails");
  const mapping = asObject(asObject(configurationDetails.discriminator, "ConfigurationDetails.discriminator").mapping, "ConfigurationDetails.discriminator.mapping");
  return Object.entries(mapping).map(([type, ref]) => configurationTemplate(type, ref, schemas, runtimeByType.get(type) ?? heuristicMetadata(type, platforms))).sort((left, right) => left.type.localeCompare(right.type));
}

function configurationTemplate(type: string, ref: unknown, schemas: Record<string, JsonObject>, runtime: RuntimeConfigurationTypeMetadata) {
  if (typeof ref !== "string") {
    throw new Error(`Invalid schema ref for ${type}`);
  }
  const schemaName = ref.split("/").at(-1);
  if (schemaName === undefined) {
    throw new Error(`Missing schema ${String(schemaName)} for ${type}`);
  }
  const schema = schemas[schemaName];
  if (schema === undefined) {
    throw new Error(`Missing schema ${schemaName} for ${type}`);
  }
  const description = cleanDescription(typeof schema.description === "string" ? schema.description : undefined);
  return {
    type,
    label: labelConfigurationType(type),
    ...(description === undefined ? {} : { description, descriptionSource: "schema" as const }),
    schemaName,
    platforms: runtime.platforms,
    enrollmentTypes: runtime.enrollmentTypes,
    multiConfig: runtime.multiConfig,
    portalHidden: runtime.portalHidden,
    placeholders: runtime.placeholders,
    required: requiredProperties(schema, schemas),
    fields: collectFields(schema, schemas),
  };
}

function defaultRefreshDiagnostics(input: CreateTemplateBundleInput): TemplateRefreshDiagnostics {
  return {
    runtimeMetadata: { source: input.runtimeMetadata.length > 0 ? "reflected" : "heuristic", reflectedCount: input.runtimeMetadata.length, configurationTypeCount: input.runtimeMetadata.length },
    iosSystemAppsLoaded: isNonEmpty(input.iosSystemApps),
    springConfigurationMetadataLoaded: isNonEmpty(input.springConfigurationMetadata),
  };
}

function isNonEmpty(value: unknown): boolean {
  return value !== undefined && value !== null && (!Array.isArray(value) || value.length > 0) && (typeof value !== "object" || Object.keys(value).length > 0);
}
