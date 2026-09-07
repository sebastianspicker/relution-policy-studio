import type { JSX } from "react";
import { objectListRows } from "../../../shared/editor-field-values.js";
import { emptyObjectListRow } from "../../../shared/editor-object-list.js";
import type { JsonRecord } from "../../../shared/editor-contracts.js";
import { arrayFieldTextValue, parseArrayEntries } from "./generated-fields-array-values.js";
import { FieldCaption, FieldResetActions, type FieldControlProps } from "./generated-fields-chrome.js";
import { fieldAccessibleName, fieldContainerClass, type FieldTreeNode } from "./generated-fields-tree.js";

export function ScalarArrayFieldInput(props: FieldControlProps): JSX.Element {
  function changeEntries(rawValue: string): void {
    const entries = parseArrayEntries(props.field, rawValue);
    if (entries === undefined) {
      return;
    }
    if (entries.length === 0 && !props.field.required) {
      props.onClear();
      return;
    }
    if (entries.length === 0 && props.field.nullable) {
      props.onSetNull();
      return;
    }
    props.onChange(entries);
  }

  return (
    <div className={fieldContainerClass(props.nested, true)}>
      <FieldCaption field={props.field} />
      <textarea
        aria-label={fieldAccessibleName(props.field)}
        className="compact-textarea"
        value={arrayFieldTextValue(props.field, props.value)}
        onChange={(event) => changeEntries(event.target.value)}
      />
      <FieldResetActions {...props} />
    </div>
  );
}

export function ObjectListFieldInput(props: FieldControlProps & {
  itemTree: FieldTreeNode[];
  renderRowField: (node: FieldTreeNode, row: JsonRecord, rowIndex: number) => JSX.Element | null;
}): JSX.Element {
  const rows = objectListRows(props.value);
  return (
    <div className={`${fieldContainerClass(props.nested, true)} object-list-field`}>
      <FieldCaption field={props.field} />
      <div className="object-list-rows">
        {rows.map((row, rowIndex) => (
          <div className="object-list-row" key={objectListRowKey(row)}>
            <div className="object-list-header">
              <strong>
                {props.field.label} {rowIndex + 1}
              </strong>
              <button type="button" onClick={() => props.onChange(rows.filter((_, currentIndex) => currentIndex !== rowIndex))}>
                Remove
              </button>
            </div>
            <div className="object-list-fields">{props.itemTree.map((node) => props.renderRowField(node, row, rowIndex))}</div>
          </div>
        ))}
      </div>
      <div className="inline-actions">
        <button type="button" onClick={() => props.onChange([...rows, emptyObjectListRow(props.field)])}>
          Add row
        </button>
      </div>
      <FieldResetActions {...props} />
    </div>
  );
}

function objectListRowKey(row: JsonRecord): string {
  const explicit = row.uuid ?? row.id ?? row.identifier ?? row.name;
  return typeof explicit === "string" && explicit.length > 0 ? explicit : JSON.stringify(row);
}
