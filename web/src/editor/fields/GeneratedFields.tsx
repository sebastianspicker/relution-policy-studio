import { useEffect, useState, type JSX } from "react";
import type { ConfigurationTemplate, TemplateField } from "../../../../src/templates.js";
import { deletePath, getPath, isPrimitiveKind, objectListRows, setPath, textAreaValue } from "../editor-utils.js";
import type { JsonRecord } from "../types.js";
import { InfoButton } from "./InfoButton.js";

const NULL_OPTION_VALUE = "__NULL__";

type FieldTreeNode = {
  readonly field: TemplateField;
  readonly children: FieldTreeNode[];
};

type RenderOptions = {
  readonly keyPrefix?: string;
  readonly nested?: boolean;
};

export function GeneratedFields(props: {
  template: ConfigurationTemplate;
  details: JsonRecord;
  onChange: (details: JsonRecord) => void;
}): JSX.Element {
  const editableFields = props.template.fields.filter((field) => field.path !== "uuid" && field.path !== "type");
  const fieldTree = buildFieldTree(editableFields);
  const unsupportedFields = collectUnsupportedFields(fieldTree);
  return (
    <div className="field-grid">
      {props.template.portalHidden ? <p className="warning">Portal hidden type</p> : null}
      {unsupportedFields.length > 0 ? (
        <p className="warning">
          Some settings are only available in Raw JSON: {unsupportedFields.map((field) => field.label).join(", ")}.
        </p>
      ) : null}
      {fieldTree.map((node) => renderFieldNode(node, props.details, props.onChange))}
    </div>
  );
}

function renderFieldNode(
  node: FieldTreeNode,
  details: JsonRecord,
  onChange: (details: JsonRecord) => void,
  options: RenderOptions = {},
): JSX.Element | null {
  const keyPrefix = options.keyPrefix ?? "";
  const nested = options.nested ?? false;
  const key = keyPrefix.length > 0 ? `${keyPrefix}.${node.field.path}` : node.field.path;
  if (node.field.kind === "object" && node.children.some(hasRenderableContent)) {
    return (
      <section key={key} className={`${fieldContainerClass(nested, true)} object-list-field`}>
        <FieldCaption field={node.field} />
        <div className="field-grid">
          {node.children.map((child) => renderFieldNode(child, details, onChange, { keyPrefix: key, nested }))}
        </div>
      </section>
    );
  }
  if (isRenderableField(node.field)) {
    return (
      <FieldInput
        key={key}
        field={node.field}
        nested={nested}
        value={getPath(details, node.field.path)}
        onChange={(value) => {
          const next = structuredClone(details) as JsonRecord;
          setPath(next, node.field.path, value);
          onChange(next);
        }}
        onClear={() => {
          const next = structuredClone(details) as JsonRecord;
          deletePathAndPrune(next, node.field.path);
          onChange(next);
        }}
        onSetNull={() => {
          const next = structuredClone(details) as JsonRecord;
          setPath(next, node.field.path, null);
          onChange(next);
        }}
      />
    );
  }
  return null;
}

function FieldInput(props: {
  field: TemplateField;
  nested?: boolean;
  value: unknown;
  onChange: (value: unknown) => void;
  onClear: () => void;
  onSetNull: () => void;
}): JSX.Element {
  const nested = props.nested ?? false;
  const resetActions = fieldResetActions(props.field, props.onClear, props.onSetNull);
  if (props.field.kind === "array" && props.field.itemKind === "object" && (props.field.itemFields?.length ?? 0) > 0) {
    const rows = objectListRows(props.value);
    const itemTree = buildFieldTree(props.field.itemFields ?? []);
    return (
      <div className={`${fieldContainerClass(nested, true)} object-list-field`}>
        <FieldCaption field={props.field} />
        <div className="object-list-rows">
          {rows.map((row, rowIndex) => (
            <div className="object-list-row" key={rowIndex}>
              <div className="object-list-header">
                <strong>
                  {props.field.label} {rowIndex + 1}
                </strong>
                <button type="button" onClick={() => props.onChange(rows.filter((_, currentIndex) => currentIndex !== rowIndex))}>
                  Remove
                </button>
              </div>
              <div className="object-list-fields">
                {itemTree.map((node) =>
                  renderFieldNode(
                    node,
                    row,
                    (nextRow) => {
                      props.onChange(rows.map((candidate, currentIndex) => (currentIndex === rowIndex ? nextRow : candidate)));
                    },
                    {
                      keyPrefix: `${props.field.path}.${rowIndex}`,
                      nested: true,
                    },
                  ),
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="inline-actions">
          <button type="button" onClick={() => props.onChange([...rows, emptyObjectListRow(props.field)])}>
            Add row
          </button>
        </div>
        {resetActions}
      </div>
    );
  }
  if (props.field.kind === "array" && isRenderableArrayItemKind(props.field.itemKind)) {
    return (
      <div className={fieldContainerClass(nested, true)}>
        <FieldCaption field={props.field} />
        <textarea
          className="compact-textarea"
          value={arrayFieldTextValue(props.field, props.value)}
          onChange={(event) => {
            const entries = parseArrayEntries(props.field, event.target.value);
            if (entries === undefined) {
              return;
            }
            if (entries.length === 0 && !props.field.required) {
              props.onClear();
              return;
            }
            if (entries.length === 0 && props.field.nullable) {
              props.onSetNull();
              return;
            }
            props.onChange(entries);
          }}
        />
        {resetActions}
      </div>
    );
  }
  if (isJsonBackedField(props.field)) {
    return (
      <JsonFieldInput
        field={props.field}
        nested={nested}
        value={props.value}
        onApply={props.onChange}
        onClear={props.onClear}
        onSetNull={props.onSetNull}
        resetActions={resetActions}
      />
    );
  }
  if (props.field.enumValues.length > 0) {
    const selectValue =
      props.field.nullable && (props.value === null || props.value === undefined) ? NULL_OPTION_VALUE : String(props.value ?? "");
    return (
      <div className={fieldContainerClass(nested)}>
        <FieldCaption field={props.field} />
        <select
          value={selectValue}
          onChange={(event) => props.onChange(props.field.nullable && event.target.value === NULL_OPTION_VALUE ? null : event.target.value)}
        >
          {props.field.nullable ? <option value={NULL_OPTION_VALUE}>null</option> : null}
          {props.field.enumValues.map((value) => (
            <option key={value} value={value}>
              {props.field.enumLabels[value] ?? value}
            </option>
          ))}
        </select>
        {resetActions}
      </div>
    );
  }
  if (props.field.kind === "boolean") {
    return (
      <div className={`${fieldContainerClass(nested)} checkbox-field`}>
        <div className="field-label-row">
          <label className="checkbox-control">
            <input type="checkbox" checked={props.value === true} onChange={(event) => props.onChange(event.target.checked)} />
            <span className="field-label">{props.field.label}</span>
          </label>
          {props.field.description !== undefined ? (
            <InfoButton label={props.field.label} description={props.field.description} source={props.field.descriptionSource} />
          ) : null}
        </div>
        <code className="field-path">{props.field.path}</code>
        {resetActions}
      </div>
    );
  }
  if (props.field.kind === "integer" || props.field.kind === "number") {
    return (
      <div className={fieldContainerClass(nested)}>
        <FieldCaption field={props.field} />
        <input
          type="number"
          value={props.value === undefined || props.value === null ? "" : String(props.value)}
          onChange={(event) => {
            if (event.target.value.length === 0) {
              if (!props.field.required) {
                props.onClear();
                return;
              }
              if (props.field.nullable) {
                props.onSetNull();
                return;
              }
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
        {resetActions}
      </div>
    );
  }
  return (
    <div className={fieldContainerClass(nested)}>
      <FieldCaption field={props.field} />
      <input value={String(props.value ?? "")} onChange={(event) => props.onChange(event.target.value)} />
      {resetActions}
    </div>
  );
}

function JsonFieldInput(props: {
  field: TemplateField;
  nested?: boolean;
  value: unknown;
  onApply: (value: unknown) => void;
  onClear: () => void;
  onSetNull: () => void;
  resetActions: JSX.Element | null;
}): JSX.Element {
  const canonicalJson = formatJsonDraft(props.value);
  const [draft, setDraft] = useState(canonicalJson);
  const [error, setError] = useState("");

  useEffect(() => {
    setDraft(canonicalJson);
    setError("");
  }, [canonicalJson, props.field.path]);

  function applyDraft(): void {
    try {
      const parsed = parseJsonDraft(props.field, draft);
      if (parsed === undefined) {
        if (!props.field.required) {
          props.onClear();
          setError("");
          return;
        }
        if (props.field.nullable) {
          props.onSetNull();
          setError("");
          return;
        }
        setError(`${props.field.label} is required.`);
        return;
      }
      props.onApply(parsed);
      setError("");
    } catch (draftError) {
      setError(draftError instanceof Error ? draftError.message : String(draftError));
    }
  }

  return (
    <div className={fieldContainerClass(props.nested ?? false, true)}>
      <FieldCaption field={props.field} />
      <textarea className="compact-code-textarea" value={draft} onChange={(event) => setDraft(event.target.value)} />
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
      {props.resetActions}
      {error.length > 0 ? <p className="warning">{error}</p> : null}
    </div>
  );
}

function fieldResetActions(field: TemplateField, onClear: () => void, onSetNull: () => void): JSX.Element | null {
  if (!field.nullable && field.required) {
    return null;
  }
  return (
    <div className="inline-actions">
      {field.nullable ? (
        <button type="button" aria-label={`Set ${field.label} to null`} onClick={onSetNull}>
          Null
        </button>
      ) : null}
      {!field.required ? (
        <button type="button" aria-label={`Clear ${field.label}`} onClick={onClear}>
          Clear
        </button>
      ) : null}
    </div>
  );
}

function FieldCaption(props: { field: TemplateField }): JSX.Element {
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

function fieldContainerClass(nested: boolean, wide = false): string {
  if (nested) {
    return wide ? "nested-field nested-field-wide" : "nested-field";
  }
  return wide ? "field field-wide" : "field";
}

function arrayFieldTextValue(field: TemplateField, value: unknown): string {
  if (!Array.isArray(value)) {
    return textAreaValue(value);
  }
  if (field.itemKind === "number" || field.itemKind === "integer") {
    return value
      .filter((entry): entry is number => typeof entry === "number" && Number.isFinite(entry))
      .map((entry) => String(entry))
      .join("\n");
  }
  return textAreaValue(value);
}

function parseArrayEntries(field: TemplateField, rawValue: string): unknown[] | undefined {
  const entries = rawValue
    .split(/\r?\n/u)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (field.itemKind === "string") {
    return entries;
  }
  if (field.itemKind === "integer") {
    const numericEntries = entries.map((entry) => parseIntegerValue(entry));
    return numericEntries.every((entry) => entry !== undefined) ? numericEntries : undefined;
  }
  if (field.itemKind === "number") {
    const numericEntries = entries.map((entry) => Number(entry));
    return numericEntries.every((entry) => Number.isFinite(entry)) ? numericEntries : undefined;
  }
  return undefined;
}

function parseIntegerValue(rawValue: string): number | undefined {
  const trimmed = rawValue.trim();
  if (!/^-?\d+$/u.test(trimmed)) {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function emptyObjectListRow(field: TemplateField): JsonRecord {
  const row: JsonRecord = {};
  for (const itemField of field.itemFields ?? []) {
    const defaultValue = defaultValueForField(itemField);
    if (defaultValue !== undefined) {
      setPath(row, itemField.path, structuredClone(defaultValue));
    }
  }
  return row;
}

function defaultValueForField(field: TemplateField): unknown {
  if (field.defaultValue !== undefined) {
    return field.defaultValue;
  }
  if (field.enumValues.length > 0) {
    return field.enumValues[0];
  }
  if (!field.required) {
    return undefined;
  }
  if (field.kind === "boolean") {
    return false;
  }
  if (field.kind === "integer" || field.kind === "number") {
    return 0;
  }
  if (field.kind === "array") {
    return [];
  }
  if (field.kind === "object") {
    return {};
  }
  return "";
}

function buildFieldTree(fields: TemplateField[]): FieldTreeNode[] {
  const nodes = new Map<string, FieldTreeNode>();
  for (const field of fields) {
    nodes.set(field.path, { field, children: [] });
  }
  const roots: FieldTreeNode[] = [];
  for (const field of fields) {
    const node = nodes.get(field.path);
    if (node === undefined) {
      continue;
    }
    const parentPath = parentFieldPath(field.path);
    const parentNode = parentPath === undefined ? undefined : nodes.get(parentPath);
    if (parentNode === undefined) {
      roots.push(node);
      continue;
    }
    parentNode.children.push(node);
  }
  return roots;
}

function collectUnsupportedFields(nodes: FieldTreeNode[]): TemplateField[] {
  const unsupported: TemplateField[] = [];
  for (const node of nodes) {
    if (node.field.kind === "object") {
      if (node.children.some(hasRenderableContent)) {
        unsupported.push(...collectUnsupportedFields(node.children));
      } else if (!isRenderableField(node.field)) {
        unsupported.push(node.field);
      }
      continue;
    }
    if (!isRenderableField(node.field)) {
      unsupported.push(node.field);
    }
  }
  return unsupported;
}

function hasRenderableContent(node: FieldTreeNode): boolean {
  return isRenderableField(node.field) || (node.field.kind === "object" && node.children.some(hasRenderableContent));
}

function isRenderableField(field: TemplateField): boolean {
  return isPrimitiveKind(field.kind) || (field.kind === "array" && isRenderableArrayItemKind(field.itemKind, field.itemFields)) || isJsonBackedField(field);
}

function isRenderableArrayItemKind(itemKind?: string, itemFields?: TemplateField[]): boolean {
  return itemKind === "string" || itemKind === "integer" || itemKind === "number" || (itemKind === "object" && (itemFields?.length ?? 0) > 0);
}

function parentFieldPath(path: string): string | undefined {
  const segments = path.split(".");
  return segments.length > 1 ? segments.slice(0, -1).join(".") : undefined;
}

function deletePathAndPrune(record: JsonRecord, path: string): void {
  deletePath(record, path);
  const segments = path.split(".");
  for (let depth = segments.length - 1; depth > 0; depth -= 1) {
    const parentPath = segments.slice(0, depth).join(".");
    const parent = getPath(record, parentPath);
    if (!isRecord(parent) || Object.keys(parent).length > 0) {
      break;
    }
    deletePath(record, parentPath);
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonBackedField(field: TemplateField): boolean {
  return field.kind === "object" || (field.kind === "array" && field.itemKind === "object" && (field.itemFields?.length ?? 0) === 0);
}

function formatJsonDraft(value: unknown): string {
  if (value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, 2);
}

function parseJsonDraft(field: TemplateField, draft: string): unknown {
  const trimmed = draft.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  const parsed = JSON.parse(trimmed) as unknown;
  if (parsed === null) {
    if (field.nullable) {
      return null;
    }
    throw new Error(`${field.label} must not be null.`);
  }
  if (field.kind === "object") {
    if (!isRecord(parsed)) {
      throw new Error(`${field.label} must be a JSON object.`);
    }
    return parsed;
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`${field.label} must be a JSON array.`);
  }
  if (field.itemKind === "object" && !parsed.every((entry) => isRecord(entry))) {
    throw new Error(`${field.label} must contain only JSON objects.`);
  }
  if (field.itemKind === "number" && !parsed.every((entry) => typeof entry === "number" && Number.isFinite(entry))) {
    throw new Error(`${field.label} must contain only finite numbers.`);
  }
  return parsed;
}
