import type { EditorControllerResult } from "./types.js";
import { useComplianceState } from "./useEditorComplianceState.js";
import { useEditorControllerActions } from "./useEditorControllerActions.js";
import { useRecommendationState } from "./useEditorRecommendationState.js";
import { useWorkspaceState } from "./useEditorWorkspaceState.js";

export function useEditorController(): EditorControllerResult {
  const workspace = useWorkspaceState();
  const recommendations = useRecommendationState({ policy: workspace.policy });
  const compliance = useComplianceState({ selection: workspace.selection, state: workspace.state });

  if (workspace.state === undefined) {
    return workspace.loadError === undefined ? { kind: "loading" } : { kind: "error", message: workspace.loadError };
  }

  const currentState = workspace.state;
  const actions = useEditorControllerActions({
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
      setComplianceReport: compliance.setComplianceReport,
      setComplianceLoading: compliance.setComplianceLoading,
      setComplianceError: compliance.setComplianceError,
    },
  });

  return {
    kind: "ready",
    controller: {
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
    },
  };
}
