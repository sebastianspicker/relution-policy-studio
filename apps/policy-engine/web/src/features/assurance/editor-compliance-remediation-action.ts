/** Applies a compliance remediation through the exclusive workspace mutation lane. */
import type { ComplianceReport } from "../../../../src/browser/assurance.js";
import type { PolicyWorkspace, WorkspaceValidationResult } from "../../../../src/browser/workspace.js";
import { finishComplianceRequest, reportComplianceRequestFailure, type ComplianceActionsInput } from "./editor-compliance-action-runtime.js";
import { complianceReportMatchesTarget } from "./editor-compliance-report.js";
import { publishRemediatedWorkspace } from "./editor-compliance-remediation-result.js";
import { postJson } from "../../shared/editor-api-client.js";
import { readJsonResponse } from "../../shared/editor-record-utils.js";
import { beginExplicitComplianceActivity } from "../../shared/editor-workspace-request-activity.js";
import type { AppState, JsonRecord, Selection } from "../../shared/editor-contracts.js";

export function createComplianceRemediationAction(input: ComplianceActionsInput): (remediationId: string) => Promise<void> {
  return async function applyComplianceRemediation(remediationId: string): Promise<void> {
    if (input.selection === undefined) {
      input.setActionErrorStatus("Select a policy before applying compliance remediation");
      return;
    }
    const report = input.complianceReport;
    if (!complianceReportMatchesTarget(report, input.currentState.workspace, input.selection, input.complianceSources)) {
      input.setActionErrorStatus("Refresh compliance for the selected policy and sources before applying remediation");
      return;
    }
    const request = input.requestGuard.beginExclusiveMutation();
    if (request === undefined) {
      input.setActionErrorStatus("A server workspace mutation is already in progress");
      return;
    }
    const activity = beginExplicitComplianceActivity(input.setComplianceLoading);
    try {
      await applyAvailableRemediation(input, remediationId, report, input.selection, request);
    } catch (error) {
      reportComplianceRequestFailure(input, () => input.requestGuard.isExclusiveCurrent(request), "remediation", error);
    } finally {
      finishComplianceRequest(input, activity);
      input.requestGuard.finishExclusiveMutation(request);
    }
  };
}

async function applyAvailableRemediation(
  input: ComplianceActionsInput,
  remediationId: string,
  report: ComplianceReport,
  selection: Selection,
  request: ReturnType<ComplianceActionsInput["requestGuard"]["begin"]>,
): Promise<void> {
  input.setComplianceLoading(true);
  input.setComplianceError(undefined);
  const resultToApply = report.results.find((candidate) => candidate.remediationOptions.some((option) => option.id === remediationId));
  if (resultToApply === undefined) {
    input.setActionErrorStatus(`Compliance remediation is not available: ${remediationId}`);
    return;
  }
  const remediationToApply = resultToApply.remediationOptions.find((option) => option.id === remediationId);
  if (remediationToApply?.available === false) {
    input.setActionErrorStatus(`Compliance remediation is unavailable: ${remediationToApply.unavailableReason ?? remediationId}`);
    return;
  }
  const policyPath = input.currentState.workspace.policies[selection.policyIndex]?.path;
  if (policyPath === undefined) {
    input.setActionErrorStatus("Selected policy is no longer available");
    return;
  }
  const response = await postJson("/api/compliance/apply", {
    expectedRevision: input.currentState.revision,
    target: { policyPath, versionIndex: selection.versionIndex },
    sources: input.complianceSources,
    source: resultToApply.source,
    recommendationId: resultToApply.recommendationId,
    remediationId,
  });
  const result = await readJsonResponse<{
    workspace?: PolicyWorkspace;
    validation?: WorkspaceValidationResult;
    sidecar?: AppState["sidecar"];
    report?: ComplianceReport;
    revision?: string;
  } & JsonRecord>(response);
  if (!input.requestGuard.isExclusiveCurrent(request)) return;
  if (!response.ok || result.workspace === undefined || result.validation === undefined || result.report === undefined || typeof result.revision !== "string") {
    input.setActionErrorStatus(`Compliance remediation failed: ${JSON.stringify(result)}`);
    return;
  }
  publishRemediatedWorkspace(input, result.workspace, result.validation, result.sidecar, result.report, result.revision, remediationId);
}
