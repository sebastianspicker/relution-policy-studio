/** Typed application use cases for durable editor workspace state. */
import { assertPersistableWorkspaceShape } from "../workspace/storage.js";
import { validateWorkspace } from "../workspace/workspace-validation.js";
import type { PolicyWorkspace, WorkspaceValidationResult } from "../workspace/types.js";
import { assertWorkspaceIntegrity } from "../workspace/workspace-integrity.js";
import { synchronizeWorkspaceExportReport } from "../workspace/workspace-export-report.js";
import type { RelutionTemplateBundle } from "../contracts/template.js";

export interface EditorWorkspaceStatePort<TSidecar> {
  loadWorkspace(): PolicyWorkspace;
  replaceWorkspace(workspace: PolicyWorkspace, expectedRevision: string): { readonly workspace: PolicyWorkspace; readonly sidecar: TSidecar; readonly revision: string };
  loadSidecar(): TSidecar;
  reconcileRoundTripState(expectedRevision: string): { readonly workspace: PolicyWorkspace; readonly sidecar: TSidecar; readonly revision: string };
}

export interface WorkspaceStateResult<TSidecar> {
  readonly workspace: PolicyWorkspace;
  readonly validation: WorkspaceValidationResult;
  readonly sidecar: TSidecar;
  readonly revision: string;
}

export function loadEditorState<TSidecar>(state: EditorWorkspaceStatePort<TSidecar>): TSidecar {
  return state.loadSidecar();
}

export function replaceWorkspaceState<TSidecar>(
  workspace: PolicyWorkspace,
  expectedRevision: string,
  bundle: RelutionTemplateBundle,
  state: EditorWorkspaceStatePort<TSidecar>,
): WorkspaceStateResult<TSidecar> {
  return withValidation(state.replaceWorkspace(workspace, expectedRevision), bundle);
}

export function prepareWorkspaceReplacement(workspace: PolicyWorkspace): PolicyWorkspace {
    assertPersistableWorkspaceShape(workspace);
  synchronizeWorkspaceExportReport(workspace);
  assertWorkspaceIntegrity(workspace);
  return workspace;
}

export function validateWorkspaceState(workspace: PolicyWorkspace, bundle: RelutionTemplateBundle): WorkspaceValidationResult {
  return validateWorkspace(workspace, bundle);
}

export function reconcileRoundTripState<TSidecar>(
  expectedRevision: string,
  bundle: RelutionTemplateBundle,
  state: EditorWorkspaceStatePort<TSidecar>,
): WorkspaceStateResult<TSidecar> {
  return withValidation(state.reconcileRoundTripState(expectedRevision), bundle);
}

function withValidation<TSidecar>(
  result: { readonly workspace: PolicyWorkspace; readonly sidecar: TSidecar; readonly revision: string }, bundle: RelutionTemplateBundle,
): WorkspaceStateResult<TSidecar> {
  return { ...result, validation: validateWorkspace(result.workspace, bundle) };
}
