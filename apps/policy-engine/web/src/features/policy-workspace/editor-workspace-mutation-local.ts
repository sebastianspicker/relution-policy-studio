/** Applies local configuration removal and ordering changes to cloned workspaces. */
import type { PolicyWorkspace } from "../../../../src/browser/workspace.js";
import { cloneWorkspace, versionRecord } from "../../shared/editor-workspace-utils.js";
import type { WorkspaceMutationInput } from "../../shared/editor-workspace-mutation-context.js";
import type { JsonRecord, Selection } from "../../shared/editor-contracts.js";

export function createLocalConfigurationActions(input: WorkspaceMutationInput) {
  async function removeConfiguration(selection: Selection): Promise<void> {
    if (selection.configurationIndex === undefined || !window.confirm("Remove this configuration?")) return;
    const workspace = cloneWorkspace(input.currentState.workspace);
    const configurations = configurationRecords(workspace, selection);
    if (selection.configurationIndex < 0 || selection.configurationIndex >= configurations.length) return;
    configurations.splice(selection.configurationIndex, 1);
    const nextSelection = configurations.length === 0
      ? { policyIndex: selection.policyIndex, versionIndex: selection.versionIndex }
      : { policyIndex: selection.policyIndex, versionIndex: selection.versionIndex, configurationIndex: Math.min(selection.configurationIndex, configurations.length - 1) };
    input.markWorkspaceDirty(workspace, nextSelection, "Removed configuration");
  }

  async function moveConfiguration(selection: Selection, direction: "up" | "down"): Promise<void> {
    if (selection.configurationIndex === undefined) return;
    const workspace = cloneWorkspace(input.currentState.workspace);
    const configurations = configurationRecords(workspace, selection);
    const nextIndex = direction === "up" ? selection.configurationIndex - 1 : selection.configurationIndex + 1;
    if (nextIndex < 0 || nextIndex >= configurations.length) return;
    const [configuration] = configurations.splice(selection.configurationIndex, 1);
    if (configuration === undefined) return;
    configurations.splice(nextIndex, 0, configuration);
    input.markWorkspaceDirty(workspace, { ...selection, configurationIndex: nextIndex }, `Moved configuration ${direction}`);
  }

  return { removeConfiguration, moveConfiguration };
}

function configurationRecords(workspace: PolicyWorkspace, selection: Selection): JsonRecord[] {
  const configurations = versionRecord(workspace, selection.policyIndex, selection.versionIndex)?.configurations;
  return Array.isArray(configurations) ? configurations : [];
}
