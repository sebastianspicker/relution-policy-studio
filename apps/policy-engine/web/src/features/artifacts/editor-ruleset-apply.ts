/** Applies a validated ruleset to the live editor workspace. */
import { postJson } from "../../shared/editor-api-client.js";
import { readJsonResponse } from "../../shared/editor-record-utils.js";
import { firstConfigurationSelection } from "../../shared/editor-workspace-utils.js";
import type { ImportBuildActionInput } from "../../shared/editor-import-build-contract.js";
import type { WorkspaceRequest } from "../../shared/editor-workspace-request-guard.js";
import { importRulesetWorkspace } from "./ruleset-import.js";
import { pushUndoState } from "../../shared/workspace-history.js";
import type { WorkspaceValidationResult } from "../../../../src/browser/workspace.js";

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function reportImportError(input: ImportBuildActionInput, error: unknown, kind: string): void {
  const message = errorMessage(error);
  input.setLastActionResult({ ok: false, error: message });
  input.setStatus(`${kind} failed: ${message}`);
}

export async function applyRulesetJson(input: ImportBuildActionInput, name: string, parsed: unknown, request: WorkspaceRequest): Promise<"applied" | "blocked"> {
  if (!input.requestGuard.isCurrent(request)) return "blocked";
  const result = importRulesetWorkspace(parsed, input.currentState.bundle, input.currentState.appleSchema);
  input.setRulesetReport(result.report);
  input.setInspectorTab("validation");
  if (result.workspace === undefined) {
    input.setActionErrorStatus(`Ruleset import blocked: ${result.report.conflicts.length} conflict(s), ${result.report.unresolved.length} unresolved rule(s)`);
    return "blocked";
  }
  const response = await postJson("/api/workspace/validate", { workspace: result.workspace });
  const validated = await readJsonResponse<{ validation: WorkspaceValidationResult }>(response);
  if (!input.requestGuard.isCurrent(request)) return "blocked";
  if (!response.ok || !validated.validation.ok) {
    input.setActionErrorStatus(`Ruleset validation blocked: ${JSON.stringify(validated)}`);
    return "blocked";
  }
  if (!input.requestGuard.recordEdit()) return "blocked";
  const workspace = result.workspace;
  pushUndoState(input.historyInput);
  input.setState((current) => current === undefined ? current : {
    ...current,
    workspace,
    validation: validated.validation,
    sidecar: { version: 1, appleSchemaRevision: input.currentState.appleSchema.source.revision, mobileConfigRestore: [], ddmArtifacts: [], mdmCommandArtifacts: [], customManifests: [] },
  });
  input.setSelection(firstConfigurationSelection(workspace));
  input.setSelectedType("");
  input.setSelectedRecommendationId(undefined);
  input.setIsDirty(true);
  input.setHasFreshBuild(false);
  input.setActionSuccessStatus(`Imported ruleset ${name}`);
  return "applied";
}
