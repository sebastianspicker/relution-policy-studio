/** Assembles action dependencies and projects ready editor controller state without invoking hooks. */
import type { AppState, EditorController } from "../shared/editor-contracts.js";
import type { EditorComplianceState } from "../features/assurance/useEditorComplianceState.js";
import type { EditorControllerActions, UseEditorControllerActionsInput } from "../shared/editor-controller-action-contracts.js";
import type { EditorRecommendationState } from "../features/assurance/useEditorRecommendationState.js";
import type { EditorWorkspaceState } from "../features/policy-workspace/useEditorWorkspaceState.js";

export interface EditorControllerAssemblyInput {
  readonly currentState: AppState;
  readonly workspace: EditorWorkspaceState;
  readonly recommendations: EditorRecommendationState;
  readonly compliance: EditorComplianceState;
}

/** Builds the action-layer input from the hook-owned state contracts. */
export function createEditorControllerActionInput(
  input: EditorControllerAssemblyInput,
): UseEditorControllerActionsInput {
  const { currentState, workspace, recommendations, compliance } = input;
  return {
    workspace: {
      currentState,
      isDirty: workspace.isDirty,
      selection: workspace.selection,
      policy: workspace.policy,
      configuration: workspace.configuration,
      details: workspace.details,
      canonicalRawJson: workspace.canonicalRawJson,
      rawJson: workspace.rawJson,
      selectedType: workspace.selectedType,
      newPolicyPlatform: workspace.newPolicyPlatform,
      newPolicyName: workspace.newPolicyName,
      keyValue: workspace.keyValue,
      importFile: workspace.importFile,
      jsonTemplateFile: workspace.jsonTemplateFile,
      rulesetFile: workspace.rulesetFile,
      ddmSchemaId: workspace.ddmSchemaId,
      mdmCommandSchemaId: workspace.mdmCommandSchemaId,
    },
    workspaceSetters: {
      setState: workspace.setState,
      setSelection: workspace.setSelection,
      setRawJsonState: workspace.setRawJsonState,
      setRawJsonDirty: workspace.setRawJsonDirty,
      setSelectedType: workspace.setSelectedType,
      setNewPolicyName: workspace.setNewPolicyName,
      setStatus: workspace.setStatus,
      setLastActionResult: workspace.setLastActionResult,
      setIsDirty: workspace.setIsDirty,
      setHasFreshBuild: workspace.setHasFreshBuild,
      setRulesetReport: workspace.setRulesetReport,
      setInspectorTab: workspace.setInspectorTab,
      setIsBuildLoading: workspace.setIsBuildLoading,
    },
    history: {
      undoStack: workspace.undoStack,
      redoStack: workspace.redoStack,
      setUndoStack: workspace.setUndoStack,
      setRedoStack: workspace.setRedoStack,
    },
    recommendations: {
      recommendationCatalog: recommendations.recommendationCatalog,
      recommendationSummary: recommendations.recommendationSummary,
      recommendationIndex: recommendations.recommendationIndex,
      recommendationSource: recommendations.recommendationSource,
      recommendationPlatform: recommendations.recommendationPlatform,
    },
    recommendationSetters: {
      setSelectedRecommendationId: recommendations.setSelectedRecommendationId,
      setRecommendationSourceState: recommendations.setRecommendationSourceState,
      setRecommendationPlatform: recommendations.setRecommendationPlatform,
      setRecommendationQuery: recommendations.setRecommendationQuery,
    },
    compliance: {
      complianceSources: compliance.complianceSources,
      complianceReport: compliance.complianceReport,
    },
    complianceSetters: {
      setComplianceSources: compliance.setComplianceSources,
      setComplianceReportForWorkspace: compliance.setComplianceReportForWorkspace,
      setComplianceLoading: compliance.setComplianceLoading,
      setComplianceError: compliance.setComplianceError,
    },
  };
}

/** Projects hook state and stable actions into the public ready-controller contract. */
export function projectReadyEditorController(
  input: EditorControllerAssemblyInput & { readonly actions: EditorControllerActions },
): EditorController {
  const { actions, compliance, currentState, recommendations, workspace } = input;
  return {
    state: currentState,
    selection: workspace.selection,
    rawJson: workspace.rawJson,
    rawJsonDirty: workspace.rawJsonDirty,
    selectedType: workspace.selectedType,
    addQuery: workspace.addQuery,
    addGroup: workspace.addGroup,
    inspectorTab: workspace.inspectorTab,
    newPolicyPlatform: workspace.newPolicyPlatform,
    newPolicyName: workspace.newPolicyName,
    keyValue: workspace.keyValue,
    status: workspace.status,
    lastActionResult: workspace.lastActionResult,
    isDirty: workspace.isDirty,
    isBuildLoading: workspace.isBuildLoading,
    hasFreshBuild: workspace.hasFreshBuild,
    canUndo: workspace.undoStack.length > 0,
    canRedo: workspace.redoStack.length > 0,
    rulesetReport: workspace.rulesetReport,
    recommendationIndex: recommendations.recommendationIndex,
    recommendationCatalog: recommendations.recommendationCatalog,
    recommendationSource: recommendations.recommendationSource,
    recommendationQuery: recommendations.recommendationQuery,
    recommendationPlatform: recommendations.recommendationPlatform,
    selectedRecommendationId: recommendations.selectedRecommendationId,
    retryRecommendations: recommendations.retryRecommendations,
    recommendationsLoading: recommendations.recommendationsLoading,
    recommendationsError: recommendations.recommendationsError,
    complianceSources: compliance.complianceSources,
    complianceReport: compliance.complianceReport,
    complianceLoading: compliance.complianceLoading,
    complianceError: compliance.complianceError,
    ddmSchemaId: workspace.ddmSchemaId,
    mdmCommandSchemaId: workspace.mdmCommandSchemaId,
    policy: workspace.policy,
    configuration: workspace.configuration,
    details: workspace.details,
    templatesByType: workspace.templatesByType,
    template: workspace.template,
    appleCompatSetting: workspace.appleCompatSetting,
    appleSchemaProfile: workspace.appleSchemaProfile,
    creatablePlatforms: workspace.creatablePlatforms,
    availableTemplates: workspace.availableTemplates,
    presentNativeTypes: workspace.presentNativeTypes,
    availableAppleCompatSettings: workspace.availableAppleCompatSettings,
    availableAppleSchemaProfiles: workspace.availableAppleSchemaProfiles,
    availableDdmEntries: workspace.availableDdmEntries,
    availableMdmCommands: workspace.availableMdmCommands,
    setSelection: workspace.setSelection,
    setSelectedType: workspace.setSelectedType,
    setAddQuery: workspace.setAddQuery,
    setAddGroup: workspace.setAddGroup,
    setInspectorTab: workspace.setInspectorTab,
    setNewPolicyPlatform: workspace.setNewPolicyPlatform,
    setNewPolicyName: workspace.setNewPolicyName,
    setKeyValue: workspace.setKeyValue,
    setImportFile: workspace.setImportFile,
    setJsonTemplateFile: workspace.setJsonTemplateFile,
    setRulesetFile: workspace.setRulesetFile,
    setStatus: workspace.setStatus,
    setRecommendationQuery: recommendations.setRecommendationQuery,
    setRecommendationPlatform: recommendations.setRecommendationPlatform,
    setSelectedRecommendationId: recommendations.setSelectedRecommendationId,
    setDdmSchemaId: workspace.setDdmSchemaId,
    setMdmCommandSchemaId: workspace.setMdmCommandSchemaId,
    ...actions,
  };
}
