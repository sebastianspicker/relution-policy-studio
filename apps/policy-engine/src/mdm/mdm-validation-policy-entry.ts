/** Validates policy identities, lifecycle state, schema, and dependencies. */
import type { ValidateFunction } from "ajv";
import type { MdmPolicySource, MdmValidationIssue } from "./mdm-types.js";
import { error, schemaIssues } from "./mdm-validation-data.js";
import { validatePolicyComposition } from "./mdm-validation-policy-composition.js";
import { generatedPolicyName, type ConfigurationTemplate, type MdmPolicyEntry } from "./mdm-validation-policy.js";
import { validatePolicySettings } from "./mdm-validation-policy-settings.js";

export function validatePolicySources(
  policies: MdmPolicyEntry[],
  templates: Map<string, ConfigurationTemplate>,
  controlIds: Set<string>,
  validateSchema: ValidateFunction,
  issues: MdmValidationIssue[],
): void {
  const policyIds = new Set<string>();
  const generatedNames = new Set<string>();
  for (const entry of policies) validatePolicyEntry(entry, templates, controlIds, validateSchema, policyIds, generatedNames, issues);
  validateDependencies(policies, policyIds, issues);
  validatePolicyComposition(policies, issues);
}

function validatePolicyEntry(
  { path, source }: MdmPolicyEntry,
  templates: Map<string, ConfigurationTemplate>,
  controlIds: Set<string>,
  validateSchema: ValidateFunction,
  policyIds: Set<string>,
  generatedNames: Set<string>,
  issues: MdmValidationIssue[],
): void {
  if (!validateSchema(source)) issues.push(...schemaIssues(path, validateSchema.errors ?? []));
  reportDuplicatePolicy(path, source.policy_id, policyIds, issues);
  validateControlReferences(path, source, controlIds, issues);
  validatePolicyLifecycle(path, source, issues);
  reportDuplicateGeneratedName(path, source, generatedNames, issues);
  validatePolicySettings(path, source, templates, issues);
}

function reportDuplicatePolicy(path: string, policyId: string, policyIds: Set<string>, issues: MdmValidationIssue[]): void {
  if (policyIds.has(policyId)) issues.push(error(path, `duplicate policy ID ${policyId}`));
  policyIds.add(policyId);
}

function validateControlReferences(path: string, source: MdmPolicySource, controlIds: Set<string>, issues: MdmValidationIssue[]): void {
  for (const control of [...source.controls, ...source.settings.flatMap((setting) => setting.control_ids)]) {
    if (!controlIds.has(control)) issues.push(error(path, `unknown control reference ${control}`));
  }
}

function validatePolicyLifecycle(path: string, source: MdmPolicySource, issues: MdmValidationIssue[]): void {
  if (source.production_ready) issues.push(error(path, "reference sources must not claim production readiness"));
  if (source.status === "active" && (source.rings.length !== 1 || source.rings[0] !== "LAB")) issues.push(error(path, "active sources may initially generate LAB only"));
  if (source.status !== "active" && source.settings.length > 0) issues.push(error(path, `${source.status} sources must not contain deployable settings`));
}

function reportDuplicateGeneratedName(path: string, source: MdmPolicySource, names: Set<string>, issues: MdmValidationIssue[]): void {
  const name = generatedPolicyName(source);
  if (names.has(name)) issues.push(error(path, `duplicate generated name ${name}`));
  names.add(name);
}

function validateDependencies(policies: MdmPolicyEntry[], policyIds: Set<string>, issues: MdmValidationIssue[]): void {
  for (const { path, source } of policies) {
    for (const dependency of source.dependencies) {
      if (!policyIds.has(dependency)) issues.push(error(path, `unknown policy dependency ${dependency}`));
    }
  }
}
