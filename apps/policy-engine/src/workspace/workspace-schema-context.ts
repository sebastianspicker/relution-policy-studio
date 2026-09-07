/** Caches prepared JSON schemas and their AJV validators per template bundle. */
import { Ajv, type ValidateFunction } from "ajv/dist/ajv.js";
import type { RelutionTemplateBundle } from "../contracts/template.js";
import type { SchemaCompatibilityIssue, WorkspaceValidationError } from "./types.js";
import type { JsonRecord } from "../platform/serialization/json-guards.js";
import { prepareValidationSchemas } from "./workspace-schema-sanitizer.js";

export interface ValidatorContext {
  ajv: Ajv;
  validators: Map<string, ValidateFunction>;
  schemaCompatibilityIssues: SchemaCompatibilityIssue[];
}

const validatorContexts = new WeakMap<RelutionTemplateBundle, ValidatorContext>();

export function getValidatorContext(bundle: RelutionTemplateBundle): ValidatorContext {
  const cached = validatorContexts.get(bundle);
  if (cached !== undefined) {
    return cached;
  }

  const prepared = prepareValidationSchemas(bundle.schemas);
  const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: false });
  ajv.addSchema({ $id: "relution-openapi", components: { schemas: prepared.schemas } });
  const context = { ajv, validators: new Map<string, ValidateFunction>(), schemaCompatibilityIssues: prepared.issues };
  validatorContexts.set(bundle, context);
  return context;
}

export function getSchemaValidator(context: ValidatorContext, schemaName: string): ValidateFunction {
  const cached = context.validators.get(schemaName);
  if (cached !== undefined) {
    return cached;
  }
  const validate = context.ajv.compile({ $ref: `relution-openapi#/components/schemas/${schemaName}` });
  context.validators.set(schemaName, validate);
  return validate;
}

export function schemaValidationErrors(path: string, details: JsonRecord, validate: ValidateFunction): WorkspaceValidationError[] {
  return validate(details)
    ? []
    : (validate.errors ?? []).map((error) => ({ path: `${path}.details${error.instancePath}`, message: error.message ?? error.keyword }));
}
