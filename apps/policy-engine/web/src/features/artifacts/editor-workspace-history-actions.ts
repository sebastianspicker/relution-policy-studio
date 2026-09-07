/** Coordinates undo-history updates around workspace-changing actions. */
import type { WorkspaceHistoryActionsInput } from "./editor-workspace-history-contract.js";
import { WORKSPACE_HISTORY_LIMIT } from "../../shared/workspace-history.js";
import type { WorkspaceHistoryEntry } from "../../shared/editor-controller-action-contracts.js";

export function createWorkspaceHistoryActions(input: WorkspaceHistoryActionsInput): {
  readonly clearWorkspace: () => void;
  readonly undoWorkspace: () => void;
  readonly redoWorkspace: () => void;
} {
  function currentHistoryEntry(): WorkspaceHistoryEntry { return { workspace: input.currentWorkspace, selection: input.selection, isDirty: input.isDirty }; }
  function restoreHistoryEntry(entry: WorkspaceHistoryEntry, status: string): void {
    if (!input.requestGuard.recordEdit()) { input.setActionErrorStatus("A server workspace mutation is in progress"); return; }
    input.setState((current) => current === undefined ? current : { ...current, workspace: entry.workspace });
    input.setSelection(entry.selection); input.setIsDirty(entry.isDirty); input.setHasFreshBuild(false); input.setActionSuccessStatus(status);
  }
  function clearWorkspace(): void {
    if (input.currentWorkspace.policies.length === 0 && !input.isDirty) return;
    if (!input.requestGuard.recordEdit()) { input.setActionErrorStatus("A server workspace mutation is in progress"); return; }
    input.pushUndoState(); input.setState((current) => current === undefined ? current : { ...current, workspace: { ...current.workspace, report: {}, policies: [] } });
    input.setSelection(undefined); input.setIsDirty(true); input.setHasFreshBuild(false); input.setActionSuccessStatus("Cleared workspace");
  }
  function undoWorkspace(): void {
    if (!input.requestGuard.canEditWorkspace()) { input.setActionErrorStatus("A server workspace mutation is in progress"); return; }
    const previous = input.undoStack.at(-1); if (previous === undefined) return;
    input.setUndoStack(input.undoStack.slice(0, -1)); input.setRedoStack((current) => [...current, currentHistoryEntry()].slice(-WORKSPACE_HISTORY_LIMIT));
    restoreHistoryEntry(previous, "Restored previous workspace state");
  }
  function redoWorkspace(): void {
    if (!input.requestGuard.canEditWorkspace()) { input.setActionErrorStatus("A server workspace mutation is in progress"); return; }
    const next = input.redoStack.at(-1); if (next === undefined) return;
    input.setRedoStack(input.redoStack.slice(0, -1)); input.setUndoStack((current) => [...current, currentHistoryEntry()].slice(-WORKSPACE_HISTORY_LIMIT));
    restoreHistoryEntry(next, "Reapplied workspace state");
  }
  return { clearWorkspace, undoWorkspace, redoWorkspace };
}
