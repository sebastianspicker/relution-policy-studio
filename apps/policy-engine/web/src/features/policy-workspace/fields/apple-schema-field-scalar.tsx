import type { JSX } from "react";
import type { AppleSchemaField } from "../../../../../src/browser/apple.js";
import { textAreaValue } from "../../../shared/editor-field-values.js";
import { AppleSchemaFieldCaption, appleSchemaAccessibleName } from "./apple-schema-field-caption.js";
import { AppleSchemaNumberField } from "./apple-schema-field-number.js";

export function AppleSchemaScalarField(props: {
  field: AppleSchemaField;
  value: unknown;
  onChange: (value: unknown) => void;
}): JSX.Element {
  if (props.field.kind === "integer" || props.field.kind === "number") {
    return <AppleSchemaNumberField {...props} />;
  }
  if (props.field.kind === "list" || props.field.kind === "json" || props.field.kind === "data" || props.field.kind === "textarea") {
    return <AppleSchemaTextAreaField {...props} />;
  }
  return <AppleSchemaTextField {...props} />;
}

function AppleSchemaTextAreaField(props: { field: AppleSchemaField; value: unknown; onChange: (value: unknown) => void }): JSX.Element {
  const { field } = props;
  return (
    <div className="field">
      <AppleSchemaFieldCaption field={field} />
      <textarea
        aria-label={appleSchemaAccessibleName(field)}
        className={field.kind === "json" || field.kind === "data" ? "compact-code-textarea" : "compact-textarea"}
        value={textAreaValue(props.value)}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </div>
  );
}

function AppleSchemaTextField(props: { field: AppleSchemaField; value: unknown; onChange: (value: unknown) => void }): JSX.Element {
  return (
    <div className="field">
      <AppleSchemaFieldCaption field={props.field} />
      <input aria-label={appleSchemaAccessibleName(props.field)} value={String(props.value ?? "")} onChange={(event) => props.onChange(event.target.value)} />
    </div>
  );
}
