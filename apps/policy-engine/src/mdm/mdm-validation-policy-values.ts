/** Flattens nested values and validates policy placeholder and field values. */
import type { MdmValidationIssue } from "./mdm-types.js";
import { error } from "./mdm-validation-data.js";
import type { TemplateField } from "./mdm-validation-policy.js";
import { asRecord } from "../platform/serialization/json-guards.js";

const SECRET_KEY = /(?:password|passphrase|private.?key|client.?secret|api.?token|preshared.?key)/iu;
const PLACEHOLDER = /^\$\{ENV:[A-Z][A-Z0-9_]*\}$/u;

export function flattenMdmValues(value: Record<string, unknown>, prefix = ""): Array<[string, unknown]> {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix.length === 0 ? key : `${prefix}.${key}`;
    const record = asRecord(child);
    return record === undefined ? [[path, child]] : flattenMdmValues(record, path);
  });
}

export function validateMdmFieldValue(path: string, type: string, field: TemplateField, value: unknown, placeholders: Set<string>, issues: MdmValidationIssue[]): void {
  if (typeof value === "string" && value.startsWith("${")) {
    if (!PLACEHOLDER.test(value) || !placeholders.has(value)) issues.push(error(path, `${type}.${field.path} has unknown or production placeholder ${value}`));
    return;
  }
  if (SECRET_KEY.test(field.path) && value !== "" && value !== null) issues.push(error(path, `${type}.${field.path} contains a literal secret-like value`));
  if (field.enumValues.length > 0 && !field.enumValues.includes(value)) issues.push(error(path, `${type}.${field.path} has unsupported enumeration ${String(value)}`));
  const expected = field.kind === "integer" ? "number" : field.kind;
  if (["string", "number", "boolean"].includes(expected) && typeof value !== expected) issues.push(error(path, `${type}.${field.path} must be ${expected}`));
}
