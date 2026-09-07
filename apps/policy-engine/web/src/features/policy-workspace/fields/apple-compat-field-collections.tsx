/** Renders collection-shaped Apple compatibility controls. */
import type { JSX } from "react";
import type { AppleCompatField } from "../../../../../src/browser/apple.js";
import { objectListRows } from "../../../shared/editor-field-values.js";
import { emptyObjectListRow } from "../../../shared/editor-object-list.js";
import { AppleCompatFieldCaption } from "./apple-compat-field-caption.js";
import { AppleCompatScalarFieldInput } from "./apple-compat-field-scalar.js";

export function AppleCompatObjectListInput(props: { field: AppleCompatField; value: unknown; onChange: (value: unknown) => void }): JSX.Element {
  const rows = objectListRows(props.value);
  return (
    <div className="field field-wide object-list-field">
      <AppleCompatFieldCaption field={props.field} />
      <div className="object-list-rows">
        {rows.map((row, rowIndex) => <AppleCompatObjectListRow key={rowIndex} field={props.field} row={row} rowIndex={rowIndex} rows={rows} onChange={props.onChange} />)}
      </div>
      <button type="button" onClick={() => props.onChange([...rows, emptyObjectListRow(props.field)])}>Add row</button>
    </div>
  );
}

function AppleCompatObjectListRow(props: { field: AppleCompatField; row: Record<string, unknown>; rowIndex: number; rows: Record<string, unknown>[]; onChange: (value: unknown) => void }): JSX.Element {
  function changeItem(itemId: string, value: unknown): void {
    props.onChange(props.rows.map((candidate, index) => index === props.rowIndex ? { ...candidate, [itemId]: value } : candidate));
  }

  return (
    <div className="object-list-row">
      <div className="object-list-header">
        <strong>{props.field.label} {props.rowIndex + 1}</strong>
        <button type="button" onClick={() => props.onChange(props.rows.filter((_, index) => index !== props.rowIndex))}>Remove</button>
      </div>
      <div className="object-list-fields">
        {(props.field.itemFields ?? []).map((itemField) => <AppleCompatScalarFieldInput key={itemField.id} field={itemField} value={props.row[itemField.id]} onChange={(value) => changeItem(itemField.id, value)} nested />)}
      </div>
    </div>
  );
}
