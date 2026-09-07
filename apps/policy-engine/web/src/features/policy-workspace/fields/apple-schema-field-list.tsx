import type { JSX } from "react";
import {
  updateAppleSchemaProfileDetails,
  type AppleSchemaEntry,
  type AppleSchemaField,
} from "../../../../../src/browser/apple.js";
import type { JsonRecord } from "../../../shared/editor-contracts.js";
import { AppleSchemaFieldInput } from "./apple-schema-field-input.js";

export function AppleSchemaFieldList(props: {
  entry: AppleSchemaEntry;
  details: JsonRecord;
  values: Record<string, unknown>;
  onChange: (details: JsonRecord) => void;
  onError: (message: string) => void;
}): JSX.Element {
  return (
    <>
      {props.entry.fields.map((field) => (
        <AppleSchemaFieldInput
          key={field.path}
          field={field}
          value={props.values[field.path]}
          onChange={(value) => updateAppleSchemaFieldValue(props, field, value)}
        />
      ))}
    </>
  );
}

function updateAppleSchemaFieldValue(
  props: Pick<Parameters<typeof AppleSchemaFieldList>[0], "details" | "entry" | "values" | "onChange" | "onError">,
  field: AppleSchemaField,
  value: unknown,
): void {
  try {
    const nextValues = { ...props.values };
    if (value === undefined && !field.required) {
      delete nextValues[field.path];
    } else {
      nextValues[field.path] = value;
    }
    props.onChange(updateAppleSchemaProfileDetails(props.details, props.entry, nextValues));
  } catch (error) {
    props.onError(error instanceof Error ? error.message : String(error));
  }
}
