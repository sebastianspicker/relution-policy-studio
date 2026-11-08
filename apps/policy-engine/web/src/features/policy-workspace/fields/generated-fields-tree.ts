import type { TemplateField } from "../../../../../src/browser/workspace.js";

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
