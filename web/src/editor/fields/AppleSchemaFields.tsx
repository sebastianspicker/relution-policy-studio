import type { JSX } from "react";
import {
  extractAppleSchemaPayloadBodyJson,
  extractAppleSchemaValues,
  updateAppleSchemaProfileDetails,
  updateAppleSchemaProfileDetailsFromPayloadBodyJson,
  type AppleSchemaEntry,
  type AppleSchemaField,
} from "../../../../src/apple-schema.js";
import { parseIntegerValue, textAreaValue } from "../editor-utils.js";
import type { JsonRecord } from "../types.js";
import { InfoButton } from "./InfoButton.js";
import { PayloadJsonEditor } from "./PayloadJsonEditor.js";

/** Select sentinel for optional Apple schema fields; choosing it omits the payload key instead of emitting a value. */
const OMIT_OPTION_VALUE = "__OMIT__";

export function AppleSchemaFields(props: {
  entry: AppleSchemaEntry;
  details: JsonRecord;
  onChange: (details: JsonRecord) => void;
  onError: (message: string) => void;
}): JSX.Element {
  const values = extractAppleSchemaValues(props.details, props.entry);
  const payloadJson = extractAppleSchemaPayloadBodyJson(props.details, props.entry);
  return (
    <div className="field-grid">
      <p className="warning">
        Generated from Apple's pinned device-management schema. Saved through Relution APPLE_MOBILECONFIG; DDM is handled in the sidecar.
        <InfoButton
          label={props.entry.title}
          description={props.entry.description}
          facts={[
            `Identifier: ${props.entry.identifier}`,
            `Schema source: ${props.entry.sourcePath}`,
            `Platforms: ${props.entry.availability.platforms.join(", ")}`,
            `Allow multiple: ${String(props.entry.availability.allowMultiple)}`,
            `Requires MDM: ${String(props.entry.availability.requiresMdm)}`,
          ]}
          source="Apple device-management schema"
        />
      </p>
      {props.entry.availability.deprecated ? <p className="warning">This Apple payload is deprecated in the pinned schema.</p> : null}
      <PayloadJsonEditor
        draftKey={typeof props.details.uuid === "string" ? props.details.uuid : props.entry.id}
        payloadJson={payloadJson}
        onError={props.onError}
        onApply={(payloadBodyJson) => {
          try {
            props.onChange(updateAppleSchemaProfileDetailsFromPayloadBodyJson(props.details, props.entry, payloadBodyJson));
          } catch (error) {
            props.onError(error instanceof Error ? error.message : String(error));
          }
        }}
      />
      {props.entry.fields.map((field) => (
        <AppleSchemaFieldInput
          key={field.path}
          field={field}
          value={values[field.path]}
          onChange={(value) => {
            try {
              const nextValues = { ...values };
              if (value === undefined && !field.required) {
                delete nextValues[field.path];
              } else {
                nextValues[field.path] = value;
              }
              props.onChange(updateAppleSchemaProfileDetails(props.details, props.entry, nextValues));
            } catch (error) {
              props.onError(error instanceof Error ? error.message : String(error));
            }
          }}
        />
      ))}
    </div>
  );
}

function AppleSchemaFieldInput(props: {
  field: AppleSchemaField;
  value: unknown;
  onChange: (value: unknown) => void;
}): JSX.Element {
  if (props.field.enumValues.length > 0) {
    const selectValue = !props.field.required && props.value === undefined ? OMIT_OPTION_VALUE : String(props.value ?? "");
    return (
      <div className="field">
        <AppleSchemaFieldCaption field={props.field} />
        <select
          value={selectValue}
          onChange={(event) => props.onChange(!props.field.required && event.target.value === OMIT_OPTION_VALUE ? undefined : event.target.value)}
        >
          {!props.field.required ? <option value={OMIT_OPTION_VALUE}>Omit</option> : null}
          {props.field.enumValues.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>
    );
  }
  if (props.field.kind === "boolean") {
    if (!props.field.required) {
      const selectValue = props.value === undefined ? OMIT_OPTION_VALUE : String(props.value === true);
      return (
        <div className="field">
          <AppleSchemaFieldCaption field={props.field} />
          <select
            value={selectValue}
            onChange={(event) => {
              if (event.target.value === OMIT_OPTION_VALUE) {
                props.onChange(undefined);
                return;
              }
              props.onChange(event.target.value === "true");
            }}
          >
            <option value={OMIT_OPTION_VALUE}>Omit</option>
            <option value="false">False</option>
            <option value="true">True</option>
          </select>
        </div>
      );
    }
    return (
      <div className="field checkbox-field">
        <div className="field-label-row">
          <label className="checkbox-control">
            <input type="checkbox" checked={props.value === true} onChange={(event) => props.onChange(event.target.checked)} />
            <span className="field-label">{props.field.title}</span>
          </label>
          <InfoButton label={props.field.title} description={props.field.description} source="Apple device-management schema" facts={appleSchemaFieldFacts(props.field)} />
        </div>
        <code className="field-path">{props.field.path}</code>
      </div>
    );
  }
  if (props.field.kind === "integer" || props.field.kind === "number") {
    return (
      <div className="field">
        <AppleSchemaFieldCaption field={props.field} />
        <input
          type="number"
          step={props.field.kind === "number" ? "any" : "1"}
          value={props.value === undefined ? "" : String(props.value)}
          onChange={(event) => {
            if (!props.field.required && event.target.value.length === 0) {
              props.onChange(undefined);
              return;
            }
            if (props.field.kind === "integer") {
              const parsed = parseIntegerValue(event.target.value);
              if (parsed === undefined) {
                return;
              }
              props.onChange(parsed);
              return;
            }
            props.onChange(Number(event.target.value));
          }}
        />
      </div>
    );
  }
  if (props.field.kind === "list" || props.field.kind === "json" || props.field.kind === "data" || props.field.kind === "textarea") {
    return (
      <div className="field">
        <AppleSchemaFieldCaption field={props.field} />
        <textarea
          className={props.field.kind === "json" || props.field.kind === "data" ? "compact-code-textarea" : "compact-textarea"}
          value={textAreaValue(props.value)}
          onChange={(event) => props.onChange(event.target.value)}
        />
      </div>
    );
  }
  return (
    <div className="field">
      <AppleSchemaFieldCaption field={props.field} />
      <input value={String(props.value ?? "")} onChange={(event) => props.onChange(event.target.value)} />
    </div>
  );
}

function AppleSchemaFieldCaption(props: { field: AppleSchemaField }): JSX.Element {
  return (
    <div className="field-label-row">
      <span>
        <span className="field-label">{props.field.title}{props.field.required ? " *" : ""}</span>
        <code className="field-path">{props.field.path}</code>
      </span>
      <InfoButton label={props.field.title} description={props.field.description} source="Apple device-management schema" facts={appleSchemaFieldFacts(props.field)} />
    </div>
  );
}

function appleSchemaFieldFacts(field: AppleSchemaField): string[] {
  const facts = [
    `Schema path: ${field.path}`,
    `Apple payload key: ${field.payloadKey}`,
    `Required: ${String(field.required)}`,
    `Default: ${shortJson(field.defaultValue)}`,
  ];
  if (field.enumValues.length > 0) {
    facts.push(`Options: ${field.enumValues.join(", ")}`);
  }
  return facts;
}

function shortJson(value: unknown): string {
  const rendered = typeof value === "string" ? value : JSON.stringify(value);
  return rendered.length > 80 ? `${rendered.slice(0, 77)}...` : rendered;
}
