import type { TemplateField } from "../../../../../src/browser/workspace.js";
import { deletePath, getPath } from "../../../shared/editor-object-path.js";
import type { JsonRecord } from "../../../shared/editor-contracts.js";

export type FieldTreeNode = {
  readonly field: TemplateField;
  readonly children: FieldTreeNode[];
};

export function buildFieldTree(fields: TemplateField[]): FieldTreeNode[] {
  const nodes = new Map<string, FieldTreeNode>();
  for (const field of fields) {
    nodes.set(field.path, { field, children: [] });
  }
  const roots: FieldTreeNode[] = [];
  for (const field of fields) {
    const node = nodes.get(field.path);
    if (node === undefined) {
      continue;
    }
    const parent = parentFieldPath(field.path);
    const parentNode = parent === undefined ? undefined : nodes.get(parent);
    if (parentNode === undefined) {
      roots.push(node);
    } else {
      parentNode.children.push(node);
    }
  }
  return roots;
}

function parentFieldPath(path: string): string | undefined {
  const segments = path.split(".");
  return segments.length > 1 ? segments.slice(0, -1).join(".") : undefined;
}

export function fieldAccessibleName(field: TemplateField): string {
  return `${field.label} (${field.path})`;
}

export function safeFieldId(path: string): string {
  return `generated-${path.replaceAll(/[^a-z0-9_-]+/giu, "-")}`;
}

export function fieldContainerClass(nested: boolean, wide = false): string {
  if (nested) {
    return wide ? "nested-field nested-field-wide" : "nested-field";
  }
  return wide ? "field field-wide" : "field";
}

export function deletePathAndPrune(record: JsonRecord, path: string): void {
  deletePath(record, path);
  const segments = path.split(".");
  for (let depth = segments.length - 1; depth > 0; depth -= 1) {
    const parent = getPath(record, segments.slice(0, depth).join("."));
    if (!isRecord(parent) || Object.keys(parent).length > 0) {
      break;
    }
    deletePath(record, segments.slice(0, depth).join("."));
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
