/** Creates policies through the server and accepts only its current response. */
import { postJson } from "../../shared/editor-api-client.js";
import { readJsonResponse } from "../../shared/editor-record-utils.js";
import { runExclusiveWorkspaceMutation, type WorkspaceMutationInput } from "../../shared/editor-workspace-mutation-context.js";
import type { AddPolicyResponse, JsonRecord } from "../../shared/editor-contracts.js";
import { clearWorkspaceHistory } from "../../shared/workspace-history.js";

export function createAddPolicyAction(input: WorkspaceMutationInput): () => Promise<void> {
  return async (): Promise<void> => {
    const name = input.newPolicyName.trim();
    if (input.newPolicyPlatform.length === 0 || name.length === 0) {
      input.setActionErrorStatus("Policy name and operating system are required");
      return;
    }
    await runExclusiveWorkspaceMutation(input, async (request) => {
      const saved = await input.ensureSavedWorkspace(request);
      if (saved === undefined) return;
      const response = await postJson("/api/add-policy", { platform: input.newPolicyPlatform, name, expectedRevision: saved.revision });
      const result = await readJsonResponse<AddPolicyResponse | JsonRecord>(response);
      if (!response.ok) {
        if (input.requestGuard.isExclusiveCurrent(request)) input.setActionErrorStatus(`Policy creation blocked: ${JSON.stringify(result)}`);
        return;
      }
      if (!input.requestGuard.isExclusiveCurrent(request)) return;
      const added = result as AddPolicyResponse;
      const policyIndex = added.workspace.policies.findIndex((candidate) => candidate.path === added.policyPath);
      input.setState((current) => current === undefined ? current : { ...current, workspace: added.workspace, validation: added.validation, revision: added.revision });
      input.setIsDirty(false);
      clearWorkspaceHistory(input.historyInput);
      input.setHasFreshBuild(false);
      input.setSelection({ policyIndex: policyIndex >= 0 ? policyIndex : added.workspace.policies.length - 1, versionIndex: 0 });
      input.setSelectedType("");
      input.setNewPolicyName("");
      input.setActionSuccessStatus(`Created ${name}`);
    }, "Policy creation failed");
  };
}
