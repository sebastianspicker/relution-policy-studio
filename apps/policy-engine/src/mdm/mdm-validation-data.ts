/** Shared MDM validation data loading and issue helpers. */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { ErrorObject } from "ajv/dist/2020.js";
import yaml from "js-yaml";
import type { MdmValidationIssue } from "./mdm-types.js";

export const POLICY_SCHEMA = "mdm/schemas/mdm-policy-source.schema.json";
export const CONTROL_SCHEMA = "mdm/schemas/mdm-control.schema.json";
export const TEST_EVIDENCE_SCHEMA = "mdm/schemas/mdm-test-evidence.schema.json";
export const SOURCE_MANIFEST = "mdm/evidence/source-manifest.json";
export const TEMPLATE_BUNDLE = "data/relution-26.1.1/template-bundle.json";

export function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function loadYaml<T>(path: string): T {
  const documents: unknown[] = [];
  yaml.loadAll(readFileSync(path, "utf8"), (document) => documents.push(document), { schema: yaml.JSON_SCHEMA });
  if (documents.length !== 1 || documents[0] === undefined) {
    throw new Error(`Expected exactly one YAML document in ${path}`);
  }
  return documents[0] as T;
}

export function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function error(path: string, message: string): MdmValidationIssue {
  return { severity: "error", path, message };
}

export function warning(path: string, message: string): MdmValidationIssue {
  return { severity: "warning", path, message };
}

export function schemaIssues(path: string, errors: ErrorObject[]): MdmValidationIssue[] {
  return errors.map((entry) => error(path, `${entry.instancePath || "/"} ${entry.message ?? "is invalid"}`));
}
