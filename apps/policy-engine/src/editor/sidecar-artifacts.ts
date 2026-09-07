/** Mutates validated DDM and MDM artifact collections. */
import { findAppleSchemaEntry } from "../apple/apple-schema-catalog-access.js";
import type { AppleSchemaCatalog, AppleSchemaValues } from "../apple/apple-schema-types.js";
import type { EditorSidecarState } from "../workspace-state/sidecar-types.js";
import type { ManagedArtifact, ManagedArtifactOperations } from "./sidecar-artifact-contracts.js";

export function addManagedArtifact<T extends ManagedArtifact>(sidecar: EditorSidecarState, artifact: T, operations: ManagedArtifactOperations<T>): EditorSidecarState {
  const artifacts = operations.artifacts(sidecar);
  if (artifacts.some((candidate) => candidate.uuid === artifact.uuid)) throw new Error(`Duplicate ${operations.label} UUID: ${artifact.uuid}`);
  return operations.replaceArtifacts(sidecar, [...artifacts, structuredClone(artifact)]);
}

export function updateManagedArtifact<T extends ManagedArtifact>(
  sidecar: EditorSidecarState,
  catalog: AppleSchemaCatalog,
  uuid: string,
  values: AppleSchemaValues,
  operations: ManagedArtifactOperations<T>,
): EditorSidecarState {
  const artifacts = operations.artifacts(sidecar);
  const index = artifacts.findIndex((artifact) => artifact.uuid === uuid);
  if (index === -1) throw new Error(`Unknown ${operations.label}: ${uuid}`);
  const existing = artifacts[index]!;
  const entry = findAppleSchemaEntry(catalog, existing.schemaId);
  if (entry === undefined) throw new Error(`Unknown Apple schema entry: ${existing.schemaId}`);
  if (!operations.accepts(entry)) throw new Error(operations.invalidEntryMessage(entry));
  const next = [...artifacts];
  next[index] = { ...operations.create(entry, values), uuid: existing.uuid, schemaId: existing.schemaId };
  return operations.replaceArtifacts(sidecar, next);
}

export function removeManagedArtifact<T extends ManagedArtifact>(sidecar: EditorSidecarState, uuid: string, operations: ManagedArtifactOperations<T>): EditorSidecarState {
  const artifacts = operations.artifacts(sidecar);
  if (!artifacts.some((artifact) => artifact.uuid === uuid)) throw new Error(`Unknown ${operations.label}: ${uuid}`);
  return operations.replaceArtifacts(sidecar, artifacts.filter((artifact) => artifact.uuid !== uuid));
}
