import type { ComplianceReport } from "../../../src/compliance.js";
import type {
  RecommendationCatalogResponse,
  RecommendationSource,
} from "../../../src/recommendation-types.js";
import type { PolicyWorkspace, WorkspacePolicy, WorkspaceValidationResult } from "../../../src/workspace.js";
import {
  addConfigurationLabel,
  asRecord,
  cloneWorkspace,
  fileToBase64,
  firstConfigurationSelection,
  isEditorSidecarState,
  parseAddSelection,
  postJson,
  readJsonResponse,
  versionRecord,
} from "./editor-utils.js";
import type {
  AddPolicyResponse,
  AppState,
  JsonRecord,
  Selection,
  WorkspaceResponse,
} from "./types.js";
import { mergeSettingDetails, parseSettingDetailsJson } from "./json-template-import.js";
import { importRulesetWorkspace } from "./ruleset-import.js";
import { duplicatePolicy, recordPolicyInReport, removePolicyFromReport, updateReportPolicyName } from "./workspace-mutations.js";
import { ALL_RECOMMENDATION_PLATFORMS, filterActionableRecommendationRuleset, policyPlatform, preferredRecommendationPlatform } from "./recommendation-platform.js";
import { clearWorkspaceHistory, createWorkspaceHistoryActions, pushUndoState } from "./workspace-history.js";
import { createBaselineTemplateApplyActions } from "./baseline-template-client.js";

import type { UseEditorControllerActionsInput, EditorControllerActions } from "./useEditorControllerActionTypes.js";

export function useEditorControllerActions(input: UseEditorControllerActionsInput): EditorControllerActions {
  const {
    currentState, isDirty, selection, policy, configuration, details, canonicalRawJson, rawJson,
    selectedType, newPolicyPlatform, newPolicyName, keyValue, importFile, jsonTemplateFile, rulesetFile,
    recommendationCatalog, recommendationSummary, recommendationIndex, recommendationSource, recommendationPlatform,
    complianceSources, complianceReport, ddmSchemaId, mdmCommandSchemaId, undoStack, redoStack,
    setState, setSelection, setRawJsonState, setRawJsonDirty, setSelectedType, setNewPolicyName, setStatus,
    setIsDirty, setHasFreshBuild, setUndoStack, setRedoStack, setRulesetReport, setInspectorTab, setSelectedRecommendationId,
    setRecommendationSourceState, setRecommendationPlatform, setRecommendationQuery, setComplianceSources,
    setComplianceReport, setComplianceLoading, setComplianceError, setIsBuildLoading,
  } = input;
  const historyInput = { currentState, isDirty, selection, undoStack, redoStack, setState, setSelection, setIsDirty, setHasFreshBuild, setStatus, setUndoStack, setRedoStack };
  const workspaceHistoryActions = createWorkspaceHistoryActions(historyInput);
  const baselineApplyActions = createBaselineTemplateApplyActions({
    currentWorkspaceHasContent: currentState.workspace.policies.length > 0,
    isDirty,
    applyRulesetJson,
    setStatus,
  });

async function persistWorkspace(nextWorkspace: PolicyWorkspace): Promise<{
  workspace: PolicyWorkspace;
  validation: WorkspaceValidationResult;
  sidecar?: AppState["sidecar"];
}> {
  const response = await postJson("/api/workspace", { workspace: nextWorkspace });
  const updated = await readJsonResponse<{ workspace: PolicyWorkspace; validation: WorkspaceValidationResult; sidecar?: AppState["sidecar"] }>(response);
  if (!response.ok) {
    throw new Error(JSON.stringify(updated));
  }
  setState((current) =>
    current === undefined
      ? current
      : {
          ...current,
          workspace: updated.workspace,
          validation: updated.validation,
          sidecar: updated.sidecar ?? current.sidecar,
        },
  );
  setIsDirty(false);
  clearWorkspaceHistory(historyInput);
  return updated;
}

async function ensureSavedWorkspace(): Promise<PolicyWorkspace> {
  if (!isDirty) {
    return currentState.workspace;
  }
  const updated = await persistWorkspace(currentState.workspace);
  setStatus("Saved workspace before server action");
  return updated.workspace;
}

function markWorkspaceDirty(nextWorkspace: PolicyWorkspace, nextSelection: Selection | undefined, message: string): void {
  pushUndoState(historyInput);
  setState({ ...currentState, workspace: nextWorkspace });
  setSelection(nextSelection);
  setIsDirty(true);
  setHasFreshBuild(false);
  setStatus(message);
}

async function saveWorkspace(nextWorkspace = currentState.workspace): Promise<void> {
  try {
    await persistWorkspace(nextWorkspace);
    setStatus("Saved workspace");
  } catch (error) {
    setStatus(`Save failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function addConfiguration(): Promise<void> {
  if (selection === undefined || selectedType.length === 0) {
    return;
  }
  try {
    const workspace = await ensureSavedWorkspace();
    const policyPath = workspace.policies[selection.policyIndex]?.path;
    if (policyPath === undefined) {
      return;
    }
    const addSelection = parseAddSelection(selectedType);
    const response = await postAddConfiguration(addSelection, policyPath, selection.versionIndex);
    const updated = await readJsonResponse<{ workspace: PolicyWorkspace; validation: WorkspaceValidationResult; sidecar?: AppState["sidecar"] }>(response);
    if (!response.ok) {
      setStatus(`Configuration creation blocked: ${JSON.stringify(updated)}`);
      return;
    }
    setState({ ...currentState, workspace: updated.workspace, validation: updated.validation, sidecar: updated.sidecar ?? currentState.sidecar });
    setIsDirty(false);
    setHasFreshBuild(false);
    const version = versionRecord(updated.workspace, selection.policyIndex, selection.versionIndex);
    const nextConfigurationCount = Array.isArray(version?.configurations) ? version.configurations.length : 1;
    setSelection({ policyIndex: selection.policyIndex, versionIndex: selection.versionIndex, configurationIndex: nextConfigurationCount - 1 });
    setSelectedType("");
    setStatus(`Added ${addConfigurationLabel(addSelection)}`);
  } catch (error) {
    setStatus(`Configuration creation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function addPolicy(): Promise<void> {
  const name = newPolicyName.trim();
  if (newPolicyPlatform.length === 0 || name.length === 0) {
    setStatus("Policy name and operating system are required");
    return;
  }
  try {
    await ensureSavedWorkspace();
    const response = await postJson("/api/add-policy", { platform: newPolicyPlatform, name });
    const result = await readJsonResponse<AddPolicyResponse | JsonRecord>(response);
    if (!response.ok) {
      setStatus(`Policy creation blocked: ${JSON.stringify(result)}`);
      return;
    }
    const added = result as AddPolicyResponse;
    const policyIndex = added.workspace.policies.findIndex((candidate) => candidate.path === added.policyPath);
    const nextPolicyIndex = policyIndex >= 0 ? policyIndex : added.workspace.policies.length - 1;
    setState({ ...currentState, workspace: added.workspace, validation: added.validation });
    setIsDirty(false);
    setHasFreshBuild(false);
    setSelection({ policyIndex: nextPolicyIndex, versionIndex: 0 });
    setSelectedType("");
    setNewPolicyName("");
    setStatus(`Created ${name}`);
  } catch (error) {
    setStatus(`Policy creation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function removeConfiguration(targetSelection: Selection): Promise<void> {
  if (targetSelection.configurationIndex === undefined) {
    return;
  }
  if (!window.confirm("Remove this configuration?")) {
    return;
  }
  const nextWorkspace = cloneWorkspace(currentState.workspace);
  const version = versionRecord(nextWorkspace, targetSelection.policyIndex, targetSelection.versionIndex);
  const configurations = Array.isArray(version?.configurations) ? version.configurations : [];
  if (targetSelection.configurationIndex < 0 || targetSelection.configurationIndex >= configurations.length) {
    return;
  }
  configurations.splice(targetSelection.configurationIndex, 1);
  const nextSelection = configurations.length === 0
    ? { policyIndex: targetSelection.policyIndex, versionIndex: targetSelection.versionIndex }
    : {
        policyIndex: targetSelection.policyIndex,
        versionIndex: targetSelection.versionIndex,
        configurationIndex: Math.min(targetSelection.configurationIndex, configurations.length - 1),
      };
  markWorkspaceDirty(nextWorkspace, nextSelection, "Removed configuration");
}

async function moveConfiguration(targetSelection: Selection, direction: "up" | "down"): Promise<void> {
  if (targetSelection.configurationIndex === undefined) {
    return;
  }
  const nextWorkspace = cloneWorkspace(currentState.workspace);
  const version = versionRecord(nextWorkspace, targetSelection.policyIndex, targetSelection.versionIndex);
  const configurations = Array.isArray(version?.configurations) ? version.configurations : [];
  const nextIndex = direction === "up" ? targetSelection.configurationIndex - 1 : targetSelection.configurationIndex + 1;
  if (nextIndex < 0 || nextIndex >= configurations.length) {
    return;
  }
  const [configurationToMove] = configurations.splice(targetSelection.configurationIndex, 1);
  if (configurationToMove === undefined) {
    return;
  }
  configurations.splice(nextIndex, 0, configurationToMove);
  markWorkspaceDirty(nextWorkspace, { ...targetSelection, configurationIndex: nextIndex }, `Moved configuration ${direction}`);
}

async function buildArchive(): Promise<void> {
  setIsBuildLoading(true);
  try {
    if (isDirty) {
      await persistWorkspace(currentState.workspace);
    }
    const response = await postJson("/api/build", {});
    const result = await readJsonResponse<JsonRecord>(response);
    if (!response.ok) {
      setStatus(`Build blocked: ${JSON.stringify(result)}`);
      return;
    }
    setState((current) =>
      current === undefined
        ? current
        : {
            ...current,
            outputFile: typeof result.outputFile === "string" ? result.outputFile : current.outputFile,
            sidecar: isEditorSidecarState(result.sidecar) ? result.sidecar : current.sidecar,
          },
    );
    setHasFreshBuild(true);
    setStatus(`Built ${String(result.outputFile)}`);
  } catch (error) {
    setStatus(`Build failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    setIsBuildLoading(false);
  }
}

async function setActiveKey(): Promise<void> {
  const key = keyValue.trim();
  if (key.length === 0) {
    setStatus("Encryption key is required");
    return;
  }
  const response = await postJson("/api/key", { key });
  const result = await readJsonResponse<JsonRecord>(response);
  if (!response.ok) {
    setStatus(`Key update blocked: ${JSON.stringify(result)}`);
    return;
  }
  setState({ ...currentState, keySet: true });
  setHasFreshBuild(false);
  setStatus("Key set");
}

async function importArchive(): Promise<void> {
  if (importFile === undefined) {
    setStatus("Choose a .rexp file first");
    return;
  }
  if (isDirty && !window.confirm("Importing replaces the current workspace. Continue?")) {
    return;
  }
  const body: JsonRecord = {
    fileName: importFile.name,
    dataBase64: await fileToBase64(importFile),
  };
  const key = keyValue.trim();
  if (key.length > 0) {
    body.key = key;
  }
  const response = await postJson("/api/import", body);
  const result = await readJsonResponse<WorkspaceResponse | JsonRecord>(response);
  if (!response.ok) {
    setStatus(`Import blocked: ${JSON.stringify(result)}`);
    return;
  }
  const imported = result as WorkspaceResponse;
  setState({
    ...currentState,
    workspace: imported.workspace,
    validation: imported.validation,
    keySet: imported.keySet ?? currentState.keySet,
    sidecar: imported.sidecar ?? currentState.sidecar,
  });
  setIsDirty(false);
  setHasFreshBuild(false);
  clearWorkspaceHistory(historyInput);
  setSelection(firstConfigurationSelection(imported.workspace));
  setSelectedType("");
  setStatus(`Imported ${importFile.name}`);
}

async function importJsonTemplates(): Promise<void> {
  if (selection === undefined || configuration === undefined || details === undefined) {
    setStatus("Select a configuration before applying JSON");
    return;
  }
  if (jsonTemplateFile === undefined) {
    setStatus("Choose a setting JSON file first");
    return;
  }
  try {
    const importedDetails = parseSettingDetailsJson(await jsonTemplateFile.text());
    updateSelectedConfiguration({ ...configuration, details: mergeSettingDetails(details, importedDetails) });
    setStatus(`Applied ${jsonTemplateFile.name} to selected setting`);
    setInspectorTab("validation");
  } catch (error) {
    setStatus(`Setting JSON import failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function importRuleset(): Promise<void> {
  if (rulesetFile === undefined) {
    setStatus("Choose a ruleset JSON file first");
    return;
  }
  if (isDirty && !window.confirm("Importing a ruleset replaces the current workspace. Continue?")) {
    return;
  }
  try {
    const parsed = JSON.parse(await rulesetFile.text()) as unknown;
    await applyRulesetJson(rulesetFile.name, parsed);
  } catch (error) {
    setStatus(`Ruleset import failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function importRecommendationRuleset(): Promise<void> {
  if (recommendationCatalog?.ruleset === undefined) {
    setStatus(`No bundled ruleset is available for ${recommendationSummary?.label ?? recommendationSource.toUpperCase()}`);
    return;
  }
  if (isDirty && !window.confirm("Importing a ruleset replaces the current workspace. Continue?")) {
    return;
  }
  const importPlatform = recommendationPlatform === ALL_RECOMMENDATION_PLATFORMS
    ? undefined
    : recommendationCatalog.displayToImportPlatform[recommendationPlatform];
  const ruleset = filterActionableRecommendationRuleset(recommendationCatalog.ruleset, importPlatform);
  if (ruleset.policies.length === 0) {
    setStatus(`No actionable ${recommendationSummary?.label ?? recommendationSource.toUpperCase()} ruleset settings are available for ${recommendationPlatform}`);
    return;
  }
  try {
    await applyRulesetJson(recommendationCatalog.ruleset.name, ruleset);
  } catch (error) {
    setStatus(`Bundled ruleset import failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function refreshCompliance(): Promise<void> {
  if (selection === undefined) {
    setStatus("Select a policy before checking compliance");
    return;
  }
  try {
    setComplianceLoading(true);
    setComplianceError(undefined);
    const response = await postJson("/api/compliance/check", {
      workspace: currentState.workspace,
      selection: {
        policyIndex: selection.policyIndex,
        versionIndex: selection.versionIndex,
      },
      sources: complianceSources,
    });
    const result = await readJsonResponse<{ report?: ComplianceReport } & JsonRecord>(response);
    if (!response.ok || result.report === undefined) {
      setStatus(`Compliance check failed: ${JSON.stringify(result)}`);
      return;
    }
    setComplianceReport(result.report);
    setStatus("Checked compliance");
  } catch (error) {
    setStatus(`Compliance check failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    setComplianceLoading(false);
  }
}

async function applyComplianceRemediation(remediationId: string): Promise<void> {
  if (selection === undefined) {
    setStatus("Select a policy before applying compliance remediation");
    return;
  }
  try {
    setComplianceLoading(true);
    setComplianceError(undefined);
    const resultToApply = complianceReport?.results.find((candidate) =>
      candidate.remediationOptions.some((option) => option.id === remediationId),
    );
    if (resultToApply === undefined) {
      setStatus(`Compliance remediation is not available: ${remediationId}`);
      return;
    }
    const response = await postJson("/api/compliance/apply", {
      workspace: currentState.workspace,
      selection: {
        policyIndex: selection.policyIndex,
        versionIndex: selection.versionIndex,
      },
      sources: complianceSources,
      source: resultToApply.source,
      recommendationId: resultToApply.recommendationId,
      remediationId,
    });
    const result = await readJsonResponse<{
      workspace?: PolicyWorkspace;
      validation?: WorkspaceValidationResult;
      sidecar?: AppState["sidecar"];
      report?: ComplianceReport;
    } & JsonRecord>(response);
    if (!response.ok || result.workspace === undefined || result.validation === undefined || result.report === undefined) {
      setStatus(`Compliance remediation failed: ${JSON.stringify(result)}`);
      return;
    }
    setState({
      ...currentState,
      workspace: result.workspace,
      validation: result.validation,
      sidecar: result.sidecar ?? currentState.sidecar,
    });
    setComplianceReport(result.report);
    setIsDirty(false);
    clearWorkspaceHistory(historyInput);
    setHasFreshBuild(false);
    setStatus(`Applied compliance remediation ${remediationId}`);
  } catch (error) {
    setStatus(`Compliance remediation failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    setComplianceLoading(false);
  }
}

async function addDdmArtifact(): Promise<void> {
  await postSidecarAction("/api/ddm/artifact", { schemaId: ddmSchemaId }, "Added offline DDM artifact");
}

async function addMdmCommandArtifact(): Promise<void> {
  await postSidecarAction("/api/mdm-command/artifact", { schemaId: mdmCommandSchemaId }, "Added offline MDM command draft");
}

async function reconcileSidecar(): Promise<void> {
  try {
    await ensureSavedWorkspace();
    const response = await postJson("/api/roundtrip/reconcile", {});
    const result = await readJsonResponse<{ workspace?: PolicyWorkspace; validation?: WorkspaceValidationResult; sidecar?: unknown } & JsonRecord>(response);
    if (!response.ok || result.workspace === undefined || result.validation === undefined || !isEditorSidecarState(result.sidecar)) {
      setStatus(`Sidecar reconcile blocked: ${JSON.stringify(result)}`);
      return;
    }
    setState({ ...currentState, workspace: result.workspace, validation: result.validation, sidecar: result.sidecar });
    setIsDirty(false);
    setHasFreshBuild(false);
    setStatus("Reconciled sidecar restore snapshots");
  } catch (error) {
    setStatus(`Sidecar reconcile failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function removeDdmArtifact(uuid: string): Promise<void> {
  await postSidecarAction("/api/ddm/artifact/remove", { uuid }, "Removed DDM artifact");
}

async function removeMdmCommandArtifact(uuid: string): Promise<void> {
  await postSidecarAction("/api/mdm-command/artifact/remove", { uuid }, "Removed MDM command draft");
}

async function updateDdmArtifact(uuid: string, valuesJson: string): Promise<void> {
  await postArtifactUpdate("/api/ddm/artifact/update", uuid, valuesJson, "Updated DDM artifact");
}

async function updateMdmCommandArtifact(uuid: string, valuesJson: string): Promise<void> {
  await postArtifactUpdate("/api/mdm-command/artifact/update", uuid, valuesJson, "Updated MDM command draft");
}

function renameSelectedPolicy(name: string): void {
  updateSelectedPolicy((policyToUpdate) => {
    policyToUpdate.document.name = name;
    updateReportPolicyName(policyToUpdate.document, currentState.workspace.report, name);
  }, "Updated policy name");
}

function updateSelectedPolicyDescription(description: string): void {
  updateSelectedPolicy((policyToUpdate) => {
    policyToUpdate.document.description = description;
  }, "Updated policy description");
}

function duplicateSelectedPolicy(): void {
  if (selection === undefined || policy === undefined) {
    return;
  }
  const nextWorkspace = cloneWorkspace(currentState.workspace);
  const source = nextWorkspace.policies[selection.policyIndex];
  if (source === undefined) {
    return;
  }
  const duplicate = duplicatePolicy(source);
  nextWorkspace.policies.splice(selection.policyIndex + 1, 0, duplicate);
  recordPolicyInReport(nextWorkspace.report, duplicate.document);
  markWorkspaceDirty(nextWorkspace, { policyIndex: selection.policyIndex + 1, versionIndex: 0 }, "Duplicated policy");
}

function deleteSelectedPolicy(): void {
  if (selection === undefined || policy === undefined || !window.confirm("Delete the selected policy from this workspace?")) {
    return;
  }
  const nextWorkspace = cloneWorkspace(currentState.workspace);
  const [removed] = nextWorkspace.policies.splice(selection.policyIndex, 1);
  if (removed !== undefined) {
    removePolicyFromReport(nextWorkspace.report, removed.document);
  }
  const nextSelection = nextWorkspace.policies.length === 0
    ? undefined
    : { policyIndex: Math.min(selection.policyIndex, nextWorkspace.policies.length - 1), versionIndex: 0 };
  markWorkspaceDirty(nextWorkspace, nextSelection, "Deleted policy");
}

function updateSelectedConfiguration(nextConfiguration: JsonRecord): void {
  if (selection === undefined || selection.configurationIndex === undefined) {
    return;
  }
  const nextWorkspace = cloneWorkspace(currentState.workspace);
  const version = versionRecord(nextWorkspace, selection.policyIndex, selection.versionIndex);
  const configurations = Array.isArray(version?.configurations) ? version.configurations : [];
  configurations[selection.configurationIndex] = nextConfiguration;
  markWorkspaceDirty(nextWorkspace, selection, "Updated configuration");
}

function applyRawJson(): void {
  if (selection === undefined || selection.configurationIndex === undefined || configuration === undefined) {
    setStatus("Select a configuration before applying raw JSON");
    return;
  }
  try {
    const parsed = JSON.parse(rawJson) as unknown;
    const nextConfiguration = asRecord(parsed);
    if (nextConfiguration === undefined) {
      setStatus("Raw JSON must be an object");
      return;
    }
    updateSelectedConfiguration(nextConfiguration);
    setRawJsonState(JSON.stringify(nextConfiguration, null, 2));
    setRawJsonDirty(false);
    setStatus("Applied raw JSON");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error));
  }
}

function setRawJson(value: string): void {
  setRawJsonState(value);
  setRawJsonDirty(value !== canonicalRawJson);
}

function resetRawJson(): void {
  setRawJsonState(canonicalRawJson);
  setRawJsonDirty(false);
}

async function applyRulesetJson(name: string, parsed: unknown): Promise<void> {
  const result = importRulesetWorkspace(parsed, currentState.bundle, currentState.appleSchema);
  setRulesetReport(result.report);
  setInspectorTab("validation");
  if (result.workspace === undefined) {
    setStatus(`Ruleset import blocked: ${result.report.conflicts.length} conflict(s), ${result.report.unresolved.length} unresolved rule(s)`);
    return;
  }
  const response = await postJson("/api/workspace/validate", { workspace: result.workspace });
  const validated = await readJsonResponse<{ validation: WorkspaceValidationResult }>(response);
  if (!response.ok || !validated.validation.ok) {
    setStatus(`Ruleset validation blocked: ${JSON.stringify(validated)}`);
    return;
  }
  pushUndoState(historyInput);
  setState({
    ...currentState,
    workspace: result.workspace,
    validation: validated.validation,
    sidecar: {
      version: 1,
      appleSchemaRevision: currentState.appleSchema.source.revision,
      mobileConfigRestore: [],
      ddmArtifacts: [],
      mdmCommandArtifacts: [],
      customManifests: [],
    },
  });
  setSelection(firstConfigurationSelection(result.workspace));
  setSelectedType("");
  setSelectedRecommendationId(undefined);
  setIsDirty(true);
  setHasFreshBuild(false);
  setStatus(`Imported ruleset ${name}`);
}

function setRecommendationSource(value: RecommendationSource): void {
  setRecommendationSourceState(value);
  const summary = recommendationIndex?.sources.find((candidate) => candidate.source === value);
  const preferred = summary === undefined ? ALL_RECOMMENDATION_PLATFORMS : preferredRecommendationPlatform(summary, policyPlatform(policy));
  setRecommendationPlatform(preferred ?? ALL_RECOMMENDATION_PLATFORMS);
  setRecommendationQuery("");
  setSelectedRecommendationId(undefined);
}

function toggleComplianceSource(value: RecommendationSource): void {
  setComplianceSources((current) => {
    if (current.includes(value)) {
      return current.length === 1 ? current : current.filter((entry) => entry !== value);
    }
    return [...current, value];
  });
}

async function postAddConfiguration(
  addSelection: ReturnType<typeof parseAddSelection>,
  policyPath: string,
  versionIndex: number,
): Promise<Response> {
  if (addSelection.kind === "apple-compat") {
    return await postJson("/api/apple-compat/add", { policyPath, versionIndex, settingId: addSelection.value });
  }
  if (addSelection.kind === "apple-profile") {
    return await postJson("/api/apple-profile/add", { policyPath, versionIndex, schemaId: addSelection.value });
  }
  if (addSelection.kind === "custom-settings") {
    return await postJson("/api/custom-settings/add", {
      policyPath,
      versionIndex,
      domain: "com.example.app",
      settings: {},
      displayName: "Application & Custom Settings",
    });
  }
  return await postJson("/api/add-configuration", { policyPath, versionIndex, type: addSelection.value });
}

async function postSidecarAction(url: string, body: JsonRecord, success: string): Promise<void> {
  if (Object.values(body).some((value) => typeof value === "string" && value.length === 0)) {
    return;
  }
  const response = await postJson(url, body);
  const result = await readJsonResponse<{ sidecar?: unknown } & JsonRecord>(response);
  if (!response.ok || !isEditorSidecarState(result.sidecar)) {
    setStatus(`${success} blocked: ${JSON.stringify(result)}`);
    return;
  }
  setState({ ...currentState, sidecar: result.sidecar });
  setStatus(success);
}

async function postArtifactUpdate(url: string, uuid: string, valuesJson: string, success: string): Promise<void> {
  try {
    const parsed = JSON.parse(valuesJson.length === 0 ? "{}" : valuesJson) as unknown;
    const values = asRecord(parsed);
    if (values === undefined) {
      setStatus("Artifact values JSON must be an object");
      return;
    }
    await postSidecarAction(url, { uuid, values }, success);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error));
  }
}

function updateSelectedPolicy(change: (policyToUpdate: WorkspacePolicy) => void, message: string): void {
  if (selection === undefined) {
    return;
  }
  const nextWorkspace = cloneWorkspace(currentState.workspace);
  const policyToUpdate = nextWorkspace.policies[selection.policyIndex];
  if (policyToUpdate === undefined) {
    return;
  }
  change(policyToUpdate);
  markWorkspaceDirty(nextWorkspace, selection, message);
}

  return {
    setRawJson,
    resetRawJson,
    setRecommendationSource,
    toggleComplianceSource,
    saveWorkspace,
    addConfiguration,
    addPolicy,
    removeConfiguration,
    moveConfiguration,
    buildArchive,
    setActiveKey,
    importArchive,
    importJsonTemplates,
    importRuleset,
    importRecommendationRuleset,
    refreshCompliance,
    applyComplianceRemediation,
    addDdmArtifact,
    addMdmCommandArtifact,
    reconcileSidecar,
    removeDdmArtifact,
    removeMdmCommandArtifact,
    updateDdmArtifact,
    updateMdmCommandArtifact,
    renameSelectedPolicy,
    updateSelectedPolicyDescription,
    duplicateSelectedPolicy,
    deleteSelectedPolicy,
    ...workspaceHistoryActions,
    ...baselineApplyActions,
    updateSelectedConfiguration,
    applyRawJson,
  };
}
