/** Implements an explicit compliance refresh action. */
import type { ComplianceReport } from "../../../../src/browser/assurance.js";
import { finishComplianceRequest, reportComplianceRequestFailure, type ComplianceActionsInput } from "./editor-compliance-action-runtime.js";
import { postJson } from "../../shared/editor-api-client.js";
import { readJsonResponse } from "../../shared/editor-record-utils.js";
import { beginExplicitComplianceActivity } from "../../shared/editor-workspace-request-activity.js";
import type { JsonRecord } from "../../shared/editor-contracts.js";

export function createComplianceCheckAction(input: ComplianceActionsInput): () => Promise<void> {
  return async function refreshCompliance(): Promise<void> {
    if (input.selection === undefined) {
      input.setActionErrorStatus("Select a policy before checking compliance");
      return;
    }
    const policyPath = input.currentState.workspace.policies[input.selection.policyIndex]?.path;
    if (policyPath === undefined) {
      input.setActionErrorStatus("Selected policy is no longer available");
      return;
    }
    if (!input.requestGuard.canEditWorkspace()) {
      input.setActionErrorStatus("A server workspace mutation is in progress");
      return;
    }
    const request = input.requestGuard.begin();
    const activity = beginExplicitComplianceActivity(input.setComplianceLoading);
    try {
      input.setComplianceLoading(true);
      input.setComplianceError(undefined);
      const response = await postJson("/api/compliance/check", {
        expectedRevision: input.currentState.revision,
        target: { policyPath, versionIndex: input.selection.versionIndex },
        sources: input.complianceSources,
      });
      const result = await readJsonResponse<{ report?: ComplianceReport; revision?: string } & JsonRecord>(response);
      if (!input.requestGuard.isCurrent(request)) return;
      if (!response.ok || result.report === undefined || typeof result.revision !== "string") {
        input.setActionErrorStatus(`Compliance check failed: ${JSON.stringify(result)}`);
        return;
      }
      input.setState((current) => current === undefined ? current : { ...current, revision: result.revision! });
      input.setComplianceReportForWorkspace(result.report, input.currentState.workspace);
      input.setActionSuccessStatus("Checked compliance");
    } catch (error) {
      reportComplianceRequestFailure(input, () => input.requestGuard.isCurrent(request), "check", error);
    } finally {
      finishComplianceRequest(input, activity);
    }
  };
}
