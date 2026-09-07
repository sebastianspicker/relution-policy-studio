/** Edits the selected configuration through structured or raw JSON state. */
import { asRecord } from "../../shared/editor-record-utils.js";
import { versionRecord } from "../../shared/editor-workspace-utils.js";
import type { PolicyEditingActionsInput } from "./editor-policy-action-contract.js";
import type { JsonRecord } from "../../shared/editor-contracts.js";

export function createConfigurationEditingActions(input: PolicyEditingActionsInput) {
  function updateSelectedConfiguration(nextConfiguration: JsonRecord): boolean {
    if (input.selection === undefined || input.selection.configurationIndex === undefined) return false;
    const workspace = input.currentState.workspace;
    const { policyIndex, versionIndex, configurationIndex } = input.selection;
    const policy = workspace.policies[policyIndex];
    const version = versionRecord(workspace, policyIndex, versionIndex);
    if (policy === undefined || version === undefined || !Array.isArray(policy.document.versions) || !Array.isArray(version.configurations)) return false;
    const configurations = [...version.configurations];
    configurations[configurationIndex] = nextConfiguration;
    const versions = [...policy.document.versions];
    versions[versionIndex] = { ...version, configurations };
    const policies = [...workspace.policies];
    policies[policyIndex] = { ...policy, document: { ...policy.document, versions } };
    const nextWorkspace = { ...workspace, policies };
    return input.markWorkspaceDirty(nextWorkspace, input.selection, "Updated configuration");
  }

  function applyRawJson(): void {
    if (input.selection === undefined || input.selection.configurationIndex === undefined || input.configuration === undefined) {
      input.setActionErrorStatus("Select a configuration before applying raw JSON");
      return;
    }
    try {
      const nextConfiguration = asRecord(JSON.parse(input.rawJson) as unknown);
      if (nextConfiguration === undefined) {
        input.setActionErrorStatus("Raw JSON must be an object");
        return;
      }
      if (!updateSelectedConfiguration(nextConfiguration)) return;
      input.setRawJsonState(JSON.stringify(nextConfiguration, null, 2));
      input.setRawJsonDirty(false);
      input.setActionSuccessStatus("Applied raw JSON");
    } catch (error) {
      input.setActionErrorStatus(error instanceof Error ? error.message : String(error));
    }
  }

  function setRawJson(value: string): void {
    input.setRawJsonState(value);
    input.setRawJsonDirty(value !== input.canonicalRawJson);
  }

  function resetRawJson(): void {
    input.setRawJsonState(input.canonicalRawJson);
    input.setRawJsonDirty(false);
  }

  return { updateSelectedConfiguration, applyRawJson, setRawJson, resetRawJson };
}
