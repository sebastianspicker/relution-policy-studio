/** Renders a labelled binary switch without changing checkbox form semantics. */
import type { JSX } from "react";

export function SwitchControl(props: {
  readonly checked: boolean;
  readonly label: string;
  readonly onChange: (checked: boolean) => void;
}): JSX.Element {
  return (
    <label className="switch-control">
      <input
        type="checkbox"
        role="switch"
        aria-label={props.label}
        checked={props.checked}
        onChange={(event) => props.onChange(event.target.checked)}
      />
      <span aria-hidden="true">{props.checked ? "Enabled" : "Disabled"}</span>
    </label>
  );
}
