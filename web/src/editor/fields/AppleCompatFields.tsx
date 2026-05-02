import type { JSX } from "react";
import {
  extractAppleCompatPayloadBodyJson,
  extractAppleCompatValues,
  updateAppleCompatDetails,
  updateAppleCompatDetailsFromPayloadBodyJson,
  type AppleCompatField,
  type AppleCompatObjectField,
  type AppleCompatSetting,
} from "../../../../src/apple-compat.js";
import {
  emptyObjectListRow,
  entriesToRecord,
  keyValueEntries,
  nextHeaderName,
  objectListRows,
  replaceKeyValueEntry,
  textAreaValue,
} from "../editor-utils.js";
import type { JsonRecord } from "../types.js";
import { InfoButton } from "./InfoButton.js";
import { PayloadJsonEditor } from "./PayloadJsonEditor.js";

export function AppleCompatFields(props: {
  setting: AppleCompatSetting;
  details: JsonRecord;
  onChange: (details: JsonRecord) => void;
  onError: (message: string) => void;
}): JSX.Element {
  const values = extractAppleCompatValues(props.details, props.setting);
  const payloadJson = extractAppleCompatPayloadBodyJson(props.details, props.setting);
  return (
    <div className="field-grid">
      <p className="warning">
        {props.setting.label} is marked with * because Relution 26.1.1 exposes it through APPLE_MOBILECONFIG instead of a dedicated harvested GUI configuration.
        <InfoButton
          label={props.setting.label}
          description={props.setting.description}
          facts={[
            `Apple payload type: ${props.setting.payloadType}`,
            `Jamf feature: ${props.setting.jamfFeature}`,
            `Platforms: ${props.setting.platforms.join(", ")}`,
            `Sources: ${props.setting.sourceUrls.join(", ")}`,
          ]}
        />
      </p>
      <PayloadJsonEditor
        draftKey={typeof props.details.uuid === "string" ? props.details.uuid : props.setting.id}
        payloadJson={payloadJson}
        onError={props.onError}
        onApply={(payloadBodyJson) => {
          try {
            props.onChange(updateAppleCompatDetailsFromPayloadBodyJson(props.details, props.setting.id, payloadBodyJson));
          } catch (error) {
            props.onError(error instanceof Error ? error.message : String(error));
          }
        }}
      />
      {props.setting.fields.filter((field) => field.id !== "payloadKeysJson").map((field) => (
        <AppleCompatFieldInput
          key={field.id}
          field={field}
          value={values[field.id]}
          onChange={(value) => {
            try {
              const nextValues = { ...values, [field.id]: value };
              props.onChange(updateAppleCompatDetails(props.details, props.setting.id, nextValues));
            } catch (error) {
              props.onError(error instanceof Error ? error.message : String(error));
            }
          }}
        />
      ))}
    </div>
  );
}

function AppleCompatFieldInput(props: {
  field: AppleCompatField;
  value: unknown;
  onChange: (value: unknown) => void;
}): JSX.Element {
  if (props.field.kind === "object-list") {
    return <AppleCompatObjectListInput field={props.field} value={props.value} onChange={props.onChange} />;
  }
  if (props.field.options !== undefined) {
    return (
      <div className="field">
        <AppleCompatFieldCaption field={props.field} />
        <select value={String(props.value ?? "")} onChange={(event) => props.onChange(event.target.value)}>
          {props.field.options.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>
    );
  }
  if (props.field.kind === "boolean") {
    return (
      <div className="field checkbox-field">
        <div className="field-label-row">
          <label className="checkbox-control">
            <input type="checkbox" checked={props.value === true} onChange={(event) => props.onChange(event.target.checked)} />
            <span className="field-label">{props.field.label}</span>
          </label>
          <InfoButton label={props.field.label} description={props.field.description} source="Apple profile payload" facts={appleCompatFieldFacts(props.field)} />
        </div>
        <code className="field-path">{props.field.id}</code>
      </div>
    );
  }
  if (props.field.kind === "key-value-list") {
    return (
      <div className="field field-wide">
        <AppleCompatFieldCaption field={props.field} />
        <KeyValueListInput value={props.value} onChange={props.onChange} />
      </div>
    );
  }
  if (props.field.kind === "integer" || props.field.kind === "number") {
    return (
      <div className="field">
        <AppleCompatFieldCaption field={props.field} />
        <input
          type="number"
          step={props.field.kind === "number" ? "any" : "1"}
          value={Number(props.value ?? 0)}
          onChange={(event) => props.onChange(Number(event.target.value))}
        />
      </div>
    );
  }
  if (props.field.kind === "textarea" || props.field.kind === "list" || props.field.kind === "json") {
    return (
      <div className="field">
        <AppleCompatFieldCaption field={props.field} />
        <textarea
          className={props.field.kind === "json" ? "compact-code-textarea" : "compact-textarea"}
          value={textAreaValue(props.value)}
          onChange={(event) => props.onChange(event.target.value)}
        />
      </div>
    );
  }
  return (
    <div className="field">
      <AppleCompatFieldCaption field={props.field} />
      <input value={String(props.value ?? "")} onChange={(event) => props.onChange(event.target.value)} />
    </div>
  );
}

function AppleCompatObjectListInput(props: {
  field: AppleCompatField;
  value: unknown;
  onChange: (value: unknown) => void;
}): JSX.Element {
  const rows = objectListRows(props.value);
  return (
    <div className="field field-wide object-list-field">
      <AppleCompatFieldCaption field={props.field} />
      <div className="object-list-rows">
        {rows.map((row, rowIndex) => (
          <div className="object-list-row" key={rowIndex}>
            <div className="object-list-header">
              <strong>{props.field.label} {rowIndex + 1}</strong>
              <button type="button" onClick={() => props.onChange(rows.filter((_, currentIndex) => currentIndex !== rowIndex))}>
                Remove
              </button>
            </div>
            <div className="object-list-fields">
              {(props.field.itemFields ?? []).map((itemField) => (
                <AppleCompatObjectFieldInput
                  key={itemField.id}
                  field={itemField}
                  value={row[itemField.id]}
                  onChange={(value) => {
                    const nextRows = rows.map((candidate, currentIndex) =>
                      currentIndex === rowIndex ? { ...candidate, [itemField.id]: value } : candidate,
                    );
                    props.onChange(nextRows);
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => props.onChange([...rows, emptyObjectListRow(props.field)])}>
        Add row
      </button>
    </div>
  );
}

function AppleCompatObjectFieldInput(props: {
  field: AppleCompatObjectField;
  value: unknown;
  onChange: (value: unknown) => void;
}): JSX.Element {
  if (props.field.options !== undefined) {
    return (
      <div className="nested-field">
        <AppleCompatFieldCaption field={props.field} />
        <select value={String(props.value ?? "")} onChange={(event) => props.onChange(event.target.value)}>
          {props.field.options.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>
    );
  }
  if (props.field.kind === "boolean") {
    return (
      <div className="nested-field checkbox-field">
        <div className="field-label-row">
          <label className="checkbox-control">
            <input type="checkbox" checked={props.value === true} onChange={(event) => props.onChange(event.target.checked)} />
            <span className="field-label">{props.field.label}</span>
          </label>
          <InfoButton label={props.field.label} description={props.field.description} source="Apple profile payload" facts={appleCompatFieldFacts(props.field)} />
        </div>
        <code className="field-path">{props.field.id}</code>
      </div>
    );
  }
  if (props.field.kind === "integer" || props.field.kind === "number") {
    return (
      <div className="nested-field">
        <AppleCompatFieldCaption field={props.field} />
        <input
          type="number"
          step={props.field.kind === "number" ? "any" : "1"}
          value={Number(props.value ?? 0)}
          onChange={(event) => props.onChange(Number(event.target.value))}
        />
      </div>
    );
  }
  if (props.field.kind === "key-value-list") {
    return (
      <div className="nested-field nested-field-wide">
        <AppleCompatFieldCaption field={props.field} />
        <KeyValueListInput value={props.value} onChange={props.onChange} />
      </div>
    );
  }
  if (props.field.kind === "textarea" || props.field.kind === "list" || props.field.kind === "json") {
    return (
      <div className="nested-field nested-field-wide">
        <AppleCompatFieldCaption field={props.field} />
        <textarea
          className={props.field.kind === "json" ? "compact-code-textarea" : "compact-textarea"}
          value={textAreaValue(props.value)}
          onChange={(event) => props.onChange(event.target.value)}
        />
      </div>
    );
  }
  return (
    <div className="nested-field">
      <AppleCompatFieldCaption field={props.field} />
      <input value={String(props.value ?? "")} onChange={(event) => props.onChange(event.target.value)} />
    </div>
  );
}

function KeyValueListInput(props: { value: unknown; onChange: (value: unknown) => void }): JSX.Element {
  const entries = keyValueEntries(props.value);
  return (
    <div className="key-value-list">
      {entries.map((entry, index) => (
        <div className="key-value-row" key={index}>
          <input
            aria-label="Header name"
            value={entry.key}
            onChange={(event) => props.onChange(entriesToRecord(replaceKeyValueEntry(entries, index, { ...entry, key: event.target.value })))}
          />
          <input
            aria-label="Header value"
            value={entry.value}
            onChange={(event) => props.onChange(entriesToRecord(replaceKeyValueEntry(entries, index, { ...entry, value: event.target.value })))}
          />
          <button type="button" onClick={() => props.onChange(entriesToRecord(entries.filter((_, currentIndex) => currentIndex !== index)))}>
            Remove
          </button>
        </div>
      ))}
      <button type="button" onClick={() => props.onChange(entriesToRecord([...entries, { key: nextHeaderName(entries), value: "" }]))}>
        Add header
      </button>
    </div>
  );
}

function AppleCompatFieldCaption(props: { field: AppleCompatField | AppleCompatObjectField }): JSX.Element {
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

function appleCompatFieldFacts(field: AppleCompatField | AppleCompatObjectField): string[] {
  const facts = [`UI field: ${field.id}`, `Default: ${shortJson(field.defaultValue)}`];
  if (field.payloadKey !== undefined) {
    facts.splice(1, 0, `Apple payload key: ${field.payloadKey}`);
  }
  if (field.options !== undefined) {
    facts.push(`Options: ${field.options.join(", ")}`);
  }
  return facts;
}

function shortJson(value: unknown): string {
  const rendered = typeof value === "string" ? value : JSON.stringify(value);
  return rendered.length > 80 ? `${rendered.slice(0, 77)}...` : rendered;
}
