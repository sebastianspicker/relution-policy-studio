/** Updates archive-passphrase state without permitting an older response to win. */
import { postJson } from "../../shared/editor-api-client.js";
import { readJsonResponse } from "../../shared/editor-record-utils.js";
import type { WorkspaceRequestGuard } from "../../shared/editor-workspace-request-guard.js";
import { beginKeyMutation, isCurrentKeyMutation } from "../../shared/editor-workspace-request-orthogonal.js";
import { keyResponseState, keyStatusMessage, type KeyUpdateResponse } from "../../shared/key-validation.js";
import type { EditorControllerWorkspaceSetters } from "../../shared/editor-controller-action-contracts.js";

interface KeyRequesterInput {
  readonly guard: WorkspaceRequestGuard;
  readonly setState: EditorControllerWorkspaceSetters["setState"];
  readonly setHasFreshBuild: EditorControllerWorkspaceSetters["setHasFreshBuild"];
  readonly onSuccess: (message: string) => void;
  readonly onError: (message: string) => void;
}

export function createKeyRequester(input: KeyRequesterInput) {
  return async (key: string): Promise<void> => {
    const request = beginKeyMutation(input.guard);
    try {
      const response = await postJson("/api/key", { key });
      const result = await readJsonResponse<KeyUpdateResponse>(response);
      if (!isCurrentKeyMutation(input.guard, request)) return;
      if (!response.ok) { input.onError(`Passphrase update blocked: ${JSON.stringify(result)}`); return; }
      const next = keyResponseState(result);
      input.setState((current) => current === undefined ? current : { ...current, ...next });
      input.setHasFreshBuild(false);
      input.onSuccess(keyStatusMessage(next));
    } catch (error) {
      if (isCurrentKeyMutation(input.guard, request)) input.onError(`Passphrase update failed: ${actionErrorMessage(error)}`);
    }
  };
}

function actionErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
