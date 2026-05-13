import type { Dispatch, SetStateAction } from "react";
import type { ComplianceReport } from "../../../src/compliance.js";
import type {
  RecommendationCatalogResponse,
  RecommendationIndexResponse,
  RecommendationSource,
  RecommendationSourceSummary,
} from "../../../src/recommendation-types.js";
import type { PolicyWorkspace, WorkspacePolicy } from "../../../src/workspace.js";
import type { AppState, EditorController, InspectorTab, JsonRecord, RulesetImportReport, Selection } from "./types.js";

export type WorkspaceHistoryEntry = {
  readonly workspace: PolicyWorkspace;
  readonly selection: Selection | undefined;
  readonly isDirty: boolean;
};

export type EditorControllerActions = Pick<
  EditorController,
  | "setRawJson"
  | "resetRawJson"
  | "setRecommendationSource"
  | "toggleComplianceSource"
  | "saveWorkspace"
  | "addConfiguration"
  | "addPolicy"
  | "removeConfiguration"
  | "moveConfiguration"
  | "buildArchive"
  | "setActiveKey"
  | "importArchive"
  | "importJsonTemplates"
  | "importRuleset"
  | "importRecommendationRuleset"
  | "refreshCompliance"
  | "applyComplianceRemediation"
  | "addDdmArtifact"
  | "addMdmCommandArtifact"
  | "reconcileSidecar"
  | "removeDdmArtifact"
  | "removeMdmCommandArtifact"
  | "updateDdmArtifact"
  | "updateMdmCommandArtifact"
  | "renameSelectedPolicy"
  | "updateSelectedPolicyDescription"
  | "duplicateSelectedPolicy"
  | "deleteSelectedPolicy"
  | "clearWorkspace"
  | "undoWorkspace"
  | "redoWorkspace"
  | "applyBaselineTemplate"
  | "applyExpertBaselineSelection"
  | "updateSelectedConfiguration"
  | "applyRawJson"
>;

export interface UseEditorControllerActionsInput {
  readonly currentState: AppState;
  readonly isDirty: boolean;
  readonly selection: Selection | undefined;
  readonly policy: WorkspacePolicy | undefined;
  readonly configuration: JsonRecord | undefined;
  readonly details: JsonRecord | undefined;
  readonly canonicalRawJson: string;
  readonly rawJson: string;
  readonly selectedType: string;
  readonly newPolicyPlatform: string;
  readonly newPolicyName: string;
  readonly keyValue: string;
  readonly importFile: File | undefined;
  readonly jsonTemplateFile: File | undefined;
  readonly rulesetFile: File | undefined;
  readonly recommendationCatalog: RecommendationCatalogResponse | undefined;
  readonly recommendationSummary: RecommendationSourceSummary | undefined;
  readonly recommendationIndex: RecommendationIndexResponse | undefined;
  readonly recommendationSource: RecommendationSource;
  readonly recommendationPlatform: string;
  readonly complianceSources: RecommendationSource[];
  readonly complianceReport: ComplianceReport | undefined;
  readonly ddmSchemaId: string;
  readonly mdmCommandSchemaId: string;
  readonly undoStack: readonly WorkspaceHistoryEntry[];
  readonly redoStack: readonly WorkspaceHistoryEntry[];
  readonly setState: Dispatch<SetStateAction<AppState | undefined>>;
  readonly setSelection: Dispatch<SetStateAction<Selection | undefined>>;
  readonly setRawJsonState: Dispatch<SetStateAction<string>>;
  readonly setRawJsonDirty: Dispatch<SetStateAction<boolean>>;
  readonly setSelectedType: Dispatch<SetStateAction<string>>;
  readonly setNewPolicyName: Dispatch<SetStateAction<string>>;
  readonly setStatus: Dispatch<SetStateAction<string>>;
  readonly setIsDirty: Dispatch<SetStateAction<boolean>>;
  readonly setHasFreshBuild: Dispatch<SetStateAction<boolean>>;
  readonly setUndoStack: Dispatch<SetStateAction<readonly WorkspaceHistoryEntry[]>>;
  readonly setRedoStack: Dispatch<SetStateAction<readonly WorkspaceHistoryEntry[]>>;
  readonly setRulesetReport: Dispatch<SetStateAction<RulesetImportReport | undefined>>;
  readonly setInspectorTab: Dispatch<SetStateAction<InspectorTab>>;
  readonly setSelectedRecommendationId: Dispatch<SetStateAction<string | undefined>>;
  readonly setRecommendationSourceState: Dispatch<SetStateAction<RecommendationSource>>;
  readonly setRecommendationPlatform: Dispatch<SetStateAction<string>>;
  readonly setRecommendationQuery: Dispatch<SetStateAction<string>>;
  readonly setComplianceSources: Dispatch<SetStateAction<RecommendationSource[]>>;
  readonly setComplianceReport: Dispatch<SetStateAction<ComplianceReport | undefined>>;
  readonly setComplianceLoading: Dispatch<SetStateAction<boolean>>;
  readonly setComplianceError: Dispatch<SetStateAction<string | undefined>>;
  readonly setIsBuildLoading: Dispatch<SetStateAction<boolean>>;
}
