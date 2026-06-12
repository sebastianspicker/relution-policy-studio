import type { ComplianceReport } from "../../../src/compliance.js";
import type { RecommendationCatalogResponse, RecommendationSource } from "../../../src/recommendation-types.js";
import type { PolicyWorkspace, WorkspacePolicy, WorkspaceValidationResult } from "../../../src/workspace.js";
import { addConfigurationLabel, asRecord, cloneWorkspace, fileToBase64, firstConfigurationSelection, isEditorSidecarState, parseAddSelection, postJson, readJsonResponse, versionRecord } from "./editor-utils.js";
import type { AddPolicyResponse, AppState, JsonRecord, Selection, WorkspaceResponse } from "./types.js";
import { mergeSettingDetails, parseSettingDetailsJson } from "./json-template-import.js";
import { importRulesetWorkspace } from "./ruleset-import.js";
import { duplicatePolicy, recordPolicyInReport, removePolicyFromReport, updateReportPolicyName } from "./workspace-mutations.js";
import { ALL_RECOMMENDATION_PLATFORMS, filterActionableRecommendationRuleset, policyPlatform, preferredRecommendationPlatform } from "./recommendation-platform.js";
import { clearWorkspaceHistory, pushUndoState, WORKSPACE_HISTORY_LIMIT } from "./workspace-history.js";
import { baselineTemplateImportName, fetchBaselineTemplateRuleset, type BaselineExpertApplyRuleset, type BaselineTemplateClientSelection } from "./baseline-template-client.js";
import type { EditorControllerActions, UseEditorControllerActionsInput, WorkspaceHistoryEntry } from "./useEditorControllerActionTypes.js";
import { importedKeyState, keyResponseState, keyStatusMessage, type KeyUpdateResponse } from "./key-validation.js";
import { parseArtifactValuesJson, postAddConfiguration, postSidecarActionRequest } from "./useEditorControllerActionRequests.js";

export function useEditorControllerActions(input: UseEditorControllerActionsInput): EditorControllerActions {
  const {
    currentState, isDirty, selection, policy, configuration, details, canonicalRawJson, rawJson,
    selectedType, newPolicyPlatform, newPolicyName, keyValue, importFile, jsonTemplateFile, rulesetFile, ddmSchemaId, mdmCommandSchemaId,
  } = input.workspace;
  const {
    setState, setSelection, setRawJsonState, setRawJsonDirty, setSelectedType, setNewPolicyName, setStatus, setLastActionResult,
    setIsDirty, setHasFreshBuild, setRulesetReport, setInspectorTab, setIsBuildLoading,
  } = input.workspaceSetters;
  const { undoStack, redoStack, setUndoStack, setRedoStack } = input.history;
  const { recommendationCatalog, recommendationSummary, recommendationIndex, recommendationSource, recommendationPlatform } = input.recommendations;
  const { setSelectedRecommendationId, setRecommendationSourceState, setRecommendationPlatform, setRecommendationQuery } = input.recommendationSetters;
  const { complianceSources, complianceReport } = input.compliance;
  const { setComplianceSources, setComplianceReport, setComplianceLoading, setComplianceError } = input.complianceSetters;
  const historyInput = { currentState, isDirty, selection, undoStack, redoStack, setState, setSelection, setIsDirty, setHasFreshBuild, setStatus, setLastActionResult, setUndoStack, setRedoStack };

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
  setActionSuccessStatus("Saved workspace before server action");
  return updated.workspace;
}

function markWorkspaceDirty(nextWorkspace: PolicyWorkspace, nextSelection: Selection | undefined, message: string): void {
  pushUndoState(historyInput);
  setState({ ...currentState, workspace: nextWorkspace });
  setSelection(nextSelection);
  setIsDirty(true);
  setHasFreshBuild(false);
  setLastActionResult({ ok: true });
  setStatus(message);
}

function handleImportError(error: unknown, kind: string): void {
  const message = actionErrorMessage(error);
  setLastActionResult({ ok: false, error: message });
  setStatus(`${kind} failed: ${message}`);
}
function actionErrorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function setActionSuccessStatus(message: string): void { setLastActionResult({ ok: true }); setStatus(message); }
function setActionErrorStatus(message: string): void { setLastActionResult({ ok: false, error: message }); setStatus(message); }
function currentHistoryEntry(): WorkspaceHistoryEntry { return { workspace: currentState.workspace, selection, isDirty }; }
function restoreHistoryEntry(entry: WorkspaceHistoryEntry, status: string): void {
  setState({ ...currentState, workspace: entry.workspace });
  setSelection(entry.selection);
  setIsDirty(entry.isDirty);
  setHasFreshBuild(false);
  setLastActionResult({ ok: true });
  setStatus(status);
}
function clearWorkspace(): void {
  if (currentState.workspace.policies.length === 0 && !isDirty) {
    return;
  }
  pushUndoState(historyInput);
  setState({ ...currentState, workspace: { ...currentState.workspace, report: {}, policies: [] } });
  setSelection(undefined);
  setIsDirty(true);
  setHasFreshBuild(false);
  setLastActionResult({ ok: true });
  setStatus("Cleared workspace");
}
function undoWorkspace(): void {
  const previous = undoStack.at(-1);
  if (previous === undefined) {
    return;
  }
  setUndoStack(undoStack.slice(0, -1));
  setRedoStack((current) => [...current, currentHistoryEntry()].slice(-WORKSPACE_HISTORY_LIMIT));
  restoreHistoryEntry(previous, "Restored previous workspace state");
}
function redoWorkspace(): void {
  const next = redoStack.at(-1);
  if (next === undefined) {
    return;
  }
  setRedoStack(redoStack.slice(0, -1));
  setUndoStack((current) => [...current, currentHistoryEntry()].slice(-WORKSPACE_HISTORY_LIMIT));
  restoreHistoryEntry(next, "Reapplied workspace state");
}
function confirmReplaceWorkspace(): boolean { return currentState.workspace.policies.length === 0 && !isDirty ? true : window.confirm("Replace the current workspace with this baseline? This does not touch Relution and can be undone before saving."); }
async function applyBaselineTemplate(template: BaselineTemplateClientSelection): Promise<void> {
  if (!confirmReplaceWorkspace()) return;
  await importBaselineRuleset(baselineTemplateImportName(template), fetchBaselineTemplateRuleset(template), "Applied baseline template", "Baseline template import failed");
}
async function applyExpertBaselineSelection(ruleset: BaselineExpertApplyRuleset): Promise<void> {
  if (!ruleset.policies.some((policy) => policy.rules.length > 0)) {
    setActionErrorStatus("Select at least one expert baseline setting");
    return;
  }
  if (!confirmReplaceWorkspace()) return;
  await importBaselineRuleset(ruleset.name, ruleset, "Applied expert baseline selection", "Expert baseline import failed");
}
async function importBaselineRuleset(name: string, parsed: Promise<unknown> | unknown, success: string, failure: string): Promise<void> {
  try {
    if (await applyRulesetJson(name, await parsed) === "applied") setActionSuccessStatus(success);
  } catch (error) {
    const message = actionErrorMessage(error);
    setLastActionResult({ ok: false, error: message });
    setStatus(`${failure}: ${message}`);
  }
}
async function saveWorkspace(nextWorkspace = currentState.workspace): Promise<void> {
  try {
    await persistWorkspace(nextWorkspace);
    setActionSuccessStatus("Saved workspace");
  } catch (error) {
    const message = actionErrorMessage(error);
    setLastActionResult({ ok: false, error: message });
    setStatus(`Save failed: ${message}`);
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
      setActionErrorStatus(`Configuration creation blocked: ${JSON.stringify(updated)}`);
      return;
    }
    setState({ ...currentState, workspace: updated.workspace, validation: updated.validation, sidecar: updated.sidecar ?? currentState.sidecar });
    setIsDirty(false);
    setHasFreshBuild(false);
    const version = versionRecord(updated.workspace, selection.policyIndex, selection.versionIndex);
    const nextConfigurationCount = Array.isArray(version?.configurations) ? version.configurations.length : 1;
    setSelection({ policyIndex: selection.policyIndex, versionIndex: selection.versionIndex, configurationIndex: nextConfigurationCount - 1 });
    setSelectedType("");
    setActionSuccessStatus(`Added ${addConfigurationLabel(addSelection)}`);
  } catch (error) {
    const message = actionErrorMessage(error);
    setLastActionResult({ ok: false, error: message });
    setStatus(`Configuration creation failed: ${message}`);
  }
}

async function addPolicy(): Promise<void> {
  const name = newPolicyName.trim();
  if (newPolicyPlatform.length === 0 || name.length === 0) {
    setActionErrorStatus("Policy name and operating system are required");
    return;
  }
  try {
    await ensureSavedWorkspace();
    const response = await postJson("/api/add-policy", { platform: newPolicyPlatform, name });
    const result = await readJsonResponse<AddPolicyResponse | JsonRecord>(response);
    if (!response.ok) {
      setActionErrorStatus(`Policy creation blocked: ${JSON.stringify(result)}`);
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
    setActionSuccessStatus(`Created ${name}`);
  } catch (error) {
    const message = actionErrorMessage(error);
    setLastActionResult({ ok: false, error: message });
    setStatus(`Policy creation failed: ${message}`);
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
  setHasFreshBuild(false);
  try {
    if (isDirty) {
      await persistWorkspace(currentState.workspace);
    }
    const response = await postJson("/api/build", {});
    const result = await readJsonResponse<JsonRecord>(response);
    const verification = asRecord(result.verification);
    if (!response.ok || verification?.ok !== true) {
      setActionErrorStatus(verification !== undefined && verification.ok !== true ? "Build verification failed" : `Build blocked: ${JSON.stringify(result)}`);
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
    setActionSuccessStatus(`Built ${String(result.outputFile)}`);
  } catch (error) {
    const message = actionErrorMessage(error);
    setLastActionResult({ ok: false, error: message });
    setStatus(`Build failed: ${message}`);
  } finally {
    setIsBuildLoading(false);
  }
}

async function setActiveKey(): Promise<void> {
  const key = keyValue.trim();
  if (key.length === 0) {
    setActionErrorStatus("Encryption key is required");
    return;
  }
  const response = await postJson("/api/key", { key });
  const result = await readJsonResponse<KeyUpdateResponse>(response);
  if (!response.ok) {
    setActionErrorStatus(`Key update blocked: ${JSON.stringify(result)}`);
    return;
  }
  setState({ ...currentState, ...keyResponseState(result) });
  setHasFreshBuild(false);
  setActionSuccessStatus(keyStatusMessage(keyResponseState(result)));
}

async function importArchive(): Promise<void> {
  if (importFile === undefined) {
    setActionErrorStatus("Choose a .rexp file first");
    return;
  }
  if (isDirty && !window.confirm("Importing replaces the current workspace. Continue?")) {
    return;
  }
  try {
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
      setActionErrorStatus(`Import blocked: ${JSON.stringify(result)}`);
      return;
    }
    const imported = result as WorkspaceResponse;
    setState({
      ...currentState,
      workspace: imported.workspace,
      validation: imported.validation,
      ...importedKeyState(imported, currentState),
      sidecar: imported.sidecar ?? currentState.sidecar,
    });
    setIsDirty(false);
    setHasFreshBuild(false);
    clearWorkspaceHistory(historyInput);
    setSelection(firstConfigurationSelection(imported.workspace));
    setSelectedType("");
    setActionSuccessStatus(`Imported ${importFile.name}`);
  } catch (error) {
    handleImportError(error, "Import");
  }
}

async function importJsonTemplates(): Promise<void> {
  if (selection === undefined || configuration === undefined || details === undefined) {
    setActionErrorStatus("Select a configuration before applying JSON");
    return;
  }
  if (jsonTemplateFile === undefined) {
    setActionErrorStatus("Choose a setting JSON file first");
    return;
  }
  try {
    const importedDetails = parseSettingDetailsJson(await jsonTemplateFile.text());
    updateSelectedConfiguration({ ...configuration, details: mergeSettingDetails(details, importedDetails) });
    setActionSuccessStatus(`Applied ${jsonTemplateFile.name} to selected setting`);
    setInspectorTab("validation");
  } catch (error) {
    handleImportError(error, "Setting JSON import");
  }
}

async function importRuleset(): Promise<void> {
  if (rulesetFile === undefined) {
    setActionErrorStatus("Choose a ruleset JSON file first");
    return;
  }
  if (isDirty && !window.confirm("Importing a ruleset replaces the current workspace. Continue?")) {
    return;
  }
  try {
    const parsed = JSON.parse(await rulesetFile.text()) as unknown;
    await applyRulesetJson(rulesetFile.name, parsed);
  } catch (error) {
    handleImportError(error, "Ruleset import");
  }
}

async function importRecommendationRuleset(): Promise<void> {
  if (recommendationCatalog?.ruleset === undefined) {
    setActionErrorStatus(`No bundled ruleset is available for ${recommendationSummary?.label ?? recommendationSource.toUpperCase()}`);
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
    setActionErrorStatus(`No actionable ${recommendationSummary?.label ?? recommendationSource.toUpperCase()} ruleset settings are available for ${recommendationPlatform}`);
    return;
  }
  try {
    await applyRulesetJson(recommendationCatalog.ruleset.name, ruleset);
  } catch (error) {
    handleImportError(error, "Bundled ruleset import");
  }
}

async function refreshCompliance(): Promise<void> {
  if (selection === undefined) {
    setActionErrorStatus("Select a policy before checking compliance");
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
      setActionErrorStatus(`Compliance check failed: ${JSON.stringify(result)}`);
      return;
    }
    setComplianceReport(result.report);
    setActionSuccessStatus("Checked compliance");
  } catch (error) {
    const message = actionErrorMessage(error);
    setLastActionResult({ ok: false, error: message });
    setStatus(`Compliance check failed: ${message}`);
  } finally {
    setComplianceLoading(false);
  }
}

async function applyComplianceRemediation(remediationId: string): Promise<void> {
  if (selection === undefined) {
    setActionErrorStatus("Select a policy before applying compliance remediation");
    return;
  }
  try {
    setComplianceLoading(true);
    setComplianceError(undefined);
    const resultToApply = complianceReport?.results.find((candidate) =>
      candidate.remediationOptions.some((option) => option.id === remediationId),
    );
    if (resultToApply === undefined) {
      setActionErrorStatus(`Compliance remediation is not available: ${remediationId}`);
      return;
    }
    const remediationToApply = resultToApply.remediationOptions.find((option) => option.id === remediationId);
    if (remediationToApply?.available === false) {
      setActionErrorStatus(`Compliance remediation is unavailable: ${remediationToApply.unavailableReason ?? remediationId}`);
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
      setActionErrorStatus(`Compliance remediation failed: ${JSON.stringify(result)}`);
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
    setActionSuccessStatus(`Applied compliance remediation ${remediationId}`);
  } catch (error) {
    const message = actionErrorMessage(error);
    setLastActionResult({ ok: false, error: message });
    setStatus(`Compliance remediation failed: ${message}`);
  } finally {
    setComplianceLoading(false);
  }
}

async function addDdmArtifact(): Promise<void> { await postSidecarAction("/api/ddm/artifact", { schemaId: ddmSchemaId }, "Added offline DDM artifact"); }
async function addMdmCommandArtifact(): Promise<void> { await postSidecarAction("/api/mdm-command/artifact", { schemaId: mdmCommandSchemaId }, "Added offline MDM command draft"); }

async function reconcileSidecar(): Promise<void> {
  try {
    await ensureSavedWorkspace();
    const response = await postJson("/api/roundtrip/reconcile", {});
    const result = await readJsonResponse<{ workspace?: PolicyWorkspace; validation?: WorkspaceValidationResult; sidecar?: unknown } & JsonRecord>(response);
    if (!response.ok || result.workspace === undefined || result.validation === undefined || !isEditorSidecarState(result.sidecar)) {
      setActionErrorStatus(`Sidecar reconcile blocked: ${JSON.stringify(result)}`);
      return;
    }
    setState({ ...currentState, workspace: result.workspace, validation: result.validation, sidecar: result.sidecar });
    setIsDirty(false);
    setHasFreshBuild(false);
    setActionSuccessStatus("Reconciled sidecar restore snapshots");
  } catch (error) {
    const message = actionErrorMessage(error);
    setLastActionResult({ ok: false, error: message });
    setStatus(`Sidecar reconcile failed: ${message}`);
  }
}

async function removeDdmArtifact(uuid: string): Promise<void> { await postSidecarAction("/api/ddm/artifact/remove", { uuid }, "Removed DDM artifact"); }
async function removeMdmCommandArtifact(uuid: string): Promise<void> { await postSidecarAction("/api/mdm-command/artifact/remove", { uuid }, "Removed MDM command draft"); }
async function updateDdmArtifact(uuid: string, valuesJson: string): Promise<void> { await postArtifactUpdate("/api/ddm/artifact/update", uuid, valuesJson, "Updated DDM artifact"); }
async function updateMdmCommandArtifact(uuid: string, valuesJson: string): Promise<void> { await postArtifactUpdate("/api/mdm-command/artifact/update", uuid, valuesJson, "Updated MDM command draft"); }

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
    setActionErrorStatus("Select a configuration before applying raw JSON");
    return;
  }
  try {
    const parsed = JSON.parse(rawJson) as unknown;
    const nextConfiguration = asRecord(parsed);
    if (nextConfiguration === undefined) {
      setActionErrorStatus("Raw JSON must be an object");
      return;
    }
    updateSelectedConfiguration(nextConfiguration);
    setRawJsonState(JSON.stringify(nextConfiguration, null, 2));
    setRawJsonDirty(false);
    setActionSuccessStatus("Applied raw JSON");
  } catch (error) {
    const message = actionErrorMessage(error);
    setActionErrorStatus(message);
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
async function applyRulesetJson(name: string, parsed: unknown): Promise<"applied" | "blocked"> {
  const result = importRulesetWorkspace(parsed, currentState.bundle, currentState.appleSchema);
  setRulesetReport(result.report);
  setInspectorTab("validation");
  if (result.workspace === undefined) {
    setActionErrorStatus(`Ruleset import blocked: ${result.report.conflicts.length} conflict(s), ${result.report.unresolved.length} unresolved rule(s)`);
    return "blocked";
  }
  const response = await postJson("/api/workspace/validate", { workspace: result.workspace });
  const validated = await readJsonResponse<{ validation: WorkspaceValidationResult }>(response);
  if (!response.ok || !validated.validation.ok) {
    setActionErrorStatus(`Ruleset validation blocked: ${JSON.stringify(validated)}`);
    return "blocked";
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
  setActionSuccessStatus(`Imported ruleset ${name}`);
  return "applied";
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

async function postSidecarAction(url: string, body: JsonRecord, success: string): Promise<void> {
  try {
    setState({ ...currentState, sidecar: await postSidecarActionRequest(url, body, success) });
    setActionSuccessStatus(success);
  } catch (error) {
    setActionErrorStatus(actionErrorMessage(error));
  }
}
async function postArtifactUpdate(url: string, uuid: string, valuesJson: string, success: string): Promise<void> {
  try {
    await postSidecarAction(url, { uuid, values: parseArtifactValuesJson(valuesJson) }, success);
  } catch (error) {
    const message = actionErrorMessage(error);
    setActionErrorStatus(message);
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
    setRawJson, resetRawJson, setRecommendationSource, toggleComplianceSource, saveWorkspace, addConfiguration,
    addPolicy, removeConfiguration, moveConfiguration, buildArchive, setActiveKey, importArchive, importJsonTemplates,
    importRuleset, importRecommendationRuleset, refreshCompliance, applyComplianceRemediation, addDdmArtifact,
    addMdmCommandArtifact, reconcileSidecar, removeDdmArtifact, removeMdmCommandArtifact, updateDdmArtifact,
    updateMdmCommandArtifact, renameSelectedPolicy, updateSelectedPolicyDescription, duplicateSelectedPolicy,
    deleteSelectedPolicy, clearWorkspace, undoWorkspace, redoWorkspace, applyBaselineTemplate,
    applyExpertBaselineSelection, updateSelectedConfiguration, applyRawJson,
  };
}
