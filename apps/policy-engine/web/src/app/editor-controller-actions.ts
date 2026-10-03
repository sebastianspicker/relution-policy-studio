/** Composes editor actions while keeping state wiring separate from action domains. */
import type { PolicyWorkspace } from "../../../src/browser/workspace.js";
import { pushUndoState } from "../shared/workspace-history.js";
import { workspaceRequestGuardFor } from "../shared/editor-workspace-request-orthogonal.js";
import { createKeyRequester } from "../features/policy-workspace/editor-workspace-request-key.js";
import { createWorkspacePersistence } from "../shared/editor-workspace-request-persistence.js";
import { createSidecarRequester } from "../shared/editor-workspace-request-sidecar.js";
import { createComplianceActions } from "../features/assurance/editor-compliance-actions.js";
import { createAssuranceSelectionAction } from "../features/assurance/editor-assurance-selection-action.js";
import { createPolicyEditingActions } from "../features/policy-workspace/editor-policy-actions.js";
import { createWorkspaceHistoryActions } from "../features/artifacts/editor-workspace-history-actions.js";
import { createWorkspaceMutationActions } from "../features/policy-workspace/editor-workspace-mutation-actions.js";
import { createImportBuildActions } from "./editor-import-build-actions.js";
import { createRecommendationSelectionActions } from "../features/assurance/editor-recommendation-selection-actions.js";
import type { EditorControllerActions, UseEditorControllerActionsInput } from "../shared/editor-controller-action-contracts.js";
import type { Selection } from "../shared/editor-contracts.js";

export function createEditorControllerActions(input: UseEditorControllerActionsInput): EditorControllerActions {
  const {
    currentState, isDirty, selection, policy, configuration, details, canonicalRawJson, rawJson,
    selectedType, newPolicyPlatform, newPolicyName, keyValue, importFile, jsonTemplateFile, rulesetFile, ddmSchemaId, mdmCommandSchemaId,
  } = input.workspace;
  const {
    setState, setSelection, setRawJsonState, setRawJsonDirty, setSelectedType, setNewPolicyName, setStatus, setLastActionResult,
    setIsDirty, setHasFreshBuild, setRulesetReport, setInspectorTab, setIsBuildLoading,
  } = input.workspaceSetters;
  const requestGuard = workspaceRequestGuardFor(setState);
  requestGuard.synchronizeSelection(selection === undefined ? "none" : `${String(selection.policyIndex)}:${String(selection.versionIndex)}:${String(selection.configurationIndex ?? "policy")}`);
  const { undoStack, redoStack, setUndoStack, setRedoStack } = input.history;
  const { recommendationCatalog, recommendationSummary, recommendationIndex, recommendationSource, recommendationPlatform } = input.recommendations;
  const { setSelectedRecommendationId, setRecommendationSourceState, setRecommendationPlatform, setRecommendationQuery } = input.recommendationSetters;
  const { complianceSources, complianceReport } = input.compliance;
  const { setComplianceSources, setComplianceReportForWorkspace, setComplianceLoading, setComplianceError } = input.complianceSetters;
  const historyInput = { currentState, isDirty, selection, undoStack, redoStack, setState, setSelection, setIsDirty, setHasFreshBuild, setStatus, setLastActionResult, setUndoStack, setRedoStack };

  function setActionSuccessStatus(message: string): void { setLastActionResult({ ok: true }); setStatus(message); }
  function setActionErrorStatus(message: string): void { setLastActionResult({ ok: false, error: message }); setStatus(message); }
  function markWorkspaceDirty(nextWorkspace: PolicyWorkspace, nextSelection: Selection | undefined, message: string): boolean {
    if (!requestGuard.recordEdit()) { setActionErrorStatus("A server workspace mutation is in progress"); return false; }
    pushUndoState(historyInput); setState((current) => current === undefined ? current : { ...current, workspace: nextWorkspace }); setSelection(nextSelection);
    setIsDirty(true); setHasFreshBuild(false); setLastActionResult({ ok: true }); setStatus(message);
    return true;
  }

  const { persistWorkspace, ensureSavedWorkspace } = createWorkspacePersistence({
    currentState, isDirty, guard: requestGuard, historyInput, setState, setIsDirty,
    onSavedBeforeAction: () => setActionSuccessStatus("Saved workspace before server action"),
  });
  const { postSidecarAction, postArtifactUpdate } = createSidecarRequester({ guard: requestGuard, expectedRevision: currentState.revision, setState, onSuccess: setActionSuccessStatus, onError: setActionErrorStatus });
  const updateKey = createKeyRequester({ guard: requestGuard, setState, setHasFreshBuild, onSuccess: setActionSuccessStatus, onError: setActionErrorStatus });
  const policyActions = createPolicyEditingActions({ currentState, selection, policy, configuration, rawJson, canonicalRawJson, markWorkspaceDirty, setRawJsonState, setRawJsonDirty, setActionErrorStatus, setActionSuccessStatus });
  const complianceActions = createComplianceActions({
    currentState, selection, complianceSources, complianceReport, requestGuard, historyInput,
    setState, setIsDirty, setHasFreshBuild, setComplianceLoading, setComplianceError,
    setComplianceReportForWorkspace, setActionSuccessStatus, setActionErrorStatus, setLastActionResult, setStatus,
  });
  const historyActions = createWorkspaceHistoryActions({
    currentWorkspace: currentState.workspace, isDirty, selection, undoStack, redoStack, requestGuard,
    pushUndoState: () => pushUndoState(historyInput), setState, setSelection, setIsDirty, setHasFreshBuild,
    setUndoStack, setRedoStack, setActionSuccessStatus, setActionErrorStatus,
  });
  const mutationActions = createWorkspaceMutationActions({
    currentState, selection, selectedType, newPolicyPlatform, newPolicyName, requestGuard, ensureSavedWorkspace,
    historyInput, markWorkspaceDirty, setState, setSelection, setSelectedType, setNewPolicyName,
    setIsDirty, setHasFreshBuild, setActionSuccessStatus, setActionErrorStatus, setLastActionResult, setStatus,
  });
  const importBuildActions = createImportBuildActions({
    currentState, isDirty, selection, configuration, details, keyValue, importFile, jsonTemplateFile, rulesetFile,
    recommendationCatalog, recommendationSummary, recommendationSource, recommendationPlatform, requestGuard, historyInput,
    persistWorkspace, updateSelectedConfiguration: policyActions.updateSelectedConfiguration, setState, setSelection, setIsDirty,
    setHasFreshBuild, setIsBuildLoading, setSelectedType, setInspectorTab, setRulesetReport, setSelectedRecommendationId,
    setActionSuccessStatus, setActionErrorStatus, setLastActionResult, setStatus,
  });
  const recommendationSelectionActions = createRecommendationSelectionActions({
    policy,
    recommendationIndex,
    setRecommendationSourceState,
    setRecommendationPlatform,
    setRecommendationQuery,
    setSelectedRecommendationId,
    setComplianceSources,
  });

  async function setActiveKey(): Promise<void> {
    const key = keyValue.trim();
    if (key.length === 0) { setActionErrorStatus("Archive passphrase is required"); return; }
    await updateKey(key);
  }
  async function addDdmArtifact(): Promise<void> { await postSidecarAction("/api/ddm/artifact", { schemaId: ddmSchemaId }, "Added offline DDM artifact"); }
  async function addMdmCommandArtifact(): Promise<void> { await postSidecarAction("/api/mdm-command/artifact", { schemaId: mdmCommandSchemaId }, "Added offline MDM command draft"); }
  async function removeDdmArtifact(uuid: string): Promise<void> { await postSidecarAction("/api/ddm/artifact/remove", { uuid }, "Removed DDM artifact"); }
  async function removeMdmCommandArtifact(uuid: string): Promise<void> { await postSidecarAction("/api/mdm-command/artifact/remove", { uuid }, "Removed MDM command draft"); }
  async function updateDdmArtifact(uuid: string, valuesJson: string): Promise<void> { await postArtifactUpdate("/api/ddm/artifact/update", uuid, valuesJson, "Updated DDM artifact"); }
  async function updateMdmCommandArtifact(uuid: string, valuesJson: string): Promise<void> { await postArtifactUpdate("/api/mdm-command/artifact/update", uuid, valuesJson, "Updated MDM command draft"); }
  async function saveWorkspace(nextWorkspace = currentState.workspace): Promise<void> {
    if (!requestGuard.canEditWorkspace()) { setActionErrorStatus("A server workspace mutation is in progress"); return; }
    const request = requestGuard.begin();
    try { if (await persistWorkspace(nextWorkspace, request) !== undefined) setActionSuccessStatus("Saved workspace"); }
    catch (error) { if (requestGuard.isCurrent(request)) { const message = error instanceof Error ? error.message : String(error); setLastActionResult({ ok: false, error: message }); setStatus(`Save failed: ${message}`); } }
  }

  return {
    applyAssuranceSelection: createAssuranceSelectionAction({ requestGuard, workspace: currentState.workspace, revision: currentState.revision,
      adopt: (workspace) => markWorkspaceDirty(workspace, selection, "Applied assurance selection to draft"),
    }),
    setRawJson: policyActions.setRawJson, resetRawJson: policyActions.resetRawJson,
    setRecommendationSource: recommendationSelectionActions.setRecommendationSource,
    toggleComplianceSource: recommendationSelectionActions.toggleComplianceSource,
    saveWorkspace, addConfiguration: mutationActions.addConfiguration, addPolicy: mutationActions.addPolicy,
    removeConfiguration: mutationActions.removeConfiguration, moveConfiguration: mutationActions.moveConfiguration,
    buildArchive: importBuildActions.buildArchive, setActiveKey, importArchive: importBuildActions.importArchive,
    importJsonTemplates: importBuildActions.importJsonTemplates, importRuleset: importBuildActions.importRuleset,
    importRecommendationRuleset: importBuildActions.importRecommendationRuleset,
    refreshCompliance: complianceActions.refreshCompliance, applyComplianceRemediation: complianceActions.applyComplianceRemediation,
    addDdmArtifact, addMdmCommandArtifact, reconcileSidecar: mutationActions.reconcileSidecar, removeDdmArtifact,
    removeMdmCommandArtifact, updateDdmArtifact, updateMdmCommandArtifact,
    renameSelectedPolicy: policyActions.renameSelectedPolicy, updateSelectedPolicyDescription: policyActions.updateSelectedPolicyDescription,
    duplicateSelectedPolicy: policyActions.duplicateSelectedPolicy, deleteSelectedPolicy: policyActions.deleteSelectedPolicy,
    clearWorkspace: historyActions.clearWorkspace, undoWorkspace: historyActions.undoWorkspace, redoWorkspace: historyActions.redoWorkspace,
    applyBaselineTemplate: importBuildActions.applyBaselineTemplate, applyExpertBaselineSelection: importBuildActions.applyExpertBaselineSelection,
    updateSelectedConfiguration: policyActions.updateSelectedConfiguration, applyRawJson: policyActions.applyRawJson,
  };
}
