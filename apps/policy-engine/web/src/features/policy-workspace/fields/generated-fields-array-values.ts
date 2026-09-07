import type { TemplateField } from "../../../../../src/browser/workspace.js";
import { parseIntegerValue, textAreaValue } from "../../../shared/editor-field-values.js";

export function arrayFieldTextValue(field: TemplateField, value: unknown): string {
  if (!Array.isArray(value)) {
    return textAreaValue(value);
  }
  if (field.itemKind === "number" || field.itemKind === "integer") {
    return value
      .filter((entry): entry is number => typeof entry === "number" && Number.isFinite(entry))
      .map((entry) => String(entry))
      .join("\n");
  }
  return textAreaValue(value);
}

export function parseArrayEntries(field: TemplateField, rawValue: string): unknown[] | undefined {
  const entries = rawValue
    .split(/\r?\n/u)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (field.itemKind === "string") {
    return entries;
  }
  if (field.itemKind === "integer") {
    const numericEntries = entries.map((entry) => parseIntegerValue(entry));
    return numericEntries.every((entry) => entry !== undefined) ? numericEntries : undefined;
  }
  if (field.itemKind === "number") {
    const numericEntries = entries.map((entry) => Number(entry));
    return numericEntries.every((entry) => Number.isFinite(entry)) ? numericEntries : undefined;
  }
  return undefined;
}
