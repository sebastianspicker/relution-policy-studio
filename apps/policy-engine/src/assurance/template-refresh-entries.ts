/** Reads typed metadata entries from a bounded Relution server archive. */
import yaml, { load as parseYamlWithSchema } from "js-yaml";
import type { JsonObject } from "../contracts/template.js";

export interface TemplateRefreshZipEntry {
  readonly name: string;
  readonly data: Buffer;
}

export function readJsonEntry(entries: TemplateRefreshZipEntry[], name: string): JsonObject {
  const entry = findZipEntry(entries, name);
  if (entry === undefined) throw new Error(`Missing ${name}`);
  const parsed = JSON.parse(entry.data.toString("utf8")) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${name} is not a JSON object`);
  }
  return parsed as JsonObject;
}

export function readOptionalJsonEntry(entries: TemplateRefreshZipEntry[], name: string): unknown {
  const entry = findZipEntry(entries, name);
  return entry === undefined ? {} : JSON.parse(entry.data.toString("utf8")) as unknown;
}

export function readYamlEntry(entries: TemplateRefreshZipEntry[], name: string): unknown {
  const entry = findZipEntry(entries, name);
  return entry === undefined
    ? []
    : parseYamlWithSchema(entry.data.toString("utf8"), { schema: yaml.JSON_SCHEMA });
}

function findZipEntry(entries: TemplateRefreshZipEntry[], name: string): TemplateRefreshZipEntry | undefined {
  return entries.find((entry) => entry.name === name);
}
