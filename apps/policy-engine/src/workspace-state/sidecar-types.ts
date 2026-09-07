/** Public sidecar data contracts shared by persistence and editor routes. */
export const EDITOR_SIDECAR_FILE = "editor-sidecar.json";
export const MAX_EDITOR_SIDECAR_JSON_BYTES = 16 * 1024 * 1024;

export interface EditorSidecarState {
  version: 1;
  appleSchemaRevision?: string;
  mobileConfigRestore: MobileConfigRestoreEntry[];
  ddmArtifacts: SidecarDdmArtifact[];
  mdmCommandArtifacts: SidecarMdmCommandArtifact[];
  customManifests: CustomManifestEntry[];
}

export class SidecarInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SidecarInputError";
  }
}

export function asSidecarInputError(error: unknown): SidecarInputError {
  if (error instanceof SidecarInputError) return error;
  return new SidecarInputError(error instanceof Error ? error.message : String(error));
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

/** Persisted artifact records intentionally do not depend on Apple schema implementation types. */
export interface SidecarDdmArtifact {
  uuid: string;
  schemaId: string;
  kind: "profile" | "ddm-configuration" | "ddm-asset" | "ddm-activation" | "ddm-management" | "ddm-status" | "mdm-command" | "mdm-checkin" | "ddm-protocol";
  identifier: string;
  title: string;
  values: Record<string, unknown>;
  payload: Record<string, unknown>;
}

export interface SidecarMdmCommandArtifact {
  uuid: string;
  schemaId: string;
  requestType: string;
  title: string;
  values: Record<string, unknown>;
  payload: Record<string, unknown>;
}

export function emptyEditorSidecar(): EditorSidecarState {
  return {
    version: 1,
    mobileConfigRestore: [],
    ddmArtifacts: [],
    mdmCommandArtifacts: [],
    customManifests: [],
  };
}
