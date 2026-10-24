/** Builds the archive while preserving request activity ownership. */
import { postJson } from "../../shared/editor-api-client.js";
import { asRecord, isEditorSidecarState, readJsonResponse } from "../../shared/editor-record-utils.js";
import type { ImportBuildActionInput } from "../../shared/editor-import-build-contract.js";
import { errorMessage } from "./editor-ruleset-apply.js";
import type { WorkspaceRequest } from "../../shared/editor-workspace-request-guard.js";
import type { JsonRecord } from "../../shared/editor-contracts.js";

async function persistDirtyWorkspace(input: ImportBuildActionInput, request: WorkspaceRequest): Promise<boolean> {
  if (!input.isDirty) return true;
  const workspace = input.currentState.workspace;
  return await input.persistWorkspace(workspace, request) !== undefined;
}

function isSuccessfulBuild(response: Response, verification: JsonRecord | undefined): boolean {
  return response.ok && verification?.ok === true;
}

function applySuccessfulBuild(input: ImportBuildActionInput, result: JsonRecord): void {
  input.setState((current) => current === undefined ? current : {
    ...current,
    outputFile: typeof result.outputFile === "string" ? result.outputFile : current.outputFile,
    sidecar: isEditorSidecarState(result.sidecar) ? result.sidecar : current.sidecar,
  });
  input.setHasFreshBuild(true);
  input.setActionSuccessStatus(`Built ${String(result.outputFile)}`);
}

function validationErrorSummary(validation: JsonRecord | undefined): string | undefined {
  const errors = Array.isArray(validation?.errors) ? validation.errors.map((entry) => asRecord(entry)) : [];
  if (errors.length === 0) return undefined;
  const shown = errors.slice(0, 3).map((error) => `${String(error?.path ?? "workspace")}: ${String(error?.message ?? "invalid")}`);
  const more = errors.length > shown.length ? `; and ${String(errors.length - shown.length)} more` : "";
  return `${String(errors.length)} validation error${errors.length === 1 ? "" : "s"}: ${shown.join("; ")}${more}`;
}

function buildFailureStatus(verification: JsonRecord | undefined, result: JsonRecord): string {
  if (verification !== undefined && verification.ok !== true) return "Build verification failed";
  const reason = typeof result.error === "string" ? result.error : validationErrorSummary(asRecord(result.validation));
  return `Build blocked: ${reason ?? JSON.stringify(result)}`;
}

function applyCurrentBuildResponse(input: ImportBuildActionInput, request: WorkspaceRequest, response: Response, result: JsonRecord): void {
  if (!input.requestGuard.isCurrent(request)) return;
  const verification = asRecord(result.verification);
  if (isSuccessfulBuild(response, verification)) {
    applySuccessfulBuild(input, result);
    return;
  }
  input.setActionErrorStatus(buildFailureStatus(verification, result));
}

export async function buildArchive(input: ImportBuildActionInput): Promise<void> {
  if (!input.requestGuard.canEditWorkspace()) {
    input.setActionErrorStatus("A server workspace mutation is in progress");
    return;
  }
  const request = input.requestGuard.begin();
  const activity = input.requestGuard.beginBuildActivity(request);
  input.setIsBuildLoading(true);
  input.setHasFreshBuild(false);
  try {
    if (!await persistDirtyWorkspace(input, request)) return;
    const response = await postJson("/api/build", {});
    const result = await readJsonResponse<JsonRecord>(response);
    applyCurrentBuildResponse(input, request, response, result);
  } catch (error) {
    if (input.requestGuard.isCurrent(request)) {
      const message = errorMessage(error);
      input.setLastActionResult({ ok: false, error: message });
      input.setStatus(`Build failed: ${message}`);
    }
  } finally {
    if (input.requestGuard.finishBuildActivity(activity)) input.setIsBuildLoading(false);
  }
}
