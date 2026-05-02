import { Ajv, type ErrorObject, type ValidateFunction } from "ajv/dist/ajv.js";
import { inspectMobileConfigText } from "./plist.js";
import { findTemplate, type RelutionTemplateBundle } from "./templates.js";
import type { PolicyWorkspace, SchemaCompatibilityIssue, WorkspaceValidationError, WorkspaceValidationResult } from "./workspace.js";

type JsonRecord = Record<string, unknown>;

interface ValidatorContext {
  ajv: Ajv;
  validators: Map<string, ValidateFunction>;
  schemaCompatibilityIssues: SchemaCompatibilityIssue[];
}

const validatorContexts = new WeakMap<RelutionTemplateBundle, ValidatorContext>();

export function validateWorkspace(workspace: PolicyWorkspace, bundle: RelutionTemplateBundle): WorkspaceValidationResult {
  const errors: WorkspaceValidationError[] = [];
  const validatorContext = getValidatorContext(bundle);

  for (const policy of workspace.policies) {
    const platform = stringValue(policy.document.platform);
    if (platform === undefined || !bundle.platforms.includes(platform)) {
      errors.push({ path: policy.path, message: `Policy platform is invalid: ${String(policy.document.platform)}` });
      continue;
    }
    const versions = Array.isArray(policy.document.versions) ? policy.document.versions : [];
    for (const [versionIndex, versionValue] of versions.entries()) {
      const version = asRecord(versionValue, `${policy.path}.versions[${versionIndex}]`);
      const configurations = Array.isArray(version.configurations) ? version.configurations : [];
      const seen = new Set<string>();
      for (const [configurationIndex, configurationValue] of configurations.entries()) {
        const type = configurationType(configurationValue);
        const path = `${policy.path}.versions[${versionIndex}].configurations[${configurationIndex}]`;
        if (type === undefined) {
          errors.push({ path, message: "Configuration details.type is missing" });
          continue;
        }
        const template = findTemplate(bundle, type);
        if (template === undefined) {
          errors.push({ path, message: `Unknown configuration type: ${type}` });
          continue;
        }
        if (!template.platforms.includes(platform)) {
          errors.push({ path, message: `${type} is not compatible with policy platform ${platform}` });
        }
        if (!template.multiConfig && seen.has(type)) {
          errors.push({ path, message: `${type} is not multi-config and appears more than once` });
        }
        seen.add(type);
        const details = configurationDetails(configurationValue);
        if (details === undefined) {
          errors.push({ path, message: "Configuration details object is missing" });
          continue;
        }
        const validate = getSchemaValidator(validatorContext, template.schemaName);
        if (!validate(details)) {
          for (const error of validate.errors ?? []) {
            errors.push({ path: `${path}.details${error.instancePath}`, message: formatAjvError(error) });
          }
        }
        for (const error of mobileConfigValidationErrors(details)) {
          errors.push({ path: `${path}.details.rawContent`, message: error });
        }
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

export function schemaCompatibilityIssues(bundle: RelutionTemplateBundle): SchemaCompatibilityIssue[] {
  return getValidatorContext(bundle).schemaCompatibilityIssues;
}

function configurationType(value: unknown): string | undefined {
  const details = configurationDetails(value);
  return stringValue(details?.type);
}

function configurationDetails(value: unknown): JsonRecord | undefined {
  const record = typeof value === "object" && value !== null && !Array.isArray(value) ? (value as JsonRecord) : undefined;
  const details = record?.details;
  return typeof details === "object" && details !== null && !Array.isArray(details) ? (details as JsonRecord) : undefined;
}

function asRecord(value: unknown, label: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} is not an object`);
  }
  return value as JsonRecord;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function formatAjvError(error: ErrorObject): string {
  if (error.message === undefined) {
    return error.keyword;
  }
  return error.message;
}

function mobileConfigValidationErrors(details: JsonRecord): string[] {
  if (details.type !== "APPLE_MOBILECONFIG") {
    return [];
  }
  const rawContent = stringValue(details.rawContent) ?? "";
  if (rawContent.trim().length === 0) {
    return [];
  }
  const declaredSignatureState = stringValue(details.mobileConfigSignatureState);
  const inspectedSignatureState = inspectMobileConfigText(rawContent).signatureState;
  if (declaredSignatureState === "signed-invalid" || inspectedSignatureState === "signed-invalid") {
    return ["Mobileconfig XML is invalid or incomplete"];
  }
  return [];
}

function getValidatorContext(bundle: RelutionTemplateBundle): ValidatorContext {
  const cached = validatorContexts.get(bundle);
  if (cached !== undefined) {
    return cached;
  }

  const prepared = prepareValidationSchemas(bundle.schemas);
  const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: false });
  ajv.addSchema({ $id: "relution-openapi", components: { schemas: prepared.schemas } });
  const context = {
    ajv,
    validators: new Map<string, ValidateFunction>(),
    schemaCompatibilityIssues: prepared.issues,
  };
  validatorContexts.set(bundle, context);
  return context;
}

function getSchemaValidator(context: ValidatorContext, schemaName: string): ValidateFunction {
  const cached = context.validators.get(schemaName);
  if (cached !== undefined) {
    return cached;
  }
  const validate = context.ajv.compile({ $ref: `relution-openapi#/components/schemas/${schemaName}` });
  context.validators.set(schemaName, validate);
  return validate;
}

function prepareValidationSchemas(schemas: Record<string, JsonRecord>): {
  schemas: Record<string, JsonRecord>;
  issues: SchemaCompatibilityIssue[];
} {
  const issues: SchemaCompatibilityIssue[] = [];
  const prepared: Record<string, JsonRecord> = {};
  for (const [schemaName, schema] of Object.entries(schemas)) {
    const sanitized = sanitizeSchema(schema, { schemaName, path: schemaName, issues });
    prepared[schemaName] = asRecord(sanitized, schemaName);
  }
  return { schemas: prepared, issues };
}

function sanitizeSchema(
  value: unknown,
  context: { schemaName: string; path: string; issues: SchemaCompatibilityIssue[] },
): unknown {
  if (Array.isArray(value)) {
    return value.map((entry, index) => sanitizeSchema(entry, { ...context, path: `${context.path}[${index}]` }));
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }

  const record = value as JsonRecord;
  const sanitized: JsonRecord = {};
  for (const [key, childValue] of Object.entries(record)) {
    if (key === "properties") {
      continue;
    }
    sanitized[key] = sanitizeSchema(childValue, { ...context, path: `${context.path}.${key}` });
  }

  if (typeof sanitized.pattern === "string") {
    const pattern = sanitized.pattern;
    try {
      new RegExp(pattern, "u");
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

  const properties = record.properties;
  if (typeof properties === "object" && properties !== null && !Array.isArray(properties)) {
    const required = new Set(Array.isArray(record.required) ? record.required.filter((entry): entry is string => typeof entry === "string") : []);
    const sanitizedProperties: JsonRecord = {};
    for (const [propertyName, propertySchema] of Object.entries(properties as JsonRecord)) {
      const childPath = `${context.path}.properties.${propertyName}`;
      const childSchema = sanitizeSchema(propertySchema, { ...context, path: childPath });
      sanitizedProperties[propertyName] = required.has(propertyName) ? childSchema : allowNull(childSchema);
    }
    sanitized.properties = sanitizedProperties;
  }

  return sanitized;
}

function allowNull(schema: unknown): unknown {
  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
    return schema;
  }

  const record = schema as JsonRecord;
  if (record.nullable === true) {
    return record;
  }

  if (typeof record.$ref === "string" || record.allOf !== undefined || record.oneOf !== undefined || record.anyOf !== undefined) {
    return { anyOf: [record, { type: "null" }] };
  }

  const nullable = { ...record };
  if (typeof nullable.type === "string") {
    nullable.type = nullable.type === "null" ? "null" : [nullable.type, "null"];
  } else if (Array.isArray(nullable.type)) {
    const types = nullable.type.filter((entry): entry is string => typeof entry === "string");
    nullable.type = types.includes("null") ? types : [...types, "null"];
  } else {
    nullable.nullable = true;
  }

  if (Array.isArray(nullable.enum) && !nullable.enum.includes(null)) {
    nullable.enum = [...nullable.enum, null];
  }

  return nullable;
}
