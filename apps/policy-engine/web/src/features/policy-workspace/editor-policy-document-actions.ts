/** Mutates policy metadata and policy collection membership. */
import type { WorkspacePolicy } from "../../../../src/browser/workspace.js";
import { cloneWorkspace } from "../../shared/editor-workspace-utils.js";
import type { PolicyEditingActionsInput } from "./editor-policy-action-contract.js";
import { duplicatePolicy, recordPolicyInReport, removePolicyFromReport, updateReportPolicyName } from "./workspace-mutations.js";

export function createPolicyDocumentActions(input: PolicyEditingActionsInput) {
  function updateSelectedPolicy(change: (policyToUpdate: WorkspacePolicy, workspace: typeof input.currentState.workspace) => void, message: string): void {
    if (input.selection === undefined) return;
    const nextWorkspace = cloneWorkspace(input.currentState.workspace);
    const policyToUpdate = nextWorkspace.policies[input.selection.policyIndex];
    if (policyToUpdate === undefined) return;
    change(policyToUpdate, nextWorkspace);
    input.markWorkspaceDirty(nextWorkspace, input.selection, message);
  }

  function renameSelectedPolicy(name: string): void {
    updateSelectedPolicy((policyToUpdate, nextWorkspace) => {
      policyToUpdate.document.name = name;
      updateReportPolicyName(policyToUpdate.document, nextWorkspace.report, name);
    }, "Updated policy name");
  }

  function updateSelectedPolicyDescription(description: string): void {
    updateSelectedPolicy((policyToUpdate) => { policyToUpdate.document.description = description; }, "Updated policy description");
  }

  function duplicateSelectedPolicy(): void {
    if (input.selection === undefined || input.policy === undefined) return;
    const nextWorkspace = cloneWorkspace(input.currentState.workspace);
    const source = nextWorkspace.policies[input.selection.policyIndex];
    if (source === undefined) return;
    const duplicate = duplicatePolicy(source);
    nextWorkspace.policies.splice(input.selection.policyIndex + 1, 0, duplicate);
    recordPolicyInReport(nextWorkspace.report, duplicate.document);
    input.markWorkspaceDirty(nextWorkspace, { policyIndex: input.selection.policyIndex + 1, versionIndex: 0 }, "Duplicated policy");
  }

  function deleteSelectedPolicy(): void {
    if (input.selection === undefined || input.policy === undefined || !window.confirm("Delete the selected policy from this workspace?")) return;
    const nextWorkspace = cloneWorkspace(input.currentState.workspace);
    const [removed] = nextWorkspace.policies.splice(input.selection.policyIndex, 1);
    if (removed !== undefined) removePolicyFromReport(nextWorkspace.report, removed.document);
    const nextSelection = nextWorkspace.policies.length === 0
      ? undefined
      : { policyIndex: Math.min(input.selection.policyIndex, nextWorkspace.policies.length - 1), versionIndex: 0 };
    input.markWorkspaceDirty(nextWorkspace, nextSelection, "Deleted policy");
  }

  return { renameSelectedPolicy, updateSelectedPolicyDescription, duplicateSelectedPolicy, deleteSelectedPolicy };
}
