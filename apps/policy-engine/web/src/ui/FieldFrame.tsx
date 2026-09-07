/** Connects field labels, descriptions, requirements, and errors to a single form control. */
import { cloneElement, useId, type JSX, type ReactElement } from "react";

type FieldControlProps = {
  readonly id?: string;
  readonly "aria-describedby"?: string;
  readonly "aria-invalid"?: boolean;
  readonly "aria-required"?: boolean;
};

export function FieldFrame(props: {
  readonly children: ReactElement<FieldControlProps>;
  readonly className?: string;
  readonly description?: string;
  readonly error?: string;
  readonly footer?: JSX.Element;
  readonly id?: string;
  readonly label: string;
  readonly nullable?: boolean;
  readonly path?: string;
  readonly required?: boolean;
  readonly trailing?: JSX.Element;
}): JSX.Element {
  const generatedId = useId();
  const controlId = props.id ?? `field-${generatedId.replaceAll(":", "")}`;
  const descriptionId = props.description === undefined ? undefined : `${controlId}-description`;
  const errorId = props.error === undefined ? undefined : `${controlId}-error`;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={props.className ?? "field"}>
      <div className="field-main">
        <div className="field-label-row">
          <label className="field-label" htmlFor={controlId}>{props.label}{props.required ? " *" : ""}</label>
          {props.trailing}
        </div>
        {props.description !== undefined ? <span className="field-description" id={descriptionId}>{props.description}</span> : null}
        {props.path !== undefined ? <code className="field-path">{props.path}</code> : null}
        {!props.required && props.nullable ? <span className="field-constraint">Optional; null is accepted.</span> : null}
      </div>
      <div className="field-control">
        {cloneElement(props.children, {
          id: controlId,
          ...(describedBy === undefined ? {} : { "aria-describedby": describedBy }),
          ...(props.error === undefined ? {} : { "aria-invalid": true }),
          ...(props.required ? { "aria-required": true } : {}),
        })}
      </div>
      {props.footer === undefined ? null : <div className="field-footer">{props.footer}</div>}
      {props.error !== undefined ? <p className="field-error" id={errorId} role="alert">{props.error}</p> : null}
    </div>
  );
}
