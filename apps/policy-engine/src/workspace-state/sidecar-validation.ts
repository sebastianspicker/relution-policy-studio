/** Validates persisted sidecar records before they influence editor state. */
import type { JsonRecord } from "../platform/serialization/json-guards.js";
import {
  emptyEditorSidecar,
  type CustomManifestEntry,
  type EditorSidecarState,
  type MobileConfigRestoreEntry,
  type SidecarDdmArtifact,
  type SidecarMdmCommandArtifact,
} from "./sidecar-types.js";

export function parseEditorSidecar(text: string): EditorSidecarState {
  const parsed = JSON.parse(text) as unknown;
  if (!isRecord(parsed) || parsed.version !== 1) throw malformed("expected version 1 sidecar object");
  if (parsed.appleSchemaRevision !== undefined && typeof parsed.appleSchemaRevision !== "string") {
    throw malformed("expected appleSchemaRevision string");
  }
  const state: EditorSidecarState = {
    ...emptyEditorSidecar(),
    ...(parsed.appleSchemaRevision === undefined ? {} : { appleSchemaRevision: parsed.appleSchemaRevision }),
    mobileConfigRestore: requireArray(parsed, "mobileConfigRestore", isMobileConfigRestoreEntry),
    ddmArtifacts: requireArray(parsed, "ddmArtifacts", isDdmArtifact),
    mdmCommandArtifacts: requireArray(parsed, "mdmCommandArtifacts", isMdmCommandArtifact),
    customManifests: requireArray(parsed, "customManifests", isCustomManifestEntry),
  };
  assertUniqueArtifactUuids(state);
  return state;
}

export function validateSidecarInput(sidecar: EditorSidecarState): void {
  try {
    parseEditorSidecar(JSON.stringify(sidecar));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid editor sidecar input: ${message}`);
  }
}

function assertUniqueArtifactUuids(sidecar: EditorSidecarState): void {
  assertUniqueUuids(sidecar.ddmArtifacts, "ddmArtifacts");
  assertUniqueUuids(sidecar.mdmCommandArtifacts, "mdmCommandArtifacts");
}

function assertUniqueUuids(entries: readonly { uuid: string }[], label: string): void {
  const uuids = new Set<string>();
  for (const entry of entries) {
    if (uuids.has(entry.uuid)) throw malformed(`duplicate ${label} UUID: ${entry.uuid}`);
    uuids.add(entry.uuid);
  }
}

function isMobileConfigRestoreEntry(value: unknown): value is MobileConfigRestoreEntry {
  return isRecord(value) && typeof value.policyPath === "string" && typeof value.policyName === "string" &&
    typeof value.platform === "string" && typeof value.configurationUuid === "string" &&
    (value.versionUuid === undefined || typeof value.versionUuid === "string") &&
    (value.versionIndex === undefined || Number.isInteger(value.versionIndex)) &&
    typeof value.payloadType === "string" && typeof value.displayName === "string" &&
    typeof value.signatureState === "string" && isRecord(value.configuration);
}

function isDdmArtifact(value: unknown): value is SidecarDdmArtifact {
  return isRecord(value) && isNonEmptyString(value.uuid) && isNonEmptyString(value.schemaId) &&
    isDdmKind(value.kind) && isNonEmptyString(value.identifier) && isNonEmptyString(value.title) &&
    isRecord(value.values) && isRecord(value.payload);
}

function isMdmCommandArtifact(value: unknown): value is SidecarMdmCommandArtifact {
  return isRecord(value) && isNonEmptyString(value.uuid) && isNonEmptyString(value.schemaId) &&
    isNonEmptyString(value.requestType) && isNonEmptyString(value.title) && isRecord(value.values) &&
    isRecord(value.payload) && value.payload.RequestType === value.requestType;
}

function isCustomManifestEntry(value: unknown): value is CustomManifestEntry {
  return isRecord(value) && typeof value.uuid === "string" && typeof value.name === "string" && isRecord(value.schema);
}

function isDdmKind(value: unknown): boolean {
  return value === "ddm-configuration" || value === "ddm-asset" || value === "ddm-activation" || value === "ddm-management";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function requireArray<T>(record: JsonRecord, key: string, predicate: (value: unknown) => value is T): T[] {
  const value = record[key];
  if (!Array.isArray(value)) throw malformed(`expected ${key} array`);
  return value.map((entry, index) => {
    if (!predicate(entry)) throw malformed(`invalid ${key}[${String(index)}]`);
    return entry;
  });
}

function malformed(message: string): Error {
  return new Error(`Malformed editor-sidecar.json: ${message}`);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
