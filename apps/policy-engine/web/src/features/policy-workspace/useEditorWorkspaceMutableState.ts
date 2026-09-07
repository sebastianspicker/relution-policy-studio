/** Owns the editor's mutable workspace and form state. */
import { useState } from "react";
import { asRecord } from "../../shared/editor-record-utils.js";
import { selectedConfiguration } from "../../shared/editor-workspace-utils.js";
import type {
  AddGroup,
  AppState,
  EditorActionResult,
  InspectorTab,
  RulesetImportReport,
  Selection,
} from "../../shared/editor-contracts.js";
import type {
  EditorControllerWorkspaceSetters,
  WorkspaceHistoryEntry,
} from "../../shared/editor-controller-action-contracts.js";

/** Returns the mutable values and setters shared by editor actions and panels. */
export function useEditorWorkspaceMutableState() {
  const [state, setState] = useState<AppState | undefined>();
  const [loadError, setLoadError] = useState<string | undefined>();
  const [selection, setSelection] = useState<Selection | undefined>();
  const [rawJson, setRawJsonState] = useState("");
  const [rawJsonDirty, setRawJsonDirty] = useState(false);
  const [selectedType, setSelectedType] = useState("");
  const [addQuery, setAddQuery] = useState("");
  const [addGroup, setAddGroup] = useState<AddGroup>("all");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("validation");
  const [newPolicyPlatform, setNewPolicyPlatform] = useState("");
  const [newPolicyName, setNewPolicyName] = useState("");
  const [keyValue, setKeyValue] = useState("");
  const [importFile, setImportFile] = useState<File | undefined>();
  const [jsonTemplateFile, setJsonTemplateFile] = useState<File | undefined>();
  const [rulesetFile, setRulesetFile] = useState<File | undefined>();
  const [rulesetReport, setRulesetReport] = useState<RulesetImportReport | undefined>();
  const [status, setStatus] = useState("");
  const [lastActionResult, setLastActionResult] = useState<EditorActionResult | undefined>();
  const [isDirty, setIsDirty] = useState(false);
  const [hasFreshBuild, setHasFreshBuild] = useState(false);
  const [undoStack, setUndoStack] = useState<readonly WorkspaceHistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<readonly WorkspaceHistoryEntry[]>([]);
  const [ddmSchemaId, setDdmSchemaId] = useState("");
  const [mdmCommandSchemaId, setMdmCommandSchemaId] = useState("");
  const [isBuildLoading, setIsBuildLoading] = useState(false);

  const workspaceSetters: EditorControllerWorkspaceSetters = {
    setState,
    setSelection,
    setRawJsonState,
    setRawJsonDirty,
    setSelectedType,
    setNewPolicyName,
    setStatus,
    setLastActionResult,
    setIsDirty,
    setHasFreshBuild,
    setRulesetReport,
    setInspectorTab,
    setIsBuildLoading,
  };

  return {
    state,
    loadError,
    selection,
    rawJson,
    rawJsonDirty,
    selectedType,
    addQuery,
    addGroup,
    inspectorTab,
    newPolicyPlatform,
    newPolicyName,
    keyValue,
    importFile,
    jsonTemplateFile,
    rulesetFile,
    rulesetReport,
    status,
    lastActionResult,
    isDirty,
    isBuildLoading,
    hasFreshBuild,
    undoStack,
    redoStack,
    ddmSchemaId,
    mdmCommandSchemaId,
    ...workspaceSetters,
    setLoadError,
    setAddQuery,
    setAddGroup,
    setNewPolicyPlatform,
    setKeyValue,
    setImportFile,
    setJsonTemplateFile,
    setRulesetFile,
    setUndoStack,
    setRedoStack,
    setDdmSchemaId,
    setMdmCommandSchemaId,
  };
}

/** Returns the policy, configuration, and JSON identity for the current selection. */
export function createEditorWorkspaceSelection(state: AppState | undefined, selection: Selection | undefined) {
  const policy = state !== undefined && selection !== undefined ? state.workspace.policies[selection.policyIndex] : undefined;
  const configuration = state !== undefined && selection !== undefined ? selectedConfiguration(state.workspace, selection) : undefined;
  const selectedPolicyPlatform = typeof policy?.document.platform === "string" ? policy.document.platform : "";
  const selectedConfigurationKey =
    selection === undefined || configuration === undefined
      ? ""
      : `${policy?.path ?? "no-policy"}:${selection.versionIndex}:${selection.configurationIndex ?? -1}:${typeof configuration.uuid === "string" ? configuration.uuid : ""}`;
  const canonicalRawJson = configuration === undefined ? "" : JSON.stringify(configuration, null, 2);

  return {
    policy,
    configuration,
    details: asRecord(configuration?.details),
    canonicalRawJson,
    selectedPolicyPlatform,
    selectedConfigurationKey,
  };
}
