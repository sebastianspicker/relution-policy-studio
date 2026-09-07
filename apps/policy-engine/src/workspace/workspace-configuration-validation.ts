/** Validates policy configuration entries against templates and prepared schemas. */
import { inspectMobileConfigText } from "../platform/serialization/plist-inspection.js";
import { findTemplate, type RelutionTemplateBundle } from "../contracts/template.js";
import type { PolicyWorkspace, WorkspaceValidationError } from "./types.js";
import { workspaceConfigurationDetails, workspaceConfigurationType, incompatibleWorkspaceConfigurationMessage, invalidWorkspacePolicyPlatformMessage } from "./workspace-model.js";
import { requireRecord, stringValue, type JsonRecord } from "../platform/serialization/json-guards.js";
import { getSchemaValidator, schemaValidationErrors, type ValidatorContext } from "./workspace-schema-context.js";

export function validateWorkspacePolicy(policy: PolicyWorkspace["policies"][number], bundle: RelutionTemplateBundle, context: ValidatorContext): WorkspaceValidationError[] {
  const platform = stringValue(policy.document.platform);
  if (platform === undefined || !bundle.platforms.includes(platform)) {
    return [{ path: policy.path, message: invalidWorkspacePolicyPlatformMessage(policy.document.platform) }];
  }
  const versions = Array.isArray(policy.document.versions) ? policy.document.versions : [];
  return versions.flatMap((version, index) => validatePolicyVersion(policy.path, platform, version, index, bundle, context));
}

function validatePolicyVersion(policyPath: string, platform: string, value: unknown, index: number, bundle: RelutionTemplateBundle, context: ValidatorContext): WorkspaceValidationError[] {
  const version = requireRecord(value, `${policyPath}.versions[${index}]`);
  const configurations = Array.isArray(version.configurations) ? version.configurations : [];
  const seen = new Set<string>();
  return configurations.flatMap((configuration, configurationIndex) =>
    validateConfiguration(configuration, `${policyPath}.versions[${index}].configurations[${configurationIndex}]`, platform, seen, bundle, context),
  );
}

function validateConfiguration(value: unknown, path: string, platform: string, seen: Set<string>, bundle: RelutionTemplateBundle, context: ValidatorContext): WorkspaceValidationError[] {
  const type = workspaceConfigurationType(value);
  if (type === undefined) {
    return [{ path, message: "Configuration details.type is missing" }];
  }
  const template = findTemplate(bundle, type);
  if (template === undefined) {
    return [{ path, message: `Unknown configuration type: ${type}` }];
  }
  const errors = configurationTemplateErrors(path, platform, type, seen, template.platforms, template.multiConfig);
  const details = workspaceConfigurationDetails(value);
  return details === undefined
    ? [...errors, { path, message: "Configuration details object is missing" }]
    : [...errors, ...schemaValidationErrors(path, details, getSchemaValidator(context, template.schemaName)), ...mobileConfigValidationErrors(details).map((message) => ({ path: `${path}.details.rawContent`, message }))];
}

function configurationTemplateErrors(path: string, platform: string, type: string, seen: Set<string>, platforms: string[], multiConfig: boolean): WorkspaceValidationError[] {
  const errors: WorkspaceValidationError[] = [];
  if (!platforms.includes(platform)) {
    errors.push({ path, message: incompatibleWorkspaceConfigurationMessage(type, platform) });
  }
  if (!multiConfig && seen.has(type)) {
    errors.push({ path, message: `${type} is not multi-config and appears more than once` });
  }
  seen.add(type);
  return errors;
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
  return declaredSignatureState === "signed-invalid" || inspectedSignatureState === "signed-invalid"
    ? ["Mobileconfig XML is invalid or incomplete"]
    : [];
}
