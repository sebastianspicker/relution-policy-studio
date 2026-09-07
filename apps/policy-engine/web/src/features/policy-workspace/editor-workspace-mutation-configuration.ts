/** Adds configurations through the authoritative server mutation endpoint. */
import type { PolicyWorkspace } from "../../../../src/browser/workspace.js";
import { addConfigurationLabel, parseAddSelection } from "../../shared/editor-configuration-utils.js";
import { readJsonResponse } from "../../shared/editor-record-utils.js";
import { postAddConfiguration } from "../../shared/editor-action-requests.js";
import { versionRecord } from "../../shared/editor-workspace-utils.js";
import { runExclusiveWorkspaceMutation, type WorkspaceMutationInput } from "../../shared/editor-workspace-mutation-context.js";
import { mergeWorkspaceServerUpdate, type WorkspaceServerUpdate } from "../../shared/editor-workspace-response.js";
import { clearWorkspaceHistory } from "../../shared/workspace-history.js";

export function createAddConfigurationAction(input: WorkspaceMutationInput): () => Promise<void> {
  return async (): Promise<void> => {
    const selection = input.selection;
    if (selection === undefined || input.selectedType.length === 0) return;
    await runExclusiveWorkspaceMutation(input, async (request) => {
      const saved = await input.ensureSavedWorkspace(request);
      if (saved === undefined) return;
      const policyPath = saved.workspace.policies[selection.policyIndex]?.path;
      if (policyPath === undefined) return;
      const addSelection = parseAddSelection(input.selectedType);
      const response = await postAddConfiguration(addSelection, policyPath, selection.versionIndex, saved.revision);
      const updated = await readJsonResponse<WorkspaceServerUpdate>(response);
      if (!response.ok) {
        if (input.requestGuard.isExclusiveCurrent(request)) input.setActionErrorStatus(`Configuration creation blocked: ${JSON.stringify(updated)}`);
        return;
      }
      if (!input.requestGuard.isExclusiveCurrent(request)) return;
      input.setState((current) => mergeWorkspaceServerUpdate(current, updated));
      input.setIsDirty(false);
      clearWorkspaceHistory(input.historyInput);
      input.setHasFreshBuild(false);
      const count = configurationCount(updated.workspace, selection.policyIndex, selection.versionIndex);
      input.setSelection({ policyIndex: selection.policyIndex, versionIndex: selection.versionIndex, configurationIndex: count - 1 });
      input.setSelectedType("");
      input.setActionSuccessStatus(`Added ${addConfigurationLabel(addSelection)}`);
    }, "Configuration creation failed");
  };
}

function configurationCount(workspace: PolicyWorkspace, policyIndex: number, versionIndex: number): number {
  const configurations = versionRecord(workspace, policyIndex, versionIndex)?.configurations;
  return Array.isArray(configurations) ? configurations.length : 1;
}
