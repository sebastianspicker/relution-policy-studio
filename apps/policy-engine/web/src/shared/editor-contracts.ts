/** Defines the shared state and controller contracts that connect editor modules. */
import type { AppleCompatReport } from "../../../src/browser/apple.js";
import type { AppleSchemaCatalog, AppleSchemaEntry } from "../../../src/browser/apple.js";
import type { ComplianceReport } from "../../../src/browser/assurance.js";
import type { AssuranceSelectionApplyRequest, AssuranceSelectionApplyResponse } from "../../../src/browser/assurance.js";
import type { RecommendationBrowseResponse, RecommendationIndexResponse, RecommendationSource } from "../../../src/browser/assurance.js";
import type { EditorSidecarState } from "../../../src/browser/sidecar.js";
import type { ConfigurationTemplate, RelutionTemplateBundle } from "../../../src/browser/workspace.js";
import type { PolicyWorkspace, WorkspaceValidationResult } from "../../../src/browser/workspace.js";
import type { BaselineTemplatePlatform, BaselineTemplateShape, BaselineTemplateTier } from "../../../src/browser/assurance.js";
import type { JsonRecord } from "../../../src/browser/json.js";
import type { BaselineExpertApplyRuleset } from "./baseline-template-contract.js";
import type { RulesetImportReport } from "./ruleset-import-contracts.js";
export type { RulesetImportReport } from "./ruleset-import-contracts.js";

export type { JsonRecord };

export interface AppState {
  /** Opaque revision of the authoritative workspace-plus-sidecar snapshot. */
  revision: string;
  bundle: RelutionTemplateBundle;
  workspace: PolicyWorkspace;
  validation: WorkspaceValidationResult;
  outputFile: string;
  keySet: boolean;
  keyValidated: boolean;
  keyValidationReason?: string;
  appleCompat: AppleCompatReport;
  appleSchema: AppleSchemaCatalog;
  sidecar: EditorSidecarState;
  /** CampusWeave workspace the host has active; null when CampusWeave is off or none is active. */
  active_workspace_id?: string | null;
  /** Catalog digest of the CampusWeave planner; null when CampusWeave is off. */
  campusweave_catalog_digest?: string | null;
}

export interface Selection {
  policyIndex: number;
  versionIndex: number;
  configurationIndex?: number;
}

export interface AddPolicyResponse {
  revision: string;
  workspace: PolicyWorkspace;
  validation: WorkspaceValidationResult;
  policyPath: string;
}

export interface WorkspaceResponse {
  revision: string;
  workspace: PolicyWorkspace;
  validation: WorkspaceValidationResult;
  keySet?: boolean;
  keyValidated?: boolean;
  keyValidationReason?: string;
  sidecar?: EditorSidecarState;
}

export type AddSelection =
  | { kind: "native"; value: string }
  | { kind: "apple-compat"; value: string }
  | { kind: "apple-profile"; value: string }
  | { kind: "custom-settings"; value: string };

export type AddGroup = "all" | AddSelection["kind"];

export type InspectorTab = "validation" | "preview" | "json" | "sidecar";

export type EditorActionResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: string };

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
  lastActionResult: EditorActionResult | undefined;
  isDirty: boolean;
  isBuildLoading: boolean;
  hasFreshBuild: boolean;
  canUndo: boolean;
  canRedo: boolean;
  rulesetReport: RulesetImportReport | undefined;
  recommendationIndex: RecommendationIndexResponse | undefined;
  recommendationCatalog: RecommendationBrowseResponse | undefined;
  recommendationSource: RecommendationSource;
  recommendationQuery: string;
  recommendationPlatform: string;
  selectedRecommendationId: string | undefined;
  retryRecommendations: () => void;
  recommendationsLoading: boolean;
  recommendationsError: string | undefined;
  complianceSources: RecommendationSource[];
  complianceReport: ComplianceReport | undefined;
  complianceLoading: boolean;
  complianceError: string | undefined;
  ddmSchemaId: string;
  mdmCommandSchemaId: string;
  policy: import("../../../src/browser/workspace.js").WorkspacePolicy | undefined;
  configuration: JsonRecord | undefined;
  details: JsonRecord | undefined;
  templatesByType: ReadonlyMap<string, ConfigurationTemplate>;
  template: ConfigurationTemplate | undefined;
  appleCompatSetting: import("../../../src/browser/apple.js").AppleCompatSetting | undefined;
  appleSchemaProfile: import("../../../src/browser/apple.js").AppleSchemaEntry | undefined;
  creatablePlatforms: string[];
  availableTemplates: ConfigurationTemplate[];
  presentNativeTypes: string[];
  availableAppleCompatSettings: import("../../../src/browser/apple.js").AppleCompatSetting[];
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
  applyAssuranceSelection: (request: AssuranceSelectionApplyRequest) => Promise<AssuranceSelectionApplyResponse | undefined>;
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
  refreshCompliance: (applicability?: import("../../../src/browser/assurance.js").AssuranceApplicabilityContext) => Promise<void>;
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
