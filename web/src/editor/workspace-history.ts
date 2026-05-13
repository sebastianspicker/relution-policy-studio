import type { Dispatch, SetStateAction } from "react";
import type { AppState, Selection } from "./types.js";
import type { WorkspaceHistoryEntry } from "./useEditorControllerActionTypes.js";

// Keeps undo useful without retaining large workspace snapshots for the whole session.
export const WORKSPACE_HISTORY_LIMIT = 20;

export interface WorkspaceHistoryInput {
  readonly currentState: AppState;
  readonly isDirty: boolean;
  readonly selection: Selection | undefined;
  readonly undoStack: readonly WorkspaceHistoryEntry[];
  readonly redoStack: readonly WorkspaceHistoryEntry[];
  readonly setState: Dispatch<SetStateAction<AppState | undefined>>;
  readonly setSelection: Dispatch<SetStateAction<Selection | undefined>>;
  readonly setIsDirty: Dispatch<SetStateAction<boolean>>;
  readonly setHasFreshBuild: Dispatch<SetStateAction<boolean>>;
  readonly setStatus: Dispatch<SetStateAction<string>>;
  readonly setUndoStack: Dispatch<SetStateAction<readonly WorkspaceHistoryEntry[]>>;
  readonly setRedoStack: Dispatch<SetStateAction<readonly WorkspaceHistoryEntry[]>>;
}

export function pushUndoState(input: WorkspaceHistoryInput): void {
  input.setUndoStack((current) => [...current, currentHistoryEntry(input)].slice(-WORKSPACE_HISTORY_LIMIT));
  input.setRedoStack([]);
}

export function clearWorkspaceHistory(input: Pick<WorkspaceHistoryInput, "setUndoStack" | "setRedoStack">): void {
  input.setUndoStack([]);
  input.setRedoStack([]);
}

export function createWorkspaceHistoryActions(input: WorkspaceHistoryInput): {
  readonly clearWorkspace: () => void;
  readonly undoWorkspace: () => void;
  readonly redoWorkspace: () => void;
} {
  return {
    clearWorkspace: () => {
      if (input.currentState.workspace.policies.length === 0 && !input.isDirty) {
        return;
      }
      if (!window.confirm("Clear all policies from this workspace? This does not touch Relution and can be undone before saving.")) {
        return;
      }
      pushUndoState(input);
      input.setState({ ...input.currentState, workspace: { ...input.currentState.workspace, report: {}, policies: [] } });
      input.setSelection(undefined);
      input.setIsDirty(true);
      input.setHasFreshBuild(false);
      input.setStatus("Cleared workspace");
    },
    undoWorkspace: () => {
      const previous = input.undoStack.at(-1);
      if (previous === undefined) {
        return;
      }
      input.setUndoStack(input.undoStack.slice(0, -1));
      input.setRedoStack((current) => [...current, currentHistoryEntry(input)].slice(-WORKSPACE_HISTORY_LIMIT));
      restoreHistoryEntry(input, previous, "Restored previous workspace state");
    },
    redoWorkspace: () => {
      const next = input.redoStack.at(-1);
      if (next === undefined) {
        return;
      }
      input.setRedoStack(input.redoStack.slice(0, -1));
      input.setUndoStack((current) => [...current, currentHistoryEntry(input)].slice(-WORKSPACE_HISTORY_LIMIT));
      restoreHistoryEntry(input, next, "Reapplied workspace state");
    },
  };
}

function restoreHistoryEntry(input: WorkspaceHistoryInput, entry: WorkspaceHistoryEntry, status: string): void {
  input.setState({ ...input.currentState, workspace: entry.workspace });
  input.setSelection(entry.selection);
  input.setIsDirty(entry.isDirty);
  input.setHasFreshBuild(false);
  input.setStatus(status);
}

function currentHistoryEntry(input: WorkspaceHistoryInput): WorkspaceHistoryEntry {
  return { workspace: input.currentState.workspace, selection: input.selection, isDirty: input.isDirty };
}
