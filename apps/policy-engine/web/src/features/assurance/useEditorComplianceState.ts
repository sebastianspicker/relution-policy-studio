/** Owns compliance report state and derives whether the report is current. */
import { useCallback, useState } from "react";
import type { ComplianceReport } from "../../../../src/browser/assurance.js";
import type { RecommendationSource } from "../../../../src/browser/assurance.js";
import type { PolicyWorkspace } from "../../../../src/browser/workspace.js";
import { complianceReportMatchesTarget } from "./editor-compliance-report.js";
import type { ComplianceReportState, ComplianceStateSetters } from "./editor-compliance-state-contract.js";
import { DEFAULT_COMPLIANCE_SOURCES } from "./editor-recommendation-state-contract.js";
import type { AppState, Selection } from "../../shared/editor-contracts.js";
import { useComplianceReportRefresh } from "./useComplianceReportRefresh.js";

export interface EditorComplianceState extends ComplianceStateSetters {
  readonly complianceSources: RecommendationSource[];
  readonly complianceReport: ComplianceReport | undefined;
  readonly complianceLoading: boolean;
  readonly complianceError: string | undefined;
}

/**
 * Publishes a report only when it still matches the current workspace,
 * selection, and source filters after the debounced request completes.
 */
export function useComplianceState(props: {
  readonly selection: Selection | undefined;
  readonly state: AppState | undefined;
}): EditorComplianceState {
  const [complianceSources, setComplianceSources] = useState<RecommendationSource[]>(() => [...DEFAULT_COMPLIANCE_SOURCES]);
  const [complianceReportState, setComplianceReportState] = useState<ComplianceReportState>();
  const [complianceLoading, setComplianceLoading] = useState(false);
  const [complianceError, setComplianceError] = useState<string | undefined>();

  const setComplianceReportForWorkspace = useCallback((report: ComplianceReport, workspace: PolicyWorkspace) => {
    setComplianceReportState({ report, workspace });
  }, []);

  useComplianceReportRefresh({
    complianceSources,
    selection: props.selection,
    setComplianceError,
    setComplianceLoading,
    setComplianceReportState,
    state: props.state,
  });

  const currentWorkspace = props.state?.workspace;
  const complianceReport = currentWorkspace !== undefined
    && props.selection !== undefined
    && complianceSources.length > 0
    && complianceReportState?.workspace === currentWorkspace
    && complianceReportMatchesTarget(complianceReportState.report, currentWorkspace, props.selection, complianceSources)
    ? complianceReportState.report
    : undefined;

  return {
    complianceSources,
    complianceReport,
    complianceLoading,
    complianceError,
    setComplianceSources,
    setComplianceReportForWorkspace,
    setComplianceLoading,
    setComplianceError,
  };
}
