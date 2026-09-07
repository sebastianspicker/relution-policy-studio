import type { JSX } from "react";
import type { AppleSchemaField } from "../../../../../src/browser/apple.js";
import { AppleSchemaFieldCaption, appleSchemaAccessibleName } from "./apple-schema-field-caption.js";
import { SwitchControl } from "../../../ui/SwitchControl.js";

const OMIT_OPTION_VALUE = "__OMIT__";

export function AppleSchemaChoiceField(props: {
  field: AppleSchemaField;
  value: unknown;
  onChange: (value: unknown) => void;
}): JSX.Element {
  if (props.field.enumValues.length > 0) {
    return <AppleSchemaEnumField {...props} />;
  }
  return <AppleSchemaBooleanField {...props} />;
}

function AppleSchemaEnumField(props: { field: AppleSchemaField; value: unknown; onChange: (value: unknown) => void }): JSX.Element {
  const { field } = props;
  const selectValue = !field.required && props.value === undefined ? OMIT_OPTION_VALUE : String(props.value ?? "");
  return (
    <div className="field">
      <AppleSchemaFieldCaption field={field} />
      <select aria-label={appleSchemaAccessibleName(field)} value={selectValue} onChange={(event) => updateEnumValue(props, event.target.value)}>
        {!field.required ? <option value={OMIT_OPTION_VALUE}>Omit</option> : null}
        {field.enumValues.map((value) => <option key={value} value={value}>{value}</option>)}
      </select>
    </div>
  );
}

function AppleSchemaBooleanField(props: { field: AppleSchemaField; value: unknown; onChange: (value: unknown) => void }): JSX.Element {
  if (!props.field.required) {
    const selectValue = props.value === undefined ? OMIT_OPTION_VALUE : String(props.value === true);
    return (
      <div className="field">
        <AppleSchemaFieldCaption field={props.field} />
        <select aria-label={appleSchemaAccessibleName(props.field)} value={selectValue} onChange={(event) => updateOptionalBooleanValue(props, event.target.value)}>
          <option value={OMIT_OPTION_VALUE}>Omit</option>
          <option value="false">False</option>
          <option value="true">True</option>
        </select>
      </div>
    );
  }
  return (
    <div className="field checkbox-field">
      <AppleSchemaFieldCaption field={props.field} />
      <SwitchControl
        checked={props.value === true}
        label={appleSchemaAccessibleName(props.field)}
        onChange={props.onChange}
      />
    </div>
  );
}

function updateEnumValue(props: { field: AppleSchemaField; onChange: (value: unknown) => void }, value: string): void {
  props.onChange(!props.field.required && value === OMIT_OPTION_VALUE ? undefined : value);
}

function updateOptionalBooleanValue(props: { onChange: (value: unknown) => void }, value: string): void {
  props.onChange(value === OMIT_OPTION_VALUE ? undefined : value === "true");
}
