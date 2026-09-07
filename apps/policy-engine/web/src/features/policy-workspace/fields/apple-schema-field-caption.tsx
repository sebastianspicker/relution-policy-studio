import type { JSX } from "react";
import type { AppleSchemaField } from "../../../../../src/browser/apple.js";
import { InfoButton } from "./InfoButton.js";

export function AppleSchemaFieldCaption(props: { field: AppleSchemaField; detailsOnly?: boolean }): JSX.Element {
  const infoButton = <InfoButton label={props.field.title} description={props.field.description} source="Apple device-management schema" facts={appleSchemaFieldFacts(props.field)} />;
  if (props.detailsOnly) {
    return infoButton;
  }
  return (
    <div className="field-label-row">
      <span>
        <span className="field-label">{props.field.title}{props.field.required ? " *" : ""}</span>
        <code className="field-path">{props.field.path}</code>
      </span>
      {infoButton}
    </div>
  );
}

export function appleSchemaAccessibleName(field: AppleSchemaField): string {
  return `${field.title} (${field.path})`;
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
