import type { JSX } from "react";
import { parseIntegerValue } from "../../../shared/editor-field-values.js";
import { BooleanFieldInput, FieldCaption, FieldResetActions, type FieldControlProps } from "./generated-fields-chrome.js";
import { fieldAccessibleName, fieldContainerClass } from "./generated-fields-tree.js";

const NULL_OPTION_VALUE = "__NULL__";

export function PrimitiveFieldInput(props: FieldControlProps): JSX.Element {
  if (props.field.enumValues.length > 0) {
    return <EnumFieldInput {...props} />;
  }
  if (props.field.kind === "boolean") {
    return <BooleanFieldInput {...props} />;
  }
  if (props.field.kind === "integer" || props.field.kind === "number") {
    return <NumericFieldInput {...props} />;
  }
  return (
    <div className={fieldContainerClass(props.nested)}>
      <FieldCaption field={props.field} />
      <input aria-label={fieldAccessibleName(props.field)} value={String(props.value ?? "")} onChange={(event) => props.onChange(event.target.value)} />
      <FieldResetActions {...props} />
    </div>
  );
}

function EnumFieldInput(props: FieldControlProps): JSX.Element {
  const selectValue = props.field.nullable && (props.value === null || props.value === undefined) ? NULL_OPTION_VALUE : String(props.value ?? "");
  return (
    <div className={fieldContainerClass(props.nested)}>
      <FieldCaption field={props.field} />
      <select
        aria-label={fieldAccessibleName(props.field)}
        value={selectValue}
        onChange={(event) => props.onChange(props.field.nullable && event.target.value === NULL_OPTION_VALUE ? null : event.target.value)}
      >
        {props.field.nullable ? <option value={NULL_OPTION_VALUE}>null</option> : null}
        {props.field.enumValues.map((value) => (
          <option key={value} value={value}>
            {props.field.enumLabels[value] ?? value}
          </option>
        ))}
      </select>
      <FieldResetActions {...props} />
    </div>
  );
}

function NumericFieldInput(props: FieldControlProps): JSX.Element {
  function changeNumericValue(rawValue: string): void {
    if (rawValue.length === 0) {
      if (!props.field.required) {
        props.onClear();
        return;
      }
      if (props.field.nullable) {
        props.onSetNull();
        return;
      }
    }
    if (props.field.kind === "integer") {
      const parsed = parseIntegerValue(rawValue);
      if (parsed !== undefined) {
        props.onChange(parsed);
      }
      return;
    }
    props.onChange(Number(rawValue));
  }

  return (
    <div className={fieldContainerClass(props.nested)}>
      <FieldCaption field={props.field} />
      <input
        aria-label={fieldAccessibleName(props.field)}
        type="number"
        value={props.value === undefined || props.value === null ? "" : String(props.value)}
        onChange={(event) => changeNumericValue(event.target.value)}
      />
      <FieldResetActions {...props} />
    </div>
  );
}
