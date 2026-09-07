/** Shared state and request-lifecycle contract for compliance controller actions. */
import type { SetStateAction } from "react";
import type { ComplianceReport } from "../../../../src/browser/assurance.js";
import type { RecommendationSource } from "../../../../src/browser/assurance.js";
import type { PolicyWorkspace } from "../../../../src/browser/workspace.js";
import { finishExplicitComplianceActivity, type beginExplicitComplianceActivity } from "../../shared/editor-workspace-request-activity.js";
import type { WorkspaceHistoryInput } from "../../shared/workspace-history.js";
import type { EditorActionStatus } from "../../shared/editor-workspace-mutation-context.js";
import type { WorkspaceRequestGuard } from "../../shared/editor-workspace-request-guard.js";
import type { AppState, Selection } from "../../shared/editor-contracts.js";
import { reportEditorActionFailure } from "../../shared/editor-action-failure.js";

export type ComplianceActionsInput = {
  readonly currentState: AppState;
  readonly selection: Selection | undefined;
  readonly complianceSources: RecommendationSource[];
  readonly complianceReport: ComplianceReport | undefined;
  readonly requestGuard: WorkspaceRequestGuard;
  readonly historyInput: WorkspaceHistoryInput;
  readonly setState: (state: SetStateAction<AppState | undefined>) => void;
  readonly setIsDirty: (value: boolean) => void;
  readonly setHasFreshBuild: (value: boolean) => void;
  readonly setComplianceLoading: (value: boolean) => void;
  readonly setComplianceError: (value: string | undefined) => void;
  readonly setComplianceReportForWorkspace: (report: ComplianceReport, workspace: PolicyWorkspace) => void;
} & EditorActionStatus;

export function reportComplianceRequestFailure(
  input: ComplianceActionsInput,
  isCurrent: () => boolean,
  action: "check" | "remediation",
  error: unknown,
): void {
  if (!isCurrent()) return;
  reportEditorActionFailure(input, `Compliance ${action} failed`, error);
}

export function finishComplianceRequest(
  input: ComplianceActionsInput,
  activity: ReturnType<typeof beginExplicitComplianceActivity>,
): void {
  if (finishExplicitComplianceActivity(input.setComplianceLoading, activity)) {
    input.setComplianceLoading(false);
  }
}
