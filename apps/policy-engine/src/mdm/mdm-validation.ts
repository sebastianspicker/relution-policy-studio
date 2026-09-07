/** Coordinates MDM source, schema, and composition validation. */
import { resolve } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { MdmValidationIssue, MdmValidationReport } from "./mdm-types.js";
import { POLICY_SCHEMA, TEMPLATE_BUNDLE, error, loadJson, warning } from "./mdm-validation-data.js";
import { loadControlCatalogue, validateControlCatalogue, validateTestEvidenceTemplate } from "./mdm-validation-catalogue.js";
import { type TemplateBundle, generatedPolicyName } from "./mdm-validation-policy.js";
import { validatePolicySources } from "./mdm-validation-policy-entry.js";
import { loadMdmPolicySources, loadMdmSourceManifest, verifyMdmSources } from "./mdm-validation-source.js";

export { generatedPolicyName, loadMdmPolicySources, loadMdmSourceManifest, verifyMdmSources };

export function validateMdm(root = process.cwd()): MdmValidationReport {
  const issues: MdmValidationIssue[] = [];
  const policies = loadMdmPolicySources(root);
  const bundle = loadJson<TemplateBundle>(resolve(root, TEMPLATE_BUNDLE));
  const catalogue = loadControlCatalogue(root);
  validateControlCatalogue(root, catalogue, issues);
  validateTestEvidenceTemplate(root, issues);
  validateTemplateVersion(bundle, issues);
  validatePolicies(root, policies, bundle, new Set(catalogue.controls.map((control) => control.control_id)), issues);
  addOfflineEvidenceWarnings(root, issues);
  return validationReport(root, bundle, policies, issues);
}

function validateTemplateVersion(bundle: TemplateBundle, issues: MdmValidationIssue[]): void {
  if (bundle.serverVersion !== "26.1.1") issues.push(error(TEMPLATE_BUNDLE, `expected Relution 26.1.1, got ${bundle.serverVersion}`));
}

function validatePolicies(
  root: string,
  policies: ReturnType<typeof loadMdmPolicySources>,
  bundle: TemplateBundle,
  controlIds: Set<string>,
  issues: MdmValidationIssue[],
): void {
  const schema = loadJson<Record<string, unknown>>(resolve(root, POLICY_SCHEMA));
  const validateSchema = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  validatePolicySources(policies, new Map(bundle.configurationTypes.map((template) => [template.type, template])), controlIds, validateSchema, issues);
}

function addOfflineEvidenceWarnings(root: string, issues: MdmValidationIssue[]): void {
  for (const source of loadMdmSourceManifest(root).sources) {
    if (source.extraction.status !== "extracted") {
      issues.push(warning(source.local_path, `offline evidence is ${source.extraction.status}; verify-sources and generate remain blocked`));
    }
  }
}

function validationReport(
  root: string,
  bundle: TemplateBundle,
  policies: ReturnType<typeof loadMdmPolicySources>,
  issues: MdmValidationIssue[],
): MdmValidationReport {
  return {
    ok: !issues.some((issue) => issue.severity === "error"),
    relution_version: bundle.serverVersion,
    source_count: loadMdmSourceManifest(root).sources.length,
    policy_count: policies.length,
    active_policy_count: policies.filter(({ source }) => source.status === "active").length,
    issues,
  };
}
