/** Renders text-shaped Apple compatibility controls. */
import type { JSX } from "react";
import type { AppleCompatField, AppleCompatObjectField } from "../../../../../src/browser/apple.js";
import { textAreaValue } from "../../../shared/editor-field-values.js";
import { AppleCompatFieldCaption } from "./apple-compat-field-caption.js";
import { appleCompatAccessibleName } from "./apple-compat-field-info.js";

type AppleCompatScalarField = AppleCompatField | AppleCompatObjectField;

export function AppleCompatTextAreaInput(props: { field: AppleCompatScalarField; value: unknown; onChange: (value: string) => void; containerClass: string }): JSX.Element {
  return (
    <div className={props.containerClass}>
      <AppleCompatFieldCaption field={props.field} />
      <textarea aria-label={appleCompatAccessibleName(props.field)} className={props.field.kind === "json" ? "compact-code-textarea" : "compact-textarea"} value={textAreaValue(props.value)} onChange={(event) => props.onChange(event.target.value)} />
    </div>
  );
}

export function AppleCompatTextInput(props: { field: AppleCompatScalarField; value: unknown; onChange: (value: string) => void; containerClass: string }): JSX.Element {
  return (
    <div className={props.containerClass}>
      <AppleCompatFieldCaption field={props.field} />
      <input aria-label={appleCompatAccessibleName(props.field)} value={String(props.value ?? "")} onChange={(event) => props.onChange(event.target.value)} />
    </div>
  );
}

export function fieldClasses(nested: boolean): { field: string; wideField: string } {
  return nested ? { field: "nested-field", wideField: "nested-field nested-field-wide" } : { field: "field", wideField: "field field-wide" };
}

export function isTextAreaField(field: AppleCompatScalarField): boolean {
  return field.kind === "textarea" || field.kind === "list" || field.kind === "json";
}
