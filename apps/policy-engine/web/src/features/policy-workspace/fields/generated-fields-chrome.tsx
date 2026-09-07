import { useEffect, useState, type JSX } from "react";
import type { TemplateField } from "../../../../../src/browser/workspace.js";
import { InfoButton } from "./InfoButton.js";
import { SwitchControl } from "../../../ui/SwitchControl.js";
import { formatJsonDraft, parseJsonDraft } from "./generated-fields-json-model.js";
import { fieldAccessibleName, fieldContainerClass, safeFieldId } from "./generated-fields-tree.js";

export type FieldControlProps = {
  field: TemplateField;
  nested: boolean;
  value: unknown;
  onChange: (value: unknown) => void;
  onClear: () => void;
  onSetNull: () => void;
};

export function FieldCaption(props: Pick<FieldControlProps, "field">): JSX.Element {
  return (
    <div className="field-label-row">
      <span>
        <span className="field-label">{props.field.label}</span>
        <code className="field-path">{props.field.path}</code>
      </span>
      {props.field.description !== undefined ? (
        <InfoButton label={props.field.label} description={props.field.description} source={props.field.descriptionSource} />
      ) : null}
    </div>
  );
}

export function FieldResetActions(props: FieldControlProps): JSX.Element | null {
  if (!props.field.nullable && props.field.required) {
    return null;
  }
  return (
    <div className="inline-actions">
      {props.field.nullable ? (
        <button type="button" aria-label={`Set ${props.field.label} to null`} onClick={props.onSetNull}>
          Null
        </button>
      ) : null}
      {!props.field.required ? (
        <button type="button" aria-label={`Clear ${props.field.label}`} onClick={props.onClear}>
          Clear
        </button>
      ) : null}
    </div>
  );
}

export function BooleanFieldInput(props: FieldControlProps): JSX.Element {
  return (
    <div className={`${fieldContainerClass(props.nested)} checkbox-field`}>
      <FieldCaption field={props.field} />
      <SwitchControl
        checked={props.value === true}
        label={props.field.label}
        onChange={(checked) => props.onChange(checked)}
      />
      <FieldResetActions {...props} />
    </div>
  );
}

export function JsonFieldInput(props: FieldControlProps): JSX.Element {
  const canonicalJson = formatJsonDraft(props.value);
  const [draft, setDraft] = useState(canonicalJson);
  const [error, setError] = useState("");

  useEffect(() => {
    if (draft !== canonicalJson) {
      setError("Unsaved JSON draft preserved. Apply or clear it before switching fields.");
      return;
    }
    setDraft(canonicalJson);
    setError("");
  }, [canonicalJson, draft, props.field.path]);

  function applyDraft(): void {
    try {
      const parsed = parseJsonDraft(props.field, draft);
      if (parsed !== undefined) {
        props.onChange(parsed);
        setError("");
      } else if (!props.field.required) {
        props.onClear();
        setError("");
      } else if (props.field.nullable) {
        props.onSetNull();
        setError("");
      } else {
        setError(`${props.field.label} is required.`);
      }
    } catch (draftError) {
      setError(draftError instanceof Error ? draftError.message : String(draftError));
    }
  }

  return (
    <div className={fieldContainerClass(props.nested, true)}>
      <FieldCaption field={props.field} />
      <textarea
        className="compact-code-textarea"
        aria-label={fieldAccessibleName(props.field)}
        aria-invalid={error.length > 0 || undefined}
        aria-describedby={error.length > 0 ? `${safeFieldId(props.field.path)}-error` : undefined}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <div className="inline-actions">
        <button type="button" aria-label={`Apply ${props.field.label} JSON`} onClick={applyDraft}>
          Apply JSON
        </button>
        <button type="button" aria-label={`Reset ${props.field.label} JSON`} onClick={() => {
          setDraft(canonicalJson);
          setError("");
        }}>
          Reset
        </button>
      </div>
      <FieldResetActions {...props} />
      {error.length > 0 ? <p className="warning" id={`${safeFieldId(props.field.path)}-error`} role="alert">{error}</p> : null}
    </div>
  );
}
