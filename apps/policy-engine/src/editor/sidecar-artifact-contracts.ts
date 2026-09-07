/** Defines DDM and MDM artifact collection behavior for sidecar updates. */
import { createDdmArtifact, createMdmCommandArtifact } from "../apple/apple-schema-body.js";
import type { AppleSchemaEntry, AppleSchemaValues, DdmArtifact, MdmCommandArtifact } from "../apple/apple-schema-types.js";
import type { EditorSidecarState } from "../workspace-state/sidecar-types.js";

export type ManagedArtifact = DdmArtifact | MdmCommandArtifact;

export type ManagedArtifactOperations<T extends ManagedArtifact> = {
  readonly label: string;
  readonly artifacts: (sidecar: EditorSidecarState) => readonly T[];
  readonly replaceArtifacts: (sidecar: EditorSidecarState, artifacts: T[]) => EditorSidecarState;
  readonly create: (entry: AppleSchemaEntry, values: AppleSchemaValues) => T;
  readonly accepts: (entry: AppleSchemaEntry) => boolean;
  readonly invalidEntryMessage: (entry: AppleSchemaEntry) => string;
};

export const DDM_ARTIFACT_OPERATIONS: ManagedArtifactOperations<DdmArtifact> = {
  label: "DDM artifact",
  artifacts: (sidecar) => sidecar.ddmArtifacts,
  replaceArtifacts: (sidecar, ddmArtifacts) => ({ ...sidecar, ddmArtifacts }),
  create: createDdmArtifact,
  accepts: isDdmAuthoringEntry,
  invalidEntryMessage: ddmAuthoringEntryError,
};

export const MDM_COMMAND_ARTIFACT_OPERATIONS: ManagedArtifactOperations<MdmCommandArtifact> = {
  label: "MDM command artifact",
  artifacts: (sidecar) => sidecar.mdmCommandArtifacts,
  replaceArtifacts: (sidecar, mdmCommandArtifacts) => ({ ...sidecar, mdmCommandArtifacts }),
  create: createMdmCommandArtifact,
  accepts: isMdmCommandEntry,
  invalidEntryMessage: mdmCommandEntryError,
};

export function isDdmAuthoringEntry(entry: AppleSchemaEntry): boolean {
  return entry.kind.startsWith("ddm-") && entry.kind !== "ddm-status";
}

export function ddmAuthoringEntryError(entry: AppleSchemaEntry): string {
  return `Apple schema entry is not a DDM authoring declaration: ${entry.id}`;
}

export function isMdmCommandEntry(entry: AppleSchemaEntry): boolean {
  return entry.kind === "mdm-command";
}

export function mdmCommandEntryError(entry: AppleSchemaEntry): string {
  return `Apple schema entry is not an MDM command: ${entry.id}`;
}
