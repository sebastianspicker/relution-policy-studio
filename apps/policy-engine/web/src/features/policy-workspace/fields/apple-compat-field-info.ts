/** Builds accessible labels and fact lists for Apple compatibility controls. */
import type { AppleCompatField, AppleCompatObjectField } from "../../../../../src/browser/apple.js";

export type AppleCompatDisplayField = AppleCompatField | AppleCompatObjectField;

export function appleCompatAccessibleName(field: AppleCompatDisplayField): string {
  return `${field.label} (${field.id})`;
}

export function appleCompatFieldFacts(field: AppleCompatDisplayField): string[] {
  const facts = [`UI field: ${field.id}`, `Default: ${shortJson(field.defaultValue)}`];
  if (field.payloadKey !== undefined) facts.splice(1, 0, `Apple payload key: ${field.payloadKey}`);
  if (field.options !== undefined) facts.push(`Options: ${field.options.join(", ")}`);
  return facts;
}

function shortJson(value: unknown): string {
  const rendered = value === undefined ? "undefined" : typeof value === "string" ? value : JSON.stringify(value);
  return rendered.length > 80 ? `${rendered.slice(0, 77)}...` : rendered;
}
