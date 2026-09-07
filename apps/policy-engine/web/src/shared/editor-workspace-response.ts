/** Canonical merge for authoritative workspace responses. */
import type { PolicyWorkspace, WorkspaceValidationResult } from "../../../src/browser/workspace.js";
import type { AppState } from "./editor-contracts.js";

export interface WorkspaceServerUpdate {
  readonly revision: string;
  readonly workspace: PolicyWorkspace;
  readonly validation: WorkspaceValidationResult;
  readonly sidecar?: AppState["sidecar"];
}

export function mergeWorkspaceServerUpdate(current: AppState | undefined, updated: WorkspaceServerUpdate): AppState | undefined {
  if (current === undefined) return undefined;
  return {
    ...current,
    revision: updated.revision,
    workspace: updated.workspace,
    validation: updated.validation,
    sidecar: updated.sidecar ?? current.sidecar,
  };
}
