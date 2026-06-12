import type { Dispatch, SetStateAction } from "react";
import type { AppState, EditorActionResult, Selection } from "./types.js";
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
  readonly setLastActionResult: Dispatch<SetStateAction<EditorActionResult | undefined>>;
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

function currentHistoryEntry(input: WorkspaceHistoryInput): WorkspaceHistoryEntry {
  return { workspace: input.currentState.workspace, selection: input.selection, isDirty: input.isDirty };
}
