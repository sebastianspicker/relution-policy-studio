import type { JSX } from "react";
import type { AppleSchemaField } from "../../../../../src/browser/apple.js";
import { AppleSchemaChoiceField } from "./apple-schema-field-choice.js";
import { AppleSchemaScalarField } from "./apple-schema-field-scalar.js";

export function AppleSchemaFieldInput(props: {
  field: AppleSchemaField;
  value: unknown;
  onChange: (value: unknown) => void;
}): JSX.Element {
  if (props.field.enumValues.length > 0 || props.field.kind === "boolean") {
    return <AppleSchemaChoiceField {...props} />;
  }
  return <AppleSchemaScalarField {...props} />;
}
