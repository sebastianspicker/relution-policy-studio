import type { AppleCompatReport } from "../../../src/apple-compat.js";
import type { AppleSchemaCatalog, AppleSchemaEntry } from "../../../src/apple-schema.js";
import type { ComplianceReport } from "../../../src/compliance.js";
import type { RecommendationCatalogResponse, RecommendationIndexResponse, RecommendationSource } from "../../../src/recommendation-types.js";
import type { EditorSidecarState } from "../../../src/sidecar.js";
import type { ConfigurationTemplate, RelutionTemplateBundle } from "../../../src/templates.js";
import type { PolicyWorkspace, WorkspaceValidationResult } from "../../../src/workspace.js";
import type { BaselineTemplatePlatform, BaselineTemplateShape, BaselineTemplateTier } from "../../../src/baseline-templates.js";
import type { BaselineExpertApplyRuleset } from "./baseline-template-client.js";
import type { RulesetImportReport } from "./ruleset-import.js";
export type { RulesetImportReport } from "./ruleset-import.js";

export type JsonRecord = Record<string, unknown>;

export interface AppState {
  bundle: RelutionTemplateBundle;
  workspace: PolicyWorkspace;
  validation: WorkspaceValidationResult;
  outputFile: string;
  keySet: boolean;
  appleCompat: AppleCompatReport;
  appleSchema: AppleSchemaCatalog;
  sidecar: EditorSidecarState;
}

export interface Selection {
  policyIndex: number;
  versionIndex: number;
  configurationIndex?: number;
}

export interface AddPolicyResponse {
  workspace: PolicyWorkspace;
  validation: WorkspaceValidationResult;
  policyPath: string;
}

export interface WorkspaceResponse {
  workspace: PolicyWorkspace;
  validation: WorkspaceValidationResult;
  keySet?: boolean;
  sidecar?: EditorSidecarState;
}

export type AddSelection =
  | { kind: "native"; value: string }
  | { kind: "apple-compat"; value: string }
  | { kind: "apple-profile"; value: string }
  | { kind: "custom-settings"; value: string };

export type AddGroup = "all" | AddSelection["kind"];

export type InspectorTab = "validation" | "preview" | "json" | "sidecar";

export interface EditorController {
  state: AppState;
  selection: Selection | undefined;
  rawJson: string;
  rawJsonDirty: boolean;
  selectedType: string;
  addQuery: string;
  addGroup: AddGroup;
  inspectorTab: InspectorTab;
  newPolicyPlatform: string;
  newPolicyName: string;
  keyValue: string;
  status: string;
  isDirty: boolean;
  isBuildLoading: boolean;
  hasFreshBuild: boolean;
  canUndo: boolean;
  canRedo: boolean;
  rulesetReport: RulesetImportReport | undefined;
  recommendationIndex: RecommendationIndexResponse | undefined;
  recommendationCatalog: RecommendationCatalogResponse | undefined;
  recommendationSource: RecommendationSource;
  recommendationQuery: string;
  recommendationPlatform: string;
  selectedRecommendationId: string | undefined;
  recommendationsLoading: boolean;
  recommendationsError: string | undefined;
  complianceSources: RecommendationSource[];
  complianceReport: ComplianceReport | undefined;
  complianceLoading: boolean;
  complianceError: string | undefined;
  ddmSchemaId: string;
  mdmCommandSchemaId: string;
  policy: import("../../../src/workspace.js").WorkspacePolicy | undefined;
  configuration: JsonRecord | undefined;
  details: JsonRecord | undefined;
  templatesByType: ReadonlyMap<string, ConfigurationTemplate>;
  template: ConfigurationTemplate | undefined;
  appleCompatSetting: import("../../../src/apple-compat.js").AppleCompatSetting | undefined;
  appleSchemaProfile: import("../../../src/apple-schema.js").AppleSchemaEntry | undefined;
  creatablePlatforms: string[];
  availableTemplates: ConfigurationTemplate[];
  presentNativeTypes: string[];
  availableAppleCompatSettings: import("../../../src/apple-compat.js").AppleCompatSetting[];
  availableAppleSchemaProfiles: AppleSchemaEntry[];
  availableDdmEntries: AppleSchemaEntry[];
  availableMdmCommands: AppleSchemaEntry[];
  setSelection: (selection: Selection) => void;
  setRawJson: (value: string) => void;
  resetRawJson: () => void;
  setSelectedType: (value: string) => void;
  setAddQuery: (value: string) => void;
  setAddGroup: (value: AddGroup) => void;
  setInspectorTab: (value: InspectorTab) => void;
  setNewPolicyPlatform: (value: string) => void;
  setNewPolicyName: (value: string) => void;
  setKeyValue: (value: string) => void;
  setImportFile: (file: File | undefined) => void;
  setJsonTemplateFile: (file: File | undefined) => void;
  setRulesetFile: (file: File | undefined) => void;
  setStatus: (value: string) => void;
  setRecommendationSource: (value: RecommendationSource) => void;
  setRecommendationQuery: (value: string) => void;
  setRecommendationPlatform: (value: string) => void;
  setSelectedRecommendationId: (value: string | undefined) => void;
  toggleComplianceSource: (value: RecommendationSource) => void;
  setDdmSchemaId: (value: string) => void;
  setMdmCommandSchemaId: (value: string) => void;
  saveWorkspace: () => Promise<void>;
  addConfiguration: () => Promise<void>;
  addPolicy: () => Promise<void>;
  removeConfiguration: (selection: Selection) => Promise<void>;
  moveConfiguration: (selection: Selection, direction: "up" | "down") => Promise<void>;
  buildArchive: () => Promise<void>;
  setActiveKey: () => Promise<void>;
  importArchive: () => Promise<void>;
  importJsonTemplates: () => Promise<void>;
  importRuleset: () => Promise<void>;
  importRecommendationRuleset: () => Promise<void>;
  refreshCompliance: () => Promise<void>;
  applyComplianceRemediation: (remediationId: string) => Promise<void>;
  addDdmArtifact: () => Promise<void>;
  addMdmCommandArtifact: () => Promise<void>;
  reconcileSidecar: () => Promise<void>;
  removeDdmArtifact: (uuid: string) => Promise<void>;
  removeMdmCommandArtifact: (uuid: string) => Promise<void>;
  updateDdmArtifact: (uuid: string, valuesJson: string) => Promise<void>;
  updateMdmCommandArtifact: (uuid: string, valuesJson: string) => Promise<void>;
  renameSelectedPolicy: (name: string) => void;
  updateSelectedPolicyDescription: (description: string) => void;
  duplicateSelectedPolicy: () => void;
  deleteSelectedPolicy: () => void;
  clearWorkspace: () => void;
  undoWorkspace: () => void;
  redoWorkspace: () => void;
  applyBaselineTemplate: (selection: {
    readonly platform: BaselineTemplatePlatform;
    readonly tier: BaselineTemplateTier;
    readonly shape: BaselineTemplateShape;
  }) => Promise<void>;
  applyExpertBaselineSelection: (ruleset: BaselineExpertApplyRuleset) => Promise<void>;
  updateSelectedConfiguration: (nextConfiguration: JsonRecord) => void;
  applyRawJson: () => void;
}

export type EditorControllerResult =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "ready"; readonly controller: EditorController };
