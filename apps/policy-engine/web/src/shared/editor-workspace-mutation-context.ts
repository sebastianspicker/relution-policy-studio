/** Shares state wiring and exclusive request lifecycle across workspace mutations. */
import type { SetStateAction } from "react";
import type { PolicyWorkspace } from "../../../src/browser/workspace.js";
import type { WorkspaceHistoryInput } from "./workspace-history.js";
import type { WorkspaceRequest, WorkspaceRequestGuard } from "./editor-workspace-request-guard.js";
import type { AppState, Selection } from "./editor-contracts.js";
import { reportEditorActionFailure } from "./editor-action-failure.js";

export type EditorActionStatus = {
  readonly setActionSuccessStatus: (message: string) => void;
  readonly setActionErrorStatus: (message: string) => void;
  readonly setLastActionResult: (result: { readonly ok: false; readonly error: string }) => void;
  readonly setStatus: (message: string) => void;
};

export type WorkspaceMutationInput = {
  readonly currentState: AppState;
  readonly selection: Selection | undefined;
  readonly selectedType: string;
  readonly newPolicyPlatform: string;
  readonly newPolicyName: string;
  readonly requestGuard: WorkspaceRequestGuard;
  readonly ensureSavedWorkspace: (request: WorkspaceRequest) => Promise<{ readonly workspace: PolicyWorkspace; readonly revision: string } | undefined>;
  readonly historyInput: WorkspaceHistoryInput;
  readonly markWorkspaceDirty: (workspace: PolicyWorkspace, selection: Selection | undefined, message: string) => boolean;
  readonly setState: (state: SetStateAction<AppState | undefined>) => void;
  readonly setSelection: (selection: Selection | undefined) => void;
  readonly setSelectedType: (value: string) => void;
  readonly setNewPolicyName: (value: string) => void;
  readonly setIsDirty: (value: boolean) => void;
  readonly setHasFreshBuild: (value: boolean) => void;
} & EditorActionStatus;

export type WorkspaceMutationActions = {
  readonly addConfiguration: () => Promise<void>;
  readonly addPolicy: () => Promise<void>;
  readonly removeConfiguration: (selection: Selection) => Promise<void>;
  readonly moveConfiguration: (selection: Selection, direction: "up" | "down") => Promise<void>;
  readonly reconcileSidecar: () => Promise<void>;
};

export async function runExclusiveWorkspaceMutation(
  input: WorkspaceMutationInput,
  action: (request: WorkspaceRequest) => Promise<void>,
  failure: string,
): Promise<void> {
  const request = input.requestGuard.beginExclusiveMutation();
  if (request === undefined) {
    input.setActionErrorStatus("A server workspace mutation is already in progress");
    return;
  }
  try {
    await action(request);
  } catch (error) {
    if (!input.requestGuard.isExclusiveCurrent(request)) return;
    reportEditorActionFailure(input, failure, error);
  } finally {
    input.requestGuard.finishExclusiveMutation(request);
  }
}
