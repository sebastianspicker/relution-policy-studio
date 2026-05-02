import { findAppleCompatSetting } from "../../../src/apple-compat.js";
import type { AppleCompatField } from "../../../src/apple-compat.js";
import type { AppleSchemaCatalog } from "../../../src/apple-schema.js";
import type { EditorSidecarState } from "../../../src/sidecar.js";
import type { PolicyWorkspace } from "../../../src/workspace.js";
import type { AddSelection, AppState, JsonRecord, Selection } from "./types.js";

export const NATIVE_ADD_PREFIX = "native:";
export const APPLE_COMPAT_ADD_PREFIX = "apple-compat:";
export const APPLE_SCHEMA_ADD_PREFIX = "apple-profile:";
export const CUSTOM_SETTINGS_ADD_VALUE = "custom-settings";

export async function loadState(): Promise<AppState> {
  const response = await fetch("/api/state");
  const state = await readJsonResponse<AppState>(response);
  if (!response.ok) {
    throw new Error(`Failed to load editor state: ${JSON.stringify(state)}`);
  }
  return state;
}

export async function postJson(url: string, body: unknown): Promise<Response> {
  return await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function readJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text.length === 0 ? "{}" : text) as T;
  } catch {
    const preview = text.slice(0, 160).replace(/\s+/gu, " ").trim();
    throw new Error(`Expected JSON from ${response.url}, got ${preview || "empty response"}`);
  }
}

export async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const chunks: string[] = [];
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(index, index + chunkSize)));
  }
  return btoa(chunks.join(""));
}

export function firstConfigurationSelection(workspace: PolicyWorkspace): Selection | undefined {
  for (const [policyIndex] of workspace.policies.entries()) {
    const version = versionRecord(workspace, policyIndex, 0);
    const configurations = Array.isArray(version?.configurations) ? version.configurations : [];
    if (configurations.length > 0) {
      return { policyIndex, versionIndex: 0, configurationIndex: 0 };
    }
  }
  return workspace.policies.length > 0 ? { policyIndex: 0, versionIndex: 0 } : undefined;
}

export function selectedConfiguration(workspace: PolicyWorkspace, selection: Selection): JsonRecord | undefined {
  if (selection.configurationIndex === undefined) {
    return undefined;
  }
  const version = versionRecord(workspace, selection.policyIndex, selection.versionIndex);
  const configurations = Array.isArray(version?.configurations) ? version.configurations : [];
  return asRecord(configurations[selection.configurationIndex]);
}

export function versionRecord(workspace: PolicyWorkspace, policyIndex: number, versionIndex: number): JsonRecord | undefined {
  const policy = workspace.policies[policyIndex];
  const versions = Array.isArray(policy?.document.versions) ? policy.document.versions : [];
  return asRecord(versions[versionIndex]);
}

export function cloneWorkspace(workspace: PolicyWorkspace): PolicyWorkspace {
  return structuredClone(workspace) as PolicyWorkspace;
}

export function isPrimitiveKind(kind: string): boolean {
  return kind === "boolean" || kind === "string" || kind === "integer" || kind === "number";
}

export function parseAddSelection(value: string): AddSelection {
  if (value === CUSTOM_SETTINGS_ADD_VALUE) {
    return { kind: "custom-settings", value };
  }
  if (value.startsWith(APPLE_SCHEMA_ADD_PREFIX)) {
    return { kind: "apple-profile", value: value.slice(APPLE_SCHEMA_ADD_PREFIX.length) };
  }
  if (value.startsWith(APPLE_COMPAT_ADD_PREFIX)) {
    return { kind: "apple-compat", value: value.slice(APPLE_COMPAT_ADD_PREFIX.length) };
  }
  if (value.startsWith(NATIVE_ADD_PREFIX)) {
    return { kind: "native", value: value.slice(NATIVE_ADD_PREFIX.length) };
  }
  return { kind: "native", value };
}

export function addConfigurationLabel(selection: AddSelection): string {
  if (selection.kind === "apple-compat") {
    return findAppleCompatSetting(selection.value)?.label ?? selection.value;
  }
  if (selection.kind === "custom-settings") {
    return "Application & Custom Settings";
  }
  return selection.value;
}

export function emptyAppleSchemaCatalog(): AppleSchemaCatalog {
  return {
    version: 1,
    source: {
      repository: "",
      revision: "",
      generatedAt: "",
    },
    counts: {
      profile: 0,
      "ddm-configuration": 0,
      "ddm-asset": 0,
      "ddm-activation": 0,
      "ddm-management": 0,
      "ddm-status": 0,
      "mdm-command": 0,
      "mdm-checkin": 0,
      "ddm-protocol": 0,
    },
    entries: [],
  };
}

export function isEditorSidecarState(value: unknown): value is EditorSidecarState {
  const record = asRecord(value);
  return record?.version === 1 && Array.isArray(record.mobileConfigRestore);
}

export function textAreaValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string").join("\n");
  }
  return typeof value === "string" ? value : String(value ?? "");
}

export function objectListRows(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => asRecord(entry) ?? {});
}

export function emptyObjectListRow(field: AppleCompatField): JsonRecord {
  const row: JsonRecord = {};
  for (const itemField of field.itemFields ?? []) {
    row[itemField.id] = structuredClone(itemField.defaultValue) as unknown;
  }
  return row;
}

export function keyValueEntries(value: unknown): Array<{ key: string; value: string }> {
  const record = asRecord(value);
  if (record === undefined) {
    return [];
  }
  return Object.entries(record).map(([key, entry]) => ({ key, value: typeof entry === "string" ? entry : String(entry ?? "") }));
}

export function replaceKeyValueEntry(
  entries: Array<{ key: string; value: string }>,
  index: number,
  entry: { key: string; value: string },
): Array<{ key: string; value: string }> {
  return entries.map((candidate, currentIndex) => (currentIndex === index ? entry : candidate));
}

export function entriesToRecord(entries: Array<{ key: string; value: string }>): JsonRecord {
  const record: JsonRecord = {};
  for (const entry of entries) {
    const key = entry.key.trim();
    if (key.length > 0) {
      record[key] = entry.value;
    }
  }
  return record;
}

export function nextHeaderName(entries: Array<{ key: string; value: string }>): string {
  const used = new Set(entries.map((entry) => entry.key));
  let index = 1;
  while (used.has(`Header-${index}`)) {
    index += 1;
  }
  return `Header-${index}`;
}

export function getPath(record: JsonRecord, path: string): unknown {
  let cursor: unknown = record;
  for (const segment of path.split(".")) {
    const current = asRecord(cursor);
    if (current === undefined) {
      return undefined;
    }
    cursor = current[segment];
  }
  return cursor;
}

export function setPath(record: JsonRecord, path: string, value: unknown): void {
  const segments = path.split(".");
  let cursor = record;
  for (const segment of segments.slice(0, -1)) {
    const next = asRecord(cursor[segment]);
    if (next === undefined) {
      cursor[segment] = {};
      cursor = cursor[segment] as JsonRecord;
    } else {
      cursor = next;
    }
  }
  const last = segments.at(-1);
  if (last !== undefined) {
    cursor[last] = value;
  }
}

export function deletePath(record: JsonRecord, path: string): void {
  const segments = path.split(".");
  let cursor = record;
  for (const segment of segments.slice(0, -1)) {
    const next = asRecord(cursor[segment]);
    if (next === undefined) {
      return;
    }
    cursor = next;
  }
  const last = segments.at(-1);
  if (last !== undefined) {
    delete cursor[last];
  }
}

export function asRecord(value: unknown): JsonRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as JsonRecord : undefined;
}
