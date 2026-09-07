/** Persists workspace state while retaining request-epoch and history semantics. */
import type { PolicyWorkspace, WorkspaceValidationResult } from "../../../src/browser/workspace.js";
import { postJson } from "./editor-api-client.js";
import { readJsonResponse } from "./editor-record-utils.js";
import type { WorkspaceRequest, WorkspaceRequestGuard } from "./editor-workspace-request-guard.js";
import type { AppState } from "./editor-contracts.js";
import type { EditorControllerWorkspaceSetters } from "./editor-controller-action-contracts.js";
import { mergeWorkspaceServerUpdate, type WorkspaceServerUpdate } from "./editor-workspace-response.js";
import { clearWorkspaceHistory, type WorkspaceHistoryInput } from "./workspace-history.js";

interface WorkspacePersistenceInput {
  readonly currentState: AppState;
  readonly isDirty: boolean;
  readonly guard: WorkspaceRequestGuard;
  readonly historyInput: Pick<WorkspaceHistoryInput, "setUndoStack" | "setRedoStack">;
  readonly setState: EditorControllerWorkspaceSetters["setState"];
  readonly setIsDirty: EditorControllerWorkspaceSetters["setIsDirty"];
  readonly onSavedBeforeAction: () => void;
}

/** Persists the current workspace only when the initiating request remains applicable. */
export function createWorkspacePersistence(input: WorkspacePersistenceInput) {
  async function persistWorkspace(nextWorkspace: PolicyWorkspace, request: WorkspaceRequest): Promise<{
    workspace: PolicyWorkspace;
    validation: WorkspaceValidationResult;
    sidecar?: AppState["sidecar"];
    revision: string;
  } | undefined> {
    const response = await postJson("/api/workspace", { workspace: nextWorkspace, expectedRevision: input.currentState.revision });
    const updated = await readJsonResponse<WorkspaceServerUpdate>(response);
    if (!response.ok) throw new Error(JSON.stringify(updated));
    if (!input.guard.isApplicable(request)) return undefined;
    input.setState((current) => mergeWorkspaceServerUpdate(current, updated));
    input.setIsDirty(false);
    clearWorkspaceHistory(input.historyInput);
    return updated;
  }

  async function ensureSavedWorkspace(request: WorkspaceRequest): Promise<{ readonly workspace: PolicyWorkspace; readonly revision: string } | undefined> {
    if (!input.isDirty) return { workspace: input.currentState.workspace, revision: input.currentState.revision };
    const updated = await persistWorkspace(input.currentState.workspace, request);
    if (updated === undefined) return undefined;
    input.onSavedBeforeAction();
    return { workspace: updated.workspace, revision: updated.revision };
  }

  return { persistWorkspace, ensureSavedWorkspace };
}
