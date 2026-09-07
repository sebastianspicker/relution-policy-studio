/** Validates legacy control and test-evidence inputs against current schemas. */
import { resolve } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { MdmControl, MdmValidationIssue } from "./mdm-types.js";
import { CONTROL_SCHEMA, TEST_EVIDENCE_SCHEMA, loadJson, loadYaml, schemaIssues } from "./mdm-validation-data.js";

interface LegacyControl {
  control_id: string;
  title: string;
  classification: MdmControl["classification"];
  sources: string[];
  applicability: Record<string, unknown>;
  configuration: { baseline?: unknown; variants?: unknown[] };
  impacts: Record<string, unknown>;
  relution: Record<string, unknown>;
  verification: string;
  exceptions: Record<string, unknown>;
}

export interface ControlCatalogue {
  common?: { residual_and_bypass_risk?: string; review_frequency?: string };
  controls: LegacyControl[];
}

export function loadControlCatalogue(root: string): ControlCatalogue {
  return loadYaml<ControlCatalogue>(resolve(root, "mdm/controls/control-catalogue.yaml"));
}

export function validateControlCatalogue(root: string, catalogue: ControlCatalogue, issues: MdmValidationIssue[]): void {
  const schema = loadJson<Record<string, unknown>>(resolve(root, CONTROL_SCHEMA));
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  for (const control of catalogue.controls) {
    if (!validate(normalizeControl(control, catalogue.common))) {
      issues.push(...schemaIssues(`mdm/controls/control-catalogue.yaml#${control.control_id}`, validate.errors ?? []));
    }
  }
}

export function validateTestEvidenceTemplate(root: string, issues: MdmValidationIssue[]): void {
  const schema = loadJson<Record<string, unknown>>(resolve(root, TEST_EVIDENCE_SCHEMA));
  const validate = new Ajv2020({ allErrors: true, strict: false, validateFormats: false }).compile(schema);
  const evidence = loadYaml<unknown>(resolve(root, "mdm/evidence/test-evidence-template.yaml"));
  if (!validate(evidence)) issues.push(...schemaIssues("mdm/evidence/test-evidence-template.yaml", validate.errors ?? []));
}

function normalizeControl(control: LegacyControl, common: ControlCatalogue["common"]): MdmControl {
  return {
    schema_version: 1,
    control_id: control.control_id,
    title: control.title,
    classification: control.classification,
    source_mappings: control.sources.map(sourceMapping),
    applicability: control.applicability,
    platform_prerequisites: Array.isArray(control.applicability.prerequisites) ? control.applicability.prerequisites.map(String) : [],
    proposed_value: control.configuration.baseline,
    variants: (control.configuration.variants ?? []).map((value) => ({ value })),
    impacts: control.impacts,
    residual_risk: common?.residual_and_bypass_risk ?? "record per model",
    relution_target: control.relution,
    verification: { method: control.verification },
    exception: control.exceptions,
    review_cadence: common?.review_frequency ?? "annual-and-on-material-change",
  };
}

function sourceMapping(reference: string): MdmControl["source_mappings"][number] {
  const [source_id = reference, control_reference = reference] = reference.split(":", 2);
  return { source_id, control_reference, page: null, verification_status: "unverifiable" };
}
