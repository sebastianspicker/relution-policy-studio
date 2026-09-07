/** Renders numeric Apple compatibility controls without coercing invalid values. */
import type { JSX } from "react";
import type { AppleCompatField, AppleCompatObjectField } from "../../../../../src/browser/apple.js";
import { parseIntegerValue } from "../../../shared/editor-field-values.js";
import { AppleCompatFieldCaption } from "./apple-compat-field-caption.js";
import { appleCompatAccessibleName } from "./apple-compat-field-info.js";

export function AppleCompatNumberInput(props: { field: AppleCompatField | AppleCompatObjectField; value: unknown; onChange: (value: unknown) => void; containerClass: string }): JSX.Element {
  const numberKind = props.field.kind === "integer" ? "integer" : "number";
  return (
    <div className={props.containerClass}>
      <AppleCompatFieldCaption field={props.field} />
      <input aria-label={appleCompatAccessibleName(props.field)} type="number" step={numberKind === "number" ? "any" : "1"} value={props.value === undefined ? "" : String(props.value)} onChange={(event) => changeNumber(numberKind, event.target.value, props.onChange)} />
    </div>
  );
}

function changeNumber(kind: "integer" | "number", rawValue: string, onChange: (value: unknown) => void): void {
  if (rawValue.length === 0) {
    onChange(undefined);
    return;
  }
  const parsed = kind === "integer" ? parseIntegerValue(rawValue) : Number(rawValue);
  if ((kind === "integer" && parsed !== undefined) || (kind === "number" && Number.isFinite(parsed))) onChange(parsed);
}
