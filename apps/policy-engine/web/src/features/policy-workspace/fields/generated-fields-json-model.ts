import type { TemplateField } from "../../../../../src/browser/workspace.js";
import type { JsonRecord } from "../../../shared/editor-contracts.js";

export function formatJsonDraft(value: unknown): string {
  if (value === undefined) {
    return "";
  }
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

export function parseJsonDraft(field: TemplateField, draft: string): unknown {
  const trimmed = draft.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  const parsed = JSON.parse(trimmed) as unknown;
  if (parsed === null) {
    if (field.nullable) {
      return null;
    }
    throw new Error(`${field.label} must not be null.`);
  }
  if (field.kind === "object") {
    if (!isRecord(parsed)) {
      throw new Error(`${field.label} must be a JSON object.`);
    }
    return parsed;
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`${field.label} must be a JSON array.`);
  }
  if (field.itemKind === "object" && !parsed.every((entry) => isRecord(entry))) {
    throw new Error(`${field.label} must contain only JSON objects.`);
  }
  if (field.itemKind === "number" && !parsed.every((entry) => typeof entry === "number" && Number.isFinite(entry))) {
    throw new Error(`${field.label} must contain only finite numbers.`);
  }
  return parsed;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
