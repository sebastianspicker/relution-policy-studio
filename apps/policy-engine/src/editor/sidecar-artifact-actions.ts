/** Exposes typed DDM and MDM artifact mutations backed by sidecar persistence. */
import type { AppleSchemaCatalog, AppleSchemaValues, DdmArtifact, MdmCommandArtifact } from "../apple/apple-schema-types.js";
import { addManagedArtifact, removeManagedArtifact, updateManagedArtifact } from "./sidecar-artifacts.js";
import { DDM_ARTIFACT_OPERATIONS, MDM_COMMAND_ARTIFACT_OPERATIONS, type ManagedArtifact, type ManagedArtifactOperations } from "./sidecar-artifact-contracts.js";
import { asSidecarInputError, type EditorSidecarState } from "../workspace-state/sidecar-types.js";

/** Applies typed DDM and MDM artifact changes to already loaded sidecar state. */
export function addDdmArtifact(sidecar: EditorSidecarState, artifact: DdmArtifact, appleSchemaRevision?: string): EditorSidecarState {
  return updateArtifact(sidecar, appleSchemaRevision, (current) => addManagedArtifact(current, artifact, DDM_ARTIFACT_OPERATIONS));
}

export function addMdmCommandArtifact(sidecar: EditorSidecarState, artifact: MdmCommandArtifact, appleSchemaRevision?: string): EditorSidecarState {
  return updateArtifact(sidecar, appleSchemaRevision, (current) => addManagedArtifact(current, artifact, MDM_COMMAND_ARTIFACT_OPERATIONS));
}

export function updateDdmArtifact(sidecar: EditorSidecarState, catalog: AppleSchemaCatalog, uuid: string, values: AppleSchemaValues, appleSchemaRevision?: string): EditorSidecarState {
  return updateSchemaArtifact(sidecar, catalog, uuid, values, appleSchemaRevision, DDM_ARTIFACT_OPERATIONS);
}

export function updateMdmCommandArtifact(sidecar: EditorSidecarState, catalog: AppleSchemaCatalog, uuid: string, values: AppleSchemaValues, appleSchemaRevision?: string): EditorSidecarState {
  return updateSchemaArtifact(sidecar, catalog, uuid, values, appleSchemaRevision, MDM_COMMAND_ARTIFACT_OPERATIONS);
}

function updateSchemaArtifact<T extends ManagedArtifact>(
  sidecar: EditorSidecarState,
  catalog: AppleSchemaCatalog,
  uuid: string,
  values: AppleSchemaValues,
  appleSchemaRevision: string | undefined,
  operations: ManagedArtifactOperations<T>,
): EditorSidecarState {
  return updateArtifact(sidecar, appleSchemaRevision, (current) => updateManagedArtifact(current, catalog, uuid, values, operations));
}

export function removeDdmArtifact(sidecar: EditorSidecarState, uuid: string, appleSchemaRevision?: string): EditorSidecarState {
  return updateArtifact(sidecar, appleSchemaRevision, (current) => removeManagedArtifact(current, uuid, DDM_ARTIFACT_OPERATIONS));
}

export function removeMdmCommandArtifact(sidecar: EditorSidecarState, uuid: string, appleSchemaRevision?: string): EditorSidecarState {
  return updateArtifact(sidecar, appleSchemaRevision, (current) => removeManagedArtifact(current, uuid, MDM_COMMAND_ARTIFACT_OPERATIONS));
}

function updateArtifact(sidecar: EditorSidecarState, revision: string | undefined, update: (sidecar: EditorSidecarState) => EditorSidecarState): EditorSidecarState {
  let revised: EditorSidecarState;
  try {
    const next = update(sidecar);
    revised = revision === undefined ? next : { ...next, appleSchemaRevision: revision };
  } catch (error) {
    throw asSidecarInputError(error);
  }
  return revised;
}
