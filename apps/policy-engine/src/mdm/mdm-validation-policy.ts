/** Declares MDM template and policy-entry contracts used by validators. */
import type { MdmPolicySource } from "./mdm-types.js";

export interface TemplateField {
  path: string;
  kind: string;
  enumValues: unknown[];
}

export interface ConfigurationTemplate {
  type: string;
  platforms: string[];
  enrollmentTypes: string[];
  fields: TemplateField[];
}

export interface TemplateBundle {
  serverVersion: string;
  configurationTypes: ConfigurationTemplate[];
}

export type MdmPolicyEntry = { path: string; source: MdmPolicySource };

export function generatedPolicyName(source: MdmPolicySource): string {
  return `${policyNameSegment(source.platform)}-${policyNameSegment(source.model)}-${policyNameSegment(source.purpose)}-L${source.layer}-LAB-v1`;
}

function policyNameSegment(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]+/gu, "-").replace(/^-|-$/gu, "");
}
