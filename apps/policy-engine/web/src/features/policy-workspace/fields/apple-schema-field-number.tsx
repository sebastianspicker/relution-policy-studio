import type { JSX } from "react";
import type { AppleSchemaField } from "../../../../../src/browser/apple.js";
import { parseIntegerValue } from "../../../shared/editor-field-values.js";
import { AppleSchemaFieldCaption, appleSchemaAccessibleName } from "./apple-schema-field-caption.js";

export function AppleSchemaNumberField(props: { field: AppleSchemaField; value: unknown; onChange: (value: unknown) => void }): JSX.Element {
  const { field } = props;
  return (
    <div className="field">
      <AppleSchemaFieldCaption field={field} />
      <input
        aria-label={appleSchemaAccessibleName(field)}
        type="number"
        step={field.kind === "number" ? "any" : "1"}
        value={props.value === undefined ? "" : String(props.value)}
        onChange={(event) => updateNumberValue(props, event.target.value)}
      />
    </div>
  );
}

function updateNumberValue(props: { field: AppleSchemaField; onChange: (value: unknown) => void }, value: string): void {
  if (!props.field.required && value.length === 0) {
    props.onChange(undefined);
    return;
  }
  if (props.field.kind === "integer") {
    const parsed = parseIntegerValue(value);
    if (parsed !== undefined) {
      props.onChange(parsed);
    }
    return;
  }
  props.onChange(Number(value));
}
