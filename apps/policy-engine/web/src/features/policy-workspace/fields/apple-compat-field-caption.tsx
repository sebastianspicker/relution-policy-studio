/** Renders shared metadata and controls for Apple compatibility fields. */
import type { JSX } from "react";
import type { AppleCompatDisplayField } from "./apple-compat-field-info.js";
import { appleCompatFieldFacts } from "./apple-compat-field-info.js";
import { InfoButton } from "./InfoButton.js";
import { SwitchControl } from "../../../ui/SwitchControl.js";

export function AppleCompatFieldCaption(props: { field: AppleCompatDisplayField }): JSX.Element {
  return (
    <div className="field-label-row">
      <span>
        <span className="field-label">{props.field.label}</span>
        <code className="field-path">{props.field.id}</code>
      </span>
      <InfoButton label={props.field.label} description={props.field.description} source="Apple profile payload" facts={appleCompatFieldFacts(props.field)} />
    </div>
  );
}

export function AppleCompatBooleanInput(props: { field: AppleCompatDisplayField; value: unknown; onChange: (value: boolean) => void; containerClass: string }): JSX.Element {
  return (
    <div className={`${props.containerClass} checkbox-field`}>
      <AppleCompatFieldCaption field={props.field} />
      <SwitchControl
        checked={props.value === true}
        label={props.field.label}
        onChange={props.onChange}
      />
    </div>
  );
}
