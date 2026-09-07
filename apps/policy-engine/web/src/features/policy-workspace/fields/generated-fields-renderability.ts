import type { TemplateField } from "../../../../../src/browser/workspace.js";
import { isPrimitiveKind } from "../../../shared/editor-configuration-utils.js";
import type { FieldTreeNode } from "./generated-fields-tree.js";

const renderableScalarArrayItemKinds = new Set(["string", "integer", "number"]);

export function hasRenderableContent(node: FieldTreeNode): boolean {
  return isRenderableField(node.field) || (node.field.kind === "object" && node.children.some(hasRenderableContent));
}

export function isRenderableField(field: TemplateField): boolean {
  if (isPrimitiveKind(field.kind) || field.kind === "object") {
    return true;
  }
  return field.kind === "array" && (renderableScalarArrayItemKinds.has(field.itemKind ?? "") || field.itemKind === "object");
}

export function isJsonBackedField(field: TemplateField): boolean {
  return field.kind === "object" || (field.kind === "array" && field.itemKind === "object" && (field.itemFields?.length ?? 0) === 0);
}
