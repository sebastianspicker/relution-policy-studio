/** Renders scalar Apple compatibility controls with their documented value semantics. */
import type { JSX } from "react";
import type { AppleCompatField, AppleCompatObjectField } from "../../../../../src/browser/apple.js";
import { entriesToRecord, keyValueEntries, nextHeaderName, replaceKeyValueEntry } from "../../../shared/editor-record-utils.js";
import { AppleCompatBooleanInput, AppleCompatFieldCaption } from "./apple-compat-field-caption.js";
import { appleCompatAccessibleName } from "./apple-compat-field-info.js";
import { AppleCompatNumberInput } from "./apple-compat-field-numeric.js";
import { AppleCompatTextAreaInput, AppleCompatTextInput, fieldClasses, isTextAreaField } from "./apple-compat-field-text.js";

type AppleCompatScalarField = AppleCompatField | AppleCompatObjectField;

type AppleCompatScalarFieldInputProps = {
  field: AppleCompatScalarField;
  value: unknown;
  onChange: (value: unknown) => void;
  nested?: boolean;
};

export function AppleCompatScalarFieldInput(props: AppleCompatScalarFieldInputProps): JSX.Element {
  const classes = fieldClasses(props.nested === true);
  if (props.field.options !== undefined) return <AppleCompatSelectInput field={props.field} value={props.value} onChange={props.onChange} containerClass={classes.field} />;
  if (props.field.kind === "boolean") return <AppleCompatBooleanInput field={props.field} value={props.value} onChange={props.onChange} containerClass={classes.field} />;
  if (props.field.kind === "key-value-list") return <AppleCompatKeyValueField field={props.field} value={props.value} onChange={props.onChange} containerClass={classes.wideField} />;
  if (props.field.kind === "integer" || props.field.kind === "number") return <AppleCompatNumberInput field={props.field} value={props.value} onChange={props.onChange} containerClass={classes.field} />;
  if (isTextAreaField(props.field)) return <AppleCompatTextAreaInput field={props.field} value={props.value} onChange={props.onChange} containerClass={classes.wideField} />;
  return <AppleCompatTextInput field={props.field} value={props.value} onChange={props.onChange} containerClass={classes.field} />;
}

function AppleCompatSelectInput(props: { field: AppleCompatScalarField; value: unknown; onChange: (value: string) => void; containerClass: string }): JSX.Element {
  return (
    <div className={props.containerClass}>
      <AppleCompatFieldCaption field={props.field} />
      <select aria-label={appleCompatAccessibleName(props.field)} value={String(props.value ?? "")} onChange={(event) => props.onChange(event.target.value)}>
        {props.field.options?.map((value) => <option key={value} value={value}>{value}</option>)}
      </select>
    </div>
  );
}

function AppleCompatKeyValueField(props: { field: AppleCompatScalarField; value: unknown; onChange: (value: unknown) => void; containerClass: string }): JSX.Element {
  return (
    <div className={props.containerClass}>
      <AppleCompatFieldCaption field={props.field} />
      <KeyValueListInput value={props.value} onChange={props.onChange} />
    </div>
  );
}

function KeyValueListInput(props: { value: unknown; onChange: (value: unknown) => void }): JSX.Element {
  const entries = keyValueEntries(props.value);
  function changeEntry(index: number, key: string, value: string): void {
    props.onChange(entriesToRecord(replaceKeyValueEntry(entries, index, { key, value })));
  }
  return (
    <div className="key-value-list">
      {entries.map((entry, index) => (
        <div className="key-value-row" key={index}>
          <input aria-label="Header name" value={entry.key} onChange={(event) => changeEntry(index, event.target.value, entry.value)} />
          <input aria-label="Header value" value={entry.value} onChange={(event) => changeEntry(index, entry.key, event.target.value)} />
          <button type="button" onClick={() => props.onChange(entriesToRecord(entries.filter((_, currentIndex) => currentIndex !== index)))}>Remove</button>
        </div>
      ))}
      <button type="button" onClick={() => props.onChange(entriesToRecord([...entries, { key: nextHeaderName(entries), value: "" }]))}>Add header</button>
    </div>
  );
}
