/** Refreshes compliance results while avoiding needless requests during active edits. */
import { useEffect } from "react";
import { complianceReportMatchesTarget } from "./editor-compliance-report.js";
import { requestComplianceReport } from "./editor-compliance-request.js";
import type { ComplianceRefreshProps } from "./editor-compliance-state-contract.js";
import { hasExplicitComplianceActivity } from "../../shared/editor-workspace-request-activity.js";

const COMPLIANCE_REFRESH_DELAY_MS = 250;

type RefreshWorkspace = NonNullable<ComplianceRefreshProps["state"]>["workspace"];
type RefreshSelection = NonNullable<ComplianceRefreshProps["selection"]>;

export function useComplianceReportRefresh(props: ComplianceRefreshProps): void {
  useEffect(() => {
    if (props.isDirty || props.state === undefined || props.selection === undefined || props.complianceSources.length === 0) {
      clearComplianceRefresh(props);
      return;
    }
    const workspace = props.state.workspace;
    const selection = props.selection;
    retainMatchingReport(props, workspace, selection);
    props.setComplianceError(undefined);
    let cancelled = false;
    let timer: number;
    const refreshWhenIdle = () => {
      if (cancelled) return;
      if (!props.requestGuard.canEditWorkspace()) {
        timer = window.setTimeout(refreshWhenIdle, COMPLIANCE_REFRESH_DELAY_MS);
        return;
      }
      void refreshComplianceReport(props, workspace, selection, () => cancelled);
    };
    timer = window.setTimeout(refreshWhenIdle, COMPLIANCE_REFRESH_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    props.complianceSources,
    props.isDirty,
    props.requestGuard,
    props.selection,
    props.setComplianceError,
    props.setComplianceLoading,
    props.setComplianceReportState,
    props.state?.workspace,
    props.state?.revision,
  ]);
}

function clearComplianceRefresh(props: ComplianceRefreshProps): void {
  props.setComplianceReportState(undefined);
  props.setComplianceError(undefined);
  if (!hasExplicitComplianceActivity(props.setComplianceLoading)) props.setComplianceLoading(false);
}

function retainMatchingReport(props: ComplianceRefreshProps, workspace: RefreshWorkspace, selection: RefreshSelection): void {
  props.setComplianceReportState((current) => current !== undefined
    && current.workspace === workspace
    && complianceReportMatchesTarget(current.report, workspace, selection, props.complianceSources)
    ? current
    : undefined);
}

async function refreshComplianceReport(
  props: ComplianceRefreshProps,
  workspace: RefreshWorkspace,
  selection: RefreshSelection,
  isCancelled: () => boolean,
): Promise<void> {
  props.setComplianceLoading(true);
  try {
    const report = await requestComplianceReport(workspace, selection, props.complianceSources, props.state!.revision);
    if (!isCancelled()) props.setComplianceReportState({ report, workspace });
  } catch (error) {
    if (!isCancelled()) props.setComplianceError(error instanceof Error ? error.message : String(error));
  } finally {
    if (!isCancelled() && !hasExplicitComplianceActivity(props.setComplianceLoading)) {
      props.setComplianceLoading(false);
    }
  }
}
