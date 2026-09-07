import type { JSX } from "react";
import { getPath, updatePath } from "../../../shared/editor-object-path.js";
import type { JsonRecord } from "../../../shared/editor-contracts.js";
import { FieldCaption } from "./generated-fields-chrome.js";
import { GeneratedFieldInput } from "./generated-fields-node-input.js";
import { hasRenderableContent, isRenderableField } from "./generated-fields-renderability.js";
import { fieldContainerClass, type FieldTreeNode } from "./generated-fields-tree.js";

export function GeneratedFieldNode(props: {
  node: FieldTreeNode;
  details: JsonRecord;
  onChange: (details: JsonRecord) => void;
  nested: boolean;
  keyPrefix: string;
}): JSX.Element | null {
  if (props.node.field.kind === "object" && props.node.children.some(hasRenderableContent)) {
    return <NestedObjectField {...props} />;
  }
  if (!isRenderableField(props.node.field)) {
    return null;
  }
  return <NodeFieldInput {...props} />;
}

function NestedObjectField(props: {
  node: FieldTreeNode;
  details: JsonRecord;
  onChange: (details: JsonRecord) => void;
  nested: boolean;
  keyPrefix: string;
}): JSX.Element {
  return (
    <section className={`${fieldContainerClass(props.nested, true)} object-list-field`}>
      <FieldCaption field={props.node.field} />
      <div className="field-grid">
        {props.node.children.map((child) => (
          <GeneratedFieldNode
            key={nodeKey(props.keyPrefix, child.field.path)}
            node={child}
            details={props.details}
            onChange={props.onChange}
            nested={props.nested}
            keyPrefix={nodeKey(props.keyPrefix, props.node.field.path)}
          />
        ))}
      </div>
    </section>
  );
}

function NodeFieldInput(props: {
  node: FieldTreeNode;
  details: JsonRecord;
  onChange: (details: JsonRecord) => void;
  nested: boolean;
  keyPrefix: string;
}): JSX.Element {
  const field = props.node.field;
  const value = getPath(props.details, field.path);
  return (
    <GeneratedFieldInput
      field={field}
      nested={props.nested}
      value={value}
      onChange={(nextValue) => setValue(props.details, field.path, nextValue, props.onChange)}
      onClear={() => clearValue(props.details, field.path, props.onChange)}
      onSetNull={() => setValue(props.details, field.path, null, props.onChange)}
      renderRowField={(node, row, rowIndex, onChange) => (
        <GeneratedFieldNode
          key={nodeKey(field.path, `${rowIndex}.${node.field.path}`)}
          node={node}
          details={row}
          onChange={onChange}
          nested
          keyPrefix={`${field.path}.${rowIndex}`}
        />
      )}
    />
  );
}

function nodeKey(keyPrefix: string, path: string): string {
  return keyPrefix.length > 0 ? `${keyPrefix}.${path}` : path;
}

function setValue(details: JsonRecord, path: string, value: unknown, onChange: (details: JsonRecord) => void): void {
  onChange(updatePath(details, path, value));
}

function clearValue(details: JsonRecord, path: string, onChange: (details: JsonRecord) => void): void {
  onChange(updatePath(details, path, undefined, true));
}
