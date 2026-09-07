/** Composes editor workspace state from mutable, lifecycle, selection, and catalog concerns. */
import type { Dispatch, SetStateAction } from "react";
import { appleCompatSettingsForPlatform, findAppleCompatSettingForDetails } from "../../../../src/browser/apple.js";
import { findAppleSchemaProfileForDetails, type AppleSchemaEntry } from "../../../../src/browser/apple.js";
import type { ConfigurationTemplate } from "../../../../src/browser/workspace.js";
import type { WorkspacePolicy } from "../../../../src/browser/workspace.js";
import type {
  AddGroup,
  AppState,
  EditorActionResult,
  InspectorTab,
  JsonRecord,
  RulesetImportReport,
  Selection,
} from "../../shared/editor-contracts.js";
import type {
  EditorControllerWorkspaceSetters,
  WorkspaceHistoryEntry,
} from "../../shared/editor-controller-action-contracts.js";
import { useEditorWorkspaceAppleCatalog } from "./useEditorWorkspaceAppleCatalog.js";
import { useEditorWorkspaceDefaults, useEditorWorkspaceRawJsonSync } from "./useEditorWorkspaceDefaults.js";
import {
  useDirtyBeforeUnloadWarning,
  useInitialEditorWorkspaceState,
} from "./useEditorWorkspaceLifecycle.js";
import { useEditorWorkspaceLiveValidation } from "./useEditorWorkspaceLiveValidation.js";
import { createEditorWorkspaceSelection, useEditorWorkspaceMutableState } from "./useEditorWorkspaceMutableState.js";
import { useEditorWorkspaceTemplateCatalog } from "./useEditorWorkspaceTemplateCatalog.js";

export interface EditorWorkspaceState extends EditorControllerWorkspaceSetters {
  readonly state: AppState | undefined;
  readonly loadError: string | undefined;
  readonly selection: Selection | undefined;
  readonly rawJson: string;
  readonly rawJsonDirty: boolean;
  readonly canonicalRawJson: string;
  readonly selectedType: string;
  readonly addQuery: string;
  readonly addGroup: AddGroup;
  readonly inspectorTab: InspectorTab;
  readonly newPolicyPlatform: string;
  readonly newPolicyName: string;
  readonly keyValue: string;
  readonly importFile: File | undefined;
  readonly jsonTemplateFile: File | undefined;
  readonly rulesetFile: File | undefined;
  readonly rulesetReport: RulesetImportReport | undefined;
  readonly status: string;
  readonly lastActionResult: EditorActionResult | undefined;
  readonly isDirty: boolean;
  readonly isBuildLoading: boolean;
  readonly hasFreshBuild: boolean;
  readonly undoStack: readonly WorkspaceHistoryEntry[];
  readonly redoStack: readonly WorkspaceHistoryEntry[];
  readonly ddmSchemaId: string;
  readonly mdmCommandSchemaId: string;
  readonly policy: WorkspacePolicy | undefined;
  readonly configuration: JsonRecord | undefined;
  readonly details: JsonRecord | undefined;
  readonly templatesByType: ReadonlyMap<string, ConfigurationTemplate>;
  readonly template: ConfigurationTemplate | undefined;
  readonly appleCompatSetting: ReturnType<typeof findAppleCompatSettingForDetails>;
  readonly appleSchemaProfile: ReturnType<typeof findAppleSchemaProfileForDetails>;
  readonly creatablePlatforms: string[];
  readonly availableTemplates: ConfigurationTemplate[];
  readonly presentNativeTypes: string[];
  readonly availableAppleCompatSettings: ReturnType<typeof appleCompatSettingsForPlatform>;
  readonly availableAppleSchemaProfiles: AppleSchemaEntry[];
  readonly availableDdmEntries: AppleSchemaEntry[];
  readonly availableMdmCommands: AppleSchemaEntry[];
  readonly setAddQuery: Dispatch<SetStateAction<string>>;
  readonly setAddGroup: Dispatch<SetStateAction<AddGroup>>;
  readonly setNewPolicyPlatform: Dispatch<SetStateAction<string>>;
  readonly setKeyValue: Dispatch<SetStateAction<string>>;
  readonly setImportFile: Dispatch<SetStateAction<File | undefined>>;
  readonly setJsonTemplateFile: Dispatch<SetStateAction<File | undefined>>;
  readonly setRulesetFile: Dispatch<SetStateAction<File | undefined>>;
  readonly setUndoStack: Dispatch<SetStateAction<readonly WorkspaceHistoryEntry[]>>;
  readonly setRedoStack: Dispatch<SetStateAction<readonly WorkspaceHistoryEntry[]>>;
  readonly setDdmSchemaId: Dispatch<SetStateAction<string>>;
  readonly setMdmCommandSchemaId: Dispatch<SetStateAction<string>>;
}

/** Owns the mutable workspace boundary so dependent panels cannot diverge in selection state. */
export function useWorkspaceState(): EditorWorkspaceState {
  const mutable = useEditorWorkspaceMutableState();
  useInitialEditorWorkspaceState(mutable);
  useEditorWorkspaceLiveValidation(mutable.isDirty, mutable.state, mutable.setState, mutable.setStatus);
  useDirtyBeforeUnloadWarning(mutable.isDirty);

  const selection = createEditorWorkspaceSelection(mutable.state, mutable.selection);
  const templateCatalog = useEditorWorkspaceTemplateCatalog({
    state: mutable.state,
    selection: mutable.selection,
    policy: selection.policy,
    selectedPolicyPlatform: selection.selectedPolicyPlatform,
    details: selection.details,
  });
  const appleCatalog = useEditorWorkspaceAppleCatalog({
    state: mutable.state,
    policy: selection.policy,
    selectedPolicyPlatform: selection.selectedPolicyPlatform,
    details: selection.details,
  });
  useEditorWorkspaceRawJsonSync(
    selection.canonicalRawJson,
    selection.selectedConfigurationKey,
    mutable.rawJsonDirty,
    mutable.setRawJsonState,
    mutable.setRawJsonDirty,
  );
  useEditorWorkspaceDefaults({
    availableDdmEntries: appleCatalog.availableDdmEntries,
    availableMdmCommands: appleCatalog.availableMdmCommands,
    creatablePlatforms: templateCatalog.creatablePlatforms,
    ddmSchemaId: mutable.ddmSchemaId,
    mdmCommandSchemaId: mutable.mdmCommandSchemaId,
    newPolicyPlatform: mutable.newPolicyPlatform,
    policyPath: selection.policy?.path,
    setDdmSchemaId: mutable.setDdmSchemaId,
    setMdmCommandSchemaId: mutable.setMdmCommandSchemaId,
    setNewPolicyPlatform: mutable.setNewPolicyPlatform,
    setSelectedType: mutable.setSelectedType,
  });

  const { setLoadError: _setLoadError, ...state } = mutable;
  const {
    selectedConfigurationKey: _selectedConfigurationKey,
    selectedPolicyPlatform: _selectedPolicyPlatform,
    ...selectionState
  } = selection;
  return { ...state, ...selectionState, ...templateCatalog, ...appleCatalog };
}
