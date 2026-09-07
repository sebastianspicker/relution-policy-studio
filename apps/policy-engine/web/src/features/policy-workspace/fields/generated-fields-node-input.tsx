import type { JSX } from "react";
import type { JsonRecord } from "../../../shared/editor-contracts.js";
import { ObjectListFieldInput, ScalarArrayFieldInput } from "./generated-fields-arrays.js";
import { JsonFieldInput, type FieldControlProps } from "./generated-fields-chrome.js";
import { PrimitiveFieldInput } from "./generated-fields-controls.js";
import { isJsonBackedField } from "./generated-fields-renderability.js";
import { buildFieldTree, type FieldTreeNode } from "./generated-fields-tree.js";
const scalarArrayItemKinds = new Set(["string", "integer", "number"]);

export function GeneratedFieldInput(props: FieldControlProps & {
  renderRowField: (node: FieldTreeNode, row: JsonRecord, rowIndex: number, onChange: (nextRow: JsonRecord) => void) => JSX.Element | null;
}): JSX.Element {
  if (props.field.kind === "array" && props.field.itemKind === "object" && (props.field.itemFields?.length ?? 0) > 0) {
    return (
      <ObjectListFieldInput
        {...props}
        itemTree={buildFieldTree(props.field.itemFields ?? [])}
        renderRowField={(node, row, rowIndex) => props.renderRowField(node, row, rowIndex, (nextRow) => replaceRow(props.value, rowIndex, nextRow, props.onChange))}
      />
    );
  }
  if (props.field.kind === "array" && scalarArrayItemKinds.has(props.field.itemKind ?? "")) {
    return <ScalarArrayFieldInput {...props} />;
  }
  if (isJsonBackedField(props.field)) {
    return <JsonFieldInput {...props} />;
  }
  return <PrimitiveFieldInput {...props} />;
}

function replaceRow(value: unknown, rowIndex: number, nextRow: JsonRecord, onChange: (value: unknown) => void): void {
  const rows = Array.isArray(value) ? value : [];
  onChange(rows.map((row, currentIndex) => (currentIndex === rowIndex ? nextRow : row)));
}
