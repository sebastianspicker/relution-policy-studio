/** Validates generated policy settings and their declared template fields. */
import type { MdmPolicySource, MdmValidationIssue } from "./mdm-types.js";
import { error } from "./mdm-validation-data.js";
import { type ConfigurationTemplate, type TemplateField } from "./mdm-validation-policy.js";
import { flattenMdmValues, validateMdmFieldValue } from "./mdm-validation-policy-values.js";

export function validatePolicySettings(path: string, source: MdmPolicySource, templates: Map<string, ConfigurationTemplate>, issues: MdmValidationIssue[]): void {
  const seenTypes = new Set<string>();
  const placeholders = new Set(source.environment_placeholders);
  for (const setting of source.settings) validatePolicySetting(path, source, setting, templates, seenTypes, placeholders, issues);
}

function validatePolicySetting(
  path: string,
  source: MdmPolicySource,
  setting: MdmPolicySource["settings"][number],
  templates: Map<string, ConfigurationTemplate>,
  seenTypes: Set<string>,
  placeholders: Set<string>,
  issues: MdmValidationIssue[],
): void {
  if (Object.keys(setting.values).length === 0) issues.push(error(path, `${setting.configuration_type} must declare explicit values`));
  const template = templates.get(setting.configuration_type);
  if (template === undefined) {
    issues.push(error(path, `unsupported configuration type ${setting.configuration_type}`));
    return;
  }
  if (seenTypes.has(setting.configuration_type)) issues.push(error(path, `duplicate configuration type ${setting.configuration_type}`));
  seenTypes.add(setting.configuration_type);
  validateTemplateCompatibility(path, source, setting.configuration_type, template, issues);
  validateSettingFields(path, setting.configuration_type, setting.values, template.fields, placeholders, issues);
}

function validateTemplateCompatibility(path: string, source: MdmPolicySource, type: string, template: ConfigurationTemplate, issues: MdmValidationIssue[]): void {
  if (!template.platforms.includes(source.platform)) issues.push(error(path, `${type} does not support ${source.platform}`));
  if (!template.enrollmentTypes.includes(source.enrollment_model)) issues.push(error(path, `${type} does not support enrollment ${source.enrollment_model}`));
}

function validateSettingFields(
  path: string,
  type: string,
  values: Record<string, unknown>,
  templateFields: TemplateField[],
  placeholders: Set<string>,
  issues: MdmValidationIssue[],
): void {
  const fields = new Map(templateFields.map((field) => [field.path, field]));
  for (const [fieldPath, value] of flattenMdmValues(values)) {
    const field = fields.get(fieldPath);
    if (field === undefined) issues.push(error(path, `${type} has unknown field ${fieldPath}`));
    else validateMdmFieldValue(path, type, field, value, placeholders, issues);
  }
}
