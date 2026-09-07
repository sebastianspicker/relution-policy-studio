/** Maps Apple YAML field metadata to editor types, labels, defaults, and choices. */
import type { AppleSchemaFieldKind } from "./apple-schema-types.js";
import { asRecord, stringValue, type JsonRecord } from "../platform/serialization/json-guards.js";

const APPLE_TYPE_FIELD_KINDS: Record<string, AppleSchemaFieldKind> = {
  "<boolean>": "boolean",
  "<integer>": "integer",
  "<real>": "number",
  "<number>": "number",
  "<array>": "list",
  "<dictionary>": "json",
  "<data>": "data",
};
const VARIABLE_SAFE_FIELD_KINDS = new Set<AppleSchemaFieldKind>(["string", "textarea"]);
const APPLE_SCHEMA_FIELD_DEFAULTS: Partial<Record<AppleSchemaFieldKind, unknown>> = {
  boolean: false,
  integer: 0,
  number: 0,
  json: "{}",
};

export function labelAppleSchemaIdentifier(identifier: string): string {
  return identifier
    .replace(/^com\.apple\./u, "")
    .replace(/(?:^|[.\-_]+)([^.\-_])/gu, (_match, initial: string, offset: number) => `${offset === 0 ? "" : " "}${initial.toUpperCase()}`);
}

export function appleSchemaFieldKind(value: JsonRecord): AppleSchemaFieldKind {
  const type = stringValue(value.type);
  if (type !== "<array>") return APPLE_TYPE_FIELD_KINDS[type ?? ""] ?? "string";
  const subkeys = Array.isArray(value.subkeys) ? value.subkeys : [];
  const child = subkeys.length === 1 ? asRecord(subkeys[0]) : undefined;
  return stringValue(child?.type) === "<string>" ? "list" : "json";
}

export function appleSchemaFieldDefault(kind: AppleSchemaFieldKind): unknown {
  return kind === "list" ? [] : APPLE_SCHEMA_FIELD_DEFAULTS[kind] ?? "";
}

export function isAppleSchemaVariableSafe(kind: AppleSchemaFieldKind): boolean {
  return VARIABLE_SAFE_FIELD_KINDS.has(kind);
}

export function appleSchemaStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}
