import { Ajv, type ErrorObject, type ValidateFunction } from "ajv/dist/ajv.js";
import { inspectMobileConfigText } from "./plist.js";
import { findTemplate, type RelutionTemplateBundle } from "./templates.js";
import type { PolicyWorkspace, SchemaCompatibilityIssue, WorkspaceValidationError, WorkspaceValidationResult } from "./workspace.js";
import { requireRecord, stringValue } from "./utils/json-guards.js";
import type { JsonRecord as SharedJsonRecord } from "./utils/json-guards.js";

interface ValidatorContext {
  ajv: Ajv;
  validators: Map<string, ValidateFunction>;
  schemaCompatibilityIssues: SchemaCompatibilityIssue[];
}

// Template bundles are treated as immutable after load; cache compiled AJV
// validators per bundle object so editor requests do not recompile schemas.
const validatorContexts = new WeakMap<RelutionTemplateBundle, ValidatorContext>();

export function validateWorkspace(workspace: PolicyWorkspace, bundle: RelutionTemplateBundle): WorkspaceValidationResult {
  const errors: WorkspaceValidationError[] = [];
  const validatorContext = getValidatorContext(bundle);

  for (const policy of workspace.policies) {
    errors.push(...validatePolicy(policy, bundle, validatorContext));
  }

  return {
    ok: errors.length === 0,
    errors,
    schemaCompatibilityIssueCount: validatorContext.schemaCompatibilityIssues.length,
    ...(validatorContext.schemaCompatibilityIssues.length === 0 ? {} : { schemaCompatibilityIssues: validatorContext.schemaCompatibilityIssues }),
  };
}

function validatePolicy(policy: PolicyWorkspace["policies"][number], bundle: RelutionTemplateBundle, validatorContext: ValidatorContext): WorkspaceValidationError[] {
  const platform = stringValue(policy.document.platform);
  if (platform === undefined || !bundle.platforms.includes(platform)) {
    return [{ path: policy.path, message: `Policy platform is invalid: ${String(policy.document.platform)}` }];
  }
  const versions = Array.isArray(policy.document.versions) ? policy.document.versions : [];
  return versions.flatMap((versionValue, versionIndex) =>
    validatePolicyVersion(policy.path, platform, versionValue, versionIndex, bundle, validatorContext),
  );
}

function validatePolicyVersion(
  policyPath: string,
  platform: string,
  versionValue: unknown,
  versionIndex: number,
  bundle: RelutionTemplateBundle,
  validatorContext: ValidatorContext,
): WorkspaceValidationError[] {
  const version = requireRecord(versionValue, `${policyPath}.versions[${versionIndex}]`);
  const configurations = Array.isArray(version.configurations) ? version.configurations : [];
  const seen = new Set<string>();
  return configurations.flatMap((configurationValue, configurationIndex) =>
    validateConfiguration(configurationValue, `${policyPath}.versions[${versionIndex}].configurations[${configurationIndex}]`, platform, seen, bundle, validatorContext),
  );
}

function validateConfiguration(
  configurationValue: unknown,
  path: string,
  platform: string,
  seen: Set<string>,
  bundle: RelutionTemplateBundle,
  validatorContext: ValidatorContext,
): WorkspaceValidationError[] {
  const type = configurationType(configurationValue);
  if (type === undefined) {
    return [{ path, message: "Configuration details.type is missing" }];
  }
  const template = findTemplate(bundle, type);
  if (template === undefined) {
    return [{ path, message: `Unknown configuration type: ${type}` }];
  }
  const errors = configurationTemplateErrors(path, platform, type, seen, template.platforms, template.multiConfig);
  const details = configurationDetails(configurationValue);
  if (details === undefined) {
    return [...errors, { path, message: "Configuration details object is missing" }];
  }
  return [...errors, ...schemaValidationErrors(path, details, getSchemaValidator(validatorContext, template.schemaName)), ...mobileConfigValidationErrors(details).map((message) => ({ path: `${path}.details.rawContent`, message }))];
}

function configurationTemplateErrors(path: string, platform: string, type: string, seen: Set<string>, platforms: string[], multiConfig: boolean): WorkspaceValidationError[] {
  const errors: WorkspaceValidationError[] = [];
  if (!platforms.includes(platform)) {
    errors.push({ path, message: `${type} is not compatible with policy platform ${platform}` });
  }
  if (!multiConfig && seen.has(type)) {
    errors.push({ path, message: `${type} is not multi-config and appears more than once` });
  }
  seen.add(type);
  return errors;
}

function schemaValidationErrors(path: string, details: SharedJsonRecord, validate: ValidateFunction): WorkspaceValidationError[] {
  if (validate(details)) {
    return [];
  }
  return (validate.errors ?? []).map((error) => ({ path: `${path}.details${error.instancePath}`, message: formatAjvError(error) }));
}

export function schemaCompatibilityIssues(bundle: RelutionTemplateBundle): SchemaCompatibilityIssue[] {
  return getValidatorContext(bundle).schemaCompatibilityIssues;
}

function configurationType(value: unknown): string | undefined {
  const details = configurationDetails(value);
  return stringValue(details?.type);
}

function configurationDetails(value: unknown): SharedJsonRecord | undefined {
  const record = typeof value === "object" && value !== null && !Array.isArray(value) ? (value as SharedJsonRecord) : undefined;
  const details = record?.details;
  return typeof details === "object" && details !== null && !Array.isArray(details) ? (details as SharedJsonRecord) : undefined;
}

function formatAjvError(error: ErrorObject): string {
  if (error.message === undefined) {
    return error.keyword;
  }
  return error.message;
}

function mobileConfigValidationErrors(details: SharedJsonRecord): string[] {
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

function prepareValidationSchemas(schemas: Record<string, SharedJsonRecord>): {
  schemas: Record<string, SharedJsonRecord>;
  issues: SchemaCompatibilityIssue[];
} {
  const issues: SchemaCompatibilityIssue[] = [];
  const prepared: Record<string, SharedJsonRecord> = {};
  for (const [schemaName, schema] of Object.entries(schemas)) {
    const sanitized = sanitizeSchema(schema, { schemaName, path: schemaName, issues });
    prepared[schemaName] = requireRecord(sanitized, schemaName);
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

  const record = value as SharedJsonRecord;
  const sanitized: SharedJsonRecord = {};
  for (const [key, childValue] of Object.entries(record)) {
    if (key === "properties") {
      continue;
    }
    sanitized[key] = sanitizeSchema(childValue, { ...context, path: `${context.path}.${key}` });
  }

  if (typeof sanitized.pattern === "string") {
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

  const properties = record.properties;
  if (typeof properties === "object" && properties !== null && !Array.isArray(properties)) {
    const required = new Set(Array.isArray(record.required) ? record.required.filter((entry): entry is string => typeof entry === "string") : []);
    const sanitizedProperties: SharedJsonRecord = {};
    for (const [propertyName, propertySchema] of Object.entries(properties as SharedJsonRecord)) {
      const childPath = `${context.path}.properties.${propertyName}`;
      const childSchema = sanitizeSchema(propertySchema, { ...context, path: childPath });
      sanitizedProperties[propertyName] = required.has(propertyName) ? childSchema : allowNull(childSchema);
    }
    sanitized.properties = sanitizedProperties;
  }

  return sanitized;
}

function compileSchemaPattern(pattern: string): RegExp {
  if (pattern.length > 2048) {
    throw new Error("Pattern exceeds the supported 2048 character limit");
  }
  return Reflect.construct(RegExp, [pattern, "u"]) as RegExp;
}

function allowNull(schema: unknown): unknown {
  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
    return schema;
  }

  const record = schema as SharedJsonRecord;
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
