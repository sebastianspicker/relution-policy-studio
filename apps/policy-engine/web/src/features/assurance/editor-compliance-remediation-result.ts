/** Publishes a successfully remediated workspace to controller state. */
import type { ComplianceReport } from "../../../../src/browser/assurance.js";
import type { PolicyWorkspace, WorkspaceValidationResult } from "../../../../src/browser/workspace.js";
import type { ComplianceActionsInput } from "./editor-compliance-action-runtime.js";
import { clearWorkspaceHistory } from "../../shared/workspace-history.js";
import type { AppState } from "../../shared/editor-contracts.js";

export function publishRemediatedWorkspace(
  input: ComplianceActionsInput,
  workspace: PolicyWorkspace,
  validation: WorkspaceValidationResult,
  sidecar: AppState["sidecar"] | undefined,
  report: ComplianceReport,
  revision: string,
  remediationId: string,
): void {
  input.setState((current) => current === undefined ? current : {
    ...current,
    revision,
    workspace,
    validation,
    sidecar: sidecar ?? current.sidecar,
  });
  input.setComplianceReportForWorkspace(report, workspace);
  input.setIsDirty(false);
  clearWorkspaceHistory(input.historyInput);
  input.setHasFreshBuild(false);
  input.setActionSuccessStatus(`Applied compliance remediation ${remediationId}`);
}
