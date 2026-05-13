import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  createDdmArtifact,
  createMdmCommandArtifact,
  findAppleSchemaEntry,
  type AppleSchemaCatalog,
  type AppleSchemaValues,
  type DdmArtifact,
  type MdmCommandArtifact,
} from "./apple-schema.js";
import { inspectMobileConfigText } from "./plist.js";
import type { PolicyWorkspace } from "./workspace.js";
import { assertNoSymlinkPath } from "./utils/path-safety.js";

export interface EditorSidecarState {
  version: 1;
  appleSchemaRevision?: string;
  mobileConfigRestore: MobileConfigRestoreEntry[];
  ddmArtifacts: DdmArtifact[];
  mdmCommandArtifacts: MdmCommandArtifact[];
  customManifests: CustomManifestEntry[];
}

export interface MobileConfigRestoreEntry {
  policyPath: string;
  policyName: string;
  platform: string;
  configurationUuid: string;
  versionUuid?: string;
  versionIndex?: number;
  payloadType: string;
  displayName: string;
  signatureState: string;
  configuration: Record<string, unknown>;
}

export interface CustomManifestEntry {
  uuid: string;
  name: string;
  schema: Record<string, unknown>;
}

type JsonRecord = Record<string, unknown>;

const SIDECAR_FILE = "editor-sidecar.json";

export function loadEditorSidecar(workspaceDir: string): EditorSidecarState {
  const path = resolveEditorSidecarPath(workspaceDir);
  if (!existsSync(path)) {
    return emptySidecar();
  }
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!isRecord(parsed) || parsed.version !== 1) {
    return emptySidecar();
  }
  return {
    version: 1,
    ...(typeof parsed.appleSchemaRevision === "string" ? { appleSchemaRevision: parsed.appleSchemaRevision } : {}),
    mobileConfigRestore: Array.isArray(parsed.mobileConfigRestore) ? parsed.mobileConfigRestore.filter(isMobileConfigRestoreEntry) : [],
    ddmArtifacts: Array.isArray(parsed.ddmArtifacts) ? parsed.ddmArtifacts.filter(isDdmArtifact) : [],
    mdmCommandArtifacts: Array.isArray(parsed.mdmCommandArtifacts) ? parsed.mdmCommandArtifacts.filter(isMdmCommandArtifact) : [],
    customManifests: Array.isArray(parsed.customManifests) ? parsed.customManifests.filter(isCustomManifestEntry) : [],
  };
}

export function saveEditorSidecar(workspaceDir: string, sidecar: EditorSidecarState): void {
  const path = resolveEditorSidecarPath(workspaceDir);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(sidecar, null, 2)}\n`);
}

export function resetEditorSidecar(workspaceDir: string): void {
  const resolvedWorkspace = resolve(workspaceDir);
  assertNoSymlinkPath(workspaceDir, "", "Workspace sidecar path");
  rmSync(join(resolvedWorkspace, SIDECAR_FILE), { recursive: true, force: true });
}

export function recordMobileConfigRestoreEntries(
  workspaceDir: string,
  workspace: PolicyWorkspace,
  appleSchemaRevision?: string,
): EditorSidecarState {
  const sidecar = loadEditorSidecar(workspaceDir);
  const next: EditorSidecarState = {
    ...sidecar,
    ...(appleSchemaRevision === undefined ? {} : { appleSchemaRevision }),
    mobileConfigRestore: collectMobileConfigRestoreEntries(workspace),
  };
  saveEditorSidecar(workspaceDir, next);
  return next;
}

export function replaceEditorSidecarFromWorkspace(
  workspaceDir: string,
  workspace: PolicyWorkspace,
  appleSchemaRevision?: string,
): EditorSidecarState {
  const next: EditorSidecarState = {
    version: 1,
    ...(appleSchemaRevision === undefined ? {} : { appleSchemaRevision }),
    mobileConfigRestore: collectMobileConfigRestoreEntries(workspace),
    ddmArtifacts: [],
    mdmCommandArtifacts: [],
    customManifests: [],
  };
  saveEditorSidecar(workspaceDir, next);
  return next;
}

export function addDdmArtifact(workspaceDir: string, artifact: DdmArtifact, appleSchemaRevision?: string): EditorSidecarState {
  const sidecar = loadEditorSidecar(workspaceDir);
  const next = {
    ...sidecar,
    ...(appleSchemaRevision === undefined ? {} : { appleSchemaRevision }),
    ddmArtifacts: [...sidecar.ddmArtifacts, artifact],
  };
  saveEditorSidecar(workspaceDir, next);
  return next;
}

export function addMdmCommandArtifact(workspaceDir: string, artifact: MdmCommandArtifact, appleSchemaRevision?: string): EditorSidecarState {
  const sidecar = loadEditorSidecar(workspaceDir);
  const next = {
    ...sidecar,
    ...(appleSchemaRevision === undefined ? {} : { appleSchemaRevision }),
    mdmCommandArtifacts: [...sidecar.mdmCommandArtifacts, artifact],
  };
  saveEditorSidecar(workspaceDir, next);
  return next;
}

export function updateDdmArtifact(
  workspaceDir: string,
  catalog: AppleSchemaCatalog,
  uuid: string,
  values: AppleSchemaValues,
  appleSchemaRevision?: string,
): EditorSidecarState {
  const sidecar = loadEditorSidecar(workspaceDir);
  const index = sidecar.ddmArtifacts.findIndex((artifact) => artifact.uuid === uuid);
  if (index === -1) {
    throw new Error(`Unknown DDM artifact: ${uuid}`);
  }
  const existing = sidecar.ddmArtifacts[index]!;
  const entry = findAppleSchemaEntry(catalog, existing.schemaId);
  if (entry === undefined) {
    throw new Error(`Unknown Apple schema entry: ${existing.schemaId}`);
  }
  if (!entry.kind.startsWith("ddm-") || entry.kind === "ddm-status") {
    throw new Error(`Apple schema entry is not a DDM authoring declaration: ${entry.id}`);
  }
  const ddmArtifacts = [...sidecar.ddmArtifacts];
  ddmArtifacts[index] = { ...createDdmArtifact(entry, values), uuid: existing.uuid, schemaId: existing.schemaId };
  const next = {
    ...sidecar,
    ...(appleSchemaRevision === undefined ? {} : { appleSchemaRevision }),
    ddmArtifacts,
  };
  saveEditorSidecar(workspaceDir, next);
  return next;
}

export function updateMdmCommandArtifact(
  workspaceDir: string,
  catalog: AppleSchemaCatalog,
  uuid: string,
  values: AppleSchemaValues,
  appleSchemaRevision?: string,
): EditorSidecarState {
  const sidecar = loadEditorSidecar(workspaceDir);
  const index = sidecar.mdmCommandArtifacts.findIndex((artifact) => artifact.uuid === uuid);
  if (index === -1) {
    throw new Error(`Unknown MDM command artifact: ${uuid}`);
  }
  const existing = sidecar.mdmCommandArtifacts[index];
  if (existing === undefined) {
    throw new Error(`Unknown MDM command artifact: ${uuid}`);
  }
  const entry = findAppleSchemaEntry(catalog, existing.schemaId);
  if (entry === undefined) {
    throw new Error(`Unknown Apple schema entry: ${existing.schemaId}`);
  }
  if (entry.kind !== "mdm-command") {
    throw new Error(`Apple schema entry is not an MDM command: ${entry.id}`);
  }
  const mdmCommandArtifacts = [...sidecar.mdmCommandArtifacts];
  mdmCommandArtifacts[index] = { ...createMdmCommandArtifact(entry, values), uuid: existing.uuid, schemaId: existing.schemaId };
  const next = {
    ...sidecar,
    ...(appleSchemaRevision === undefined ? {} : { appleSchemaRevision }),
    mdmCommandArtifacts,
  };
  saveEditorSidecar(workspaceDir, next);
  return next;
}

export function removeDdmArtifact(workspaceDir: string, uuid: string, appleSchemaRevision?: string): EditorSidecarState {
  const sidecar = loadEditorSidecar(workspaceDir);
  if (!sidecar.ddmArtifacts.some((artifact) => artifact.uuid === uuid)) {
    throw new Error(`Unknown DDM artifact: ${uuid}`);
  }
  const next = {
    ...sidecar,
    ...(appleSchemaRevision === undefined ? {} : { appleSchemaRevision }),
    ddmArtifacts: sidecar.ddmArtifacts.filter((artifact) => artifact.uuid !== uuid),
  };
  saveEditorSidecar(workspaceDir, next);
  return next;
}

export function removeMdmCommandArtifact(workspaceDir: string, uuid: string, appleSchemaRevision?: string): EditorSidecarState {
  const sidecar = loadEditorSidecar(workspaceDir);
  if (!sidecar.mdmCommandArtifacts.some((artifact) => artifact.uuid === uuid)) {
    throw new Error(`Unknown MDM command artifact: ${uuid}`);
  }
  const next = {
    ...sidecar,
    ...(appleSchemaRevision === undefined ? {} : { appleSchemaRevision }),
    mdmCommandArtifacts: sidecar.mdmCommandArtifacts.filter((artifact) => artifact.uuid !== uuid),
  };
  saveEditorSidecar(workspaceDir, next);
  return next;
}

export function reconcileMobileConfigRestoreEntries(workspace: PolicyWorkspace, sidecar: EditorSidecarState): PolicyWorkspace {
  const restored = structuredClone(workspace) as PolicyWorkspace;
  for (const entry of sidecar.mobileConfigRestore) {
    const policy = restored.policies.find((candidate) => candidate.path === entry.policyPath) ??
      restored.policies.find((candidate) => candidate.document.name === entry.policyName && candidate.document.platform === entry.platform);
    if (policy === undefined || workspaceHasConfiguration(policy.document, entry)) {
      continue;
    }
    const targetVersion = restoreTargetVersion(policy.document, entry);
    if (targetVersion === undefined) {
      continue;
    }
    const configurations = Array.isArray(targetVersion.configurations) ? targetVersion.configurations : [];
    configurations.push(entry.configuration);
    targetVersion.configurations = configurations;
  }
  return restored;
}

function collectMobileConfigRestoreEntries(workspace: PolicyWorkspace): MobileConfigRestoreEntry[] {
  const entries: MobileConfigRestoreEntry[] = [];
  for (const policy of workspace.policies) {
    const policyName = typeof policy.document.name === "string" ? policy.document.name : policy.path;
    const platform = typeof policy.document.platform === "string" ? policy.document.platform : "UNKNOWN";
    const versions = Array.isArray(policy.document.versions) ? policy.document.versions : [];
    for (const [versionIndex, version] of versions.entries()) {
      const versionRecord = isRecord(version) ? version : undefined;
      const configurations = Array.isArray(versionRecord?.configurations) ? versionRecord.configurations : [];
      for (const configuration of configurations) {
        const configurationRecord = isRecord(configuration) ? configuration : undefined;
        const details = isRecord(configurationRecord?.details) ? configurationRecord.details : undefined;
        if (details?.type !== "APPLE_MOBILECONFIG") {
          continue;
        }
        const rawContent = typeof details.rawContent === "string" ? details.rawContent : "";
        const inspection = inspectMobileConfigText(rawContent);
        entries.push({
          policyPath: policy.path,
          policyName,
          platform,
          configurationUuid: typeof configurationRecord?.uuid === "string" ? configurationRecord.uuid : "",
          ...(typeof versionRecord?.uuid === "string" ? { versionUuid: versionRecord.uuid } : {}),
          versionIndex,
          payloadType: typeof details.secondLevelPayloadType === "string" ? details.secondLevelPayloadType : inspection.secondLevelPayloadType,
          displayName: typeof details.displayName === "string" ? details.displayName : inspection.displayName,
          signatureState: typeof details.mobileConfigSignatureState === "string" ? details.mobileConfigSignatureState : inspection.signatureState,
          configuration: structuredClone(configurationRecord ?? {}) as Record<string, unknown>,
        });
      }
    }
  }
  return entries;
}

function workspaceHasConfiguration(policy: JsonRecord, entry: MobileConfigRestoreEntry): boolean {
  const serializedConfiguration = entry.configurationUuid.length === 0 ? JSON.stringify(entry.configuration) : undefined;
  const versions = Array.isArray(policy.versions) ? policy.versions : [];
  return versions.some((version) => {
    const configurations = isRecord(version) && Array.isArray(version.configurations) ? version.configurations : [];
    return configurations.some((configuration) => {
      const record = isRecord(configuration) ? configuration : undefined;
      if (entry.configurationUuid.length > 0) {
        return record?.uuid === entry.configurationUuid;
      }
      return serializedConfiguration !== undefined && JSON.stringify(record ?? {}) === serializedConfiguration;
    });
  });
}

function restoreTargetVersion(policy: JsonRecord, entry: MobileConfigRestoreEntry): JsonRecord | undefined {
  const versions = Array.isArray(policy.versions) ? policy.versions.filter(isRecord) : [];
  if (versions.length === 0) {
    return undefined;
  }
  if (typeof entry.versionUuid === "string" && entry.versionUuid.length > 0) {
    return versions.find((version) => version.uuid === entry.versionUuid);
  }
  if (typeof entry.versionIndex === "number" && Number.isInteger(entry.versionIndex) && entry.versionIndex >= 0 && versions.length === 1) {
    return versions[entry.versionIndex];
  }
  return versions.length === 1 ? versions[0] : undefined;
}

function emptySidecar(): EditorSidecarState {
  return {
    version: 1,
    mobileConfigRestore: [],
    ddmArtifacts: [],
    mdmCommandArtifacts: [],
    customManifests: [],
  };
}

function resolveEditorSidecarPath(workspaceDir: string): string {
  const resolvedWorkspace = resolve(workspaceDir);
  assertNoSymlinkPath(workspaceDir, SIDECAR_FILE, "Workspace sidecar path");
  return join(resolvedWorkspace, SIDECAR_FILE);
}

function isMobileConfigRestoreEntry(value: unknown): value is MobileConfigRestoreEntry {
  return isRecord(value) &&
    typeof value.policyPath === "string" &&
    typeof value.policyName === "string" &&
    typeof value.platform === "string" &&
    typeof value.configurationUuid === "string" &&
    (value.versionUuid === undefined || typeof value.versionUuid === "string") &&
    (value.versionIndex === undefined || Number.isInteger(value.versionIndex)) &&
    typeof value.payloadType === "string" &&
    typeof value.displayName === "string" &&
    typeof value.signatureState === "string" &&
    isRecord(value.configuration);
}

function isDdmArtifact(value: unknown): value is DdmArtifact {
  return isRecord(value) && typeof value.uuid === "string" && typeof value.schemaId === "string" && isRecord(value.payload);
}

function isMdmCommandArtifact(value: unknown): value is MdmCommandArtifact {
  return isRecord(value) && typeof value.uuid === "string" && typeof value.schemaId === "string" && isRecord(value.payload);
}

function isCustomManifestEntry(value: unknown): value is CustomManifestEntry {
  return isRecord(value) && typeof value.uuid === "string" && typeof value.name === "string" && isRecord(value.schema);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
