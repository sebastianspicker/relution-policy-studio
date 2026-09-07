/** Filesystem adapter for editor workspace application use cases. */
import { lstatSync } from "node:fs";
import { join } from "node:path";
import { collectMobileConfigRestoreEntries } from "./sidecar-mobileconfig-restore.js";
import { reconcileMobileConfigRestoreEntries } from "./sidecar-mobileconfig-reconcile.js";
import type { EditorSidecarState } from "./sidecar-types.js";
import { emptyEditorSidecar } from "./sidecar-types.js";
import { parseEditorSidecar } from "./sidecar-validation.js";
import {
  captureWorkspaceStateArchiveSnapshot,
  initializeWorkspaceState,
  loadWorkspaceStateSnapshot,
  mutateWorkspaceState,
  workspaceStateRevision,
  type WorkspaceState,
} from "./persistence.js";
export { WorkspaceStateRevisionConflictError } from "./persistence.js";

/** The editor supplies only state ownership inputs; this module never depends on HTTP context. */
export interface EditorWorkspaceStateInput {
  readonly workspaceDir: string;
  readonly appleSchemaRevision: string;
}

export type EditorWorkspaceMutation = (workspace: WorkspaceState["workspace"]) => WorkspaceState["workspace"];
export type EditorSidecarMutation = (sidecar: EditorSidecarState) => EditorSidecarState;

export interface EditorWorkspaceStateResult {
  readonly workspace: WorkspaceState["workspace"];
  readonly sidecar: EditorSidecarState;
  readonly revision: string;
}

/** Recovers and reads the complete editor state as one consistent pair. */
export function loadEditorWorkspaceState(
  context: EditorWorkspaceStateInput,
  expectedRevision?: string,
): EditorWorkspaceStateResult {
  const snapshot = loadWorkspaceStateSnapshot(context.workspaceDir, expectedRevision);
  return { ...editorStateFromWorkspaceState(snapshot.state), revision: snapshot.revision };
}

/**
 * The HTTP server currently adapts its durable workspace transaction here.
 * A durable unit of work can replace this port without changing the use cases.
 */
export function createEditorWorkspaceStatePort(context: EditorWorkspaceStateInput) {
  return {
    loadWorkspace: () => loadEditorWorkspaceState(context).workspace,
    replaceWorkspace: (nextWorkspace: WorkspaceState["workspace"], expectedRevision: string) => replaceEditorWorkspaceState(context, nextWorkspace, expectedRevision),
    loadSidecar: () => loadEditorWorkspaceState(context).sidecar,
    reconcileRoundTripState: (expectedRevision: string) => reconcileEditorRoundTripState(context, expectedRevision),
  };
}

/** Captures a frozen validation view and an opaque source for archive packing. */
export function captureEditorArchiveSnapshot<T>(
  context: EditorWorkspaceStateInput,
  buildArchive: (key: string, workspace: Readonly<WorkspaceState["workspace"]>) => T,
): {
  readonly validationWorkspace: Readonly<WorkspaceState["workspace"]>;
  readonly sidecar: Readonly<EditorSidecarState>;
  buildVerifiedArchive(key: string): T;
  dispose(): void;
} {
  const snapshot = captureWorkspaceStateArchiveSnapshot(context.workspaceDir);
  const sidecar = freezeSnapshotProjection(sidecarFromSerializedState(snapshot.sidecar));
  return {
    validationWorkspace: snapshot.validationWorkspace,
    sidecar,
    buildVerifiedArchive: (key) => snapshot.pack((workspace) => buildArchive(key, workspace)),
    dispose: snapshot.dispose,
  };
}

/** Applies one workspace mutation and publishes its refreshed sidecar in one unit of work. */
export function mutateEditorWorkspaceState(
  context: EditorWorkspaceStateInput,
  mutate: EditorWorkspaceMutation,
  expectedRevision?: string,
): EditorWorkspaceStateResult {
  const next = mutateWorkspaceState(context.workspaceDir, (current) => {
    const workspace = mutate(current.workspace);
    const sidecar = sidecarWithMobileConfigRestore(current, workspace, context.appleSchemaRevision);
    return { workspace, sidecar: serializedSidecar(sidecar) };
  }, expectedRevision === undefined ? {} : { expectedRevision });
  return { ...editorStateFromWorkspaceState(next), revision: workspaceStateRevision(next) };
}

/** Applies one sidecar-only mutation while republishing the unchanged workspace in the same unit of work. */
export function mutateEditorSidecarState(
  context: EditorWorkspaceStateInput,
  mutate: EditorSidecarMutation,
  expectedRevision?: string,
): EditorWorkspaceStateResult {
  const next = mutateWorkspaceState(context.workspaceDir, (current) => {
    const sidecar = mutate(sidecarFromWorkspaceState(current));
    return { workspace: current.workspace, sidecar: serializedSidecar(sidecar) };
  }, expectedRevision === undefined ? {} : { expectedRevision });
  return { ...editorStateFromWorkspaceState(next), revision: workspaceStateRevision(next) };
}

/** Publishes an imported archive with a fresh editor sidecar, matching import semantics. */
export function replaceEditorWorkspaceFromArchive(
  context: EditorWorkspaceStateInput,
  workspace: WorkspaceState["workspace"],
  options: { readonly force?: boolean; readonly expectedRevision?: string } = {},
): EditorWorkspaceStateResult {
  const sidecar: EditorSidecarState = {
    ...emptyEditorSidecar(),
    appleSchemaRevision: context.appleSchemaRevision,
    mobileConfigRestore: collectMobileConfigRestoreEntries(workspace),
  };
  const next = { workspace, sidecar: serializedSidecar(sidecar) };
  if (options.force === true) {
    // Initialization owns recovery, destination validation, and publication
    // under one lock. Do not preflight this path outside that critical section.
    const persisted = initializeWorkspaceState(context.workspaceDir, next, { force: true });
    return { ...editorStateFromWorkspaceState(persisted), revision: workspaceStateRevision(persisted) };
  } else if (options.expectedRevision !== undefined) {
    const persisted = mutateWorkspaceState(context.workspaceDir, () => next, { expectedRevision: options.expectedRevision });
    return { ...editorStateFromWorkspaceState(persisted), revision: workspaceStateRevision(persisted) };
  } else if (hasPersistedWorkspaceSurface(context.workspaceDir)) {
    throw new Error("Archive import requires an expected workspace revision after initialization");
  } else {
    const persisted = initializeWorkspaceState(context.workspaceDir, next, { force: true });
    return { ...editorStateFromWorkspaceState(persisted), revision: workspaceStateRevision(persisted) };
  }
}

function hasPersistedWorkspaceSurface(workspaceDir: string): boolean {
  try {
    return ["metadata.json", "report.json", "policies"].every((entry) => lstatSync(join(workspaceDir, entry)).isFile() || (entry === "policies" && lstatSync(join(workspaceDir, entry)).isDirectory()));
  } catch {
    return false;
  }
}

function sidecarWithMobileConfigRestore(
  current: WorkspaceState, workspace: WorkspaceState["workspace"], appleSchemaRevision: string,
): EditorSidecarState {
  const existing = current.sidecar.kind === "missing" ? undefined : sidecarFromWorkspaceState(current);
  return {
    ...(existing ?? emptyEditorSidecar()),
    appleSchemaRevision,
    mobileConfigRestore: collectMobileConfigRestoreEntries(workspace),
  };
}

function replaceEditorWorkspaceState(
  context: EditorWorkspaceStateInput,
  workspace: WorkspaceState["workspace"],
  expectedRevision: string,
): EditorWorkspaceStateResult {
  return mutateEditorWorkspaceState(context, () => workspace, expectedRevision);
}

function reconcileEditorRoundTripState(
  context: EditorWorkspaceStateInput,
  expectedRevision: string,
): EditorWorkspaceStateResult {
  const next = mutateWorkspaceState(context.workspaceDir, (current) => {
    const reconciled = reconcileMobileConfigRestoreEntries(current.workspace, sidecarFromWorkspaceState(current));
    const sidecar = sidecarWithMobileConfigRestore(current, reconciled, context.appleSchemaRevision);
    return { workspace: reconciled, sidecar: serializedSidecar(sidecar) };
  }, { expectedRevision });
  return { ...editorStateFromWorkspaceState(next), revision: workspaceStateRevision(next) };
}

function editorStateFromWorkspaceState(state: WorkspaceState): { readonly workspace: WorkspaceState["workspace"]; readonly sidecar: EditorSidecarState } {
  return { workspace: state.workspace, sidecar: sidecarFromWorkspaceState(state) };
}

function sidecarFromWorkspaceState(state: WorkspaceState): EditorSidecarState {
  return sidecarFromSerializedState(state.sidecar);
}

function sidecarFromSerializedState(sidecar: WorkspaceState["sidecar"]): EditorSidecarState {
  return sidecar.kind === "missing" ? emptyEditorSidecar() : parseEditorSidecar(sidecar.contents.toString("utf8"));
}

function serializedSidecar(sidecar: EditorSidecarState): WorkspaceState["sidecar"] {
  return { kind: "file", contents: Buffer.from(`${JSON.stringify(sidecar, null, 2)}\n`, "utf8") };
}

function freezeSnapshotProjection<T>(value: T): T {
  if (typeof value !== "object" || value === null) return value;
  for (const child of Object.values(value)) freezeSnapshotProjection(child);
  return Object.freeze(value);
}
