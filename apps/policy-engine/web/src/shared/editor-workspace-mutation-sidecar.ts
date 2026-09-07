/** Reconciles sidecar snapshots through the authoritative server response. */
import type { PolicyWorkspace, WorkspaceValidationResult } from "../../../src/browser/workspace.js";
import { postJson } from "./editor-api-client.js";
import { isEditorSidecarState, readJsonResponse } from "./editor-record-utils.js";
import { runExclusiveWorkspaceMutation, type WorkspaceMutationInput } from "./editor-workspace-mutation-context.js";
import type { AppState, JsonRecord } from "./editor-contracts.js";
import { clearWorkspaceHistory } from "./workspace-history.js";

export function createReconcileSidecarAction(input: WorkspaceMutationInput): () => Promise<void> {
  return async (): Promise<void> => {
    await runExclusiveWorkspaceMutation(input, async (request) => {
      const saved = await input.ensureSavedWorkspace(request);
      if (saved === undefined) return;
      const response = await postJson("/api/roundtrip/reconcile", { expectedRevision: saved.revision });
      const result = await readJsonResponse<{ workspace?: PolicyWorkspace; validation?: WorkspaceValidationResult; sidecar?: AppState["sidecar"]; revision?: unknown } & JsonRecord>(response);
      if (!response.ok || result.workspace === undefined || result.validation === undefined || !isEditorSidecarState(result.sidecar) || typeof result.revision !== "string") {
        input.setActionErrorStatus(`Sidecar reconcile blocked: ${JSON.stringify(result)}`);
        return;
      }
      if (!input.requestGuard.isExclusiveCurrent(request)) return;
      const { workspace, validation, sidecar, revision } = result;
      input.setState((current) => current === undefined ? current : { ...current, workspace, validation, sidecar, revision });
      input.setIsDirty(false);
      clearWorkspaceHistory(input.historyInput);
      input.setHasFreshBuild(false);
      input.setActionSuccessStatus("Reconciled sidecar restore snapshots");
    }, "Sidecar reconcile failed");
  };
}
