/** Shared state contracts for compliance refresh and controller publication. */
import type { Dispatch, SetStateAction } from "react";
import type { ComplianceReport } from "../../../../src/browser/assurance.js";
import type { RecommendationSource } from "../../../../src/browser/assurance.js";
import type { PolicyWorkspace } from "../../../../src/browser/workspace.js";
import type { AppState, Selection } from "../../shared/editor-contracts.js";

export interface ComplianceReportState {
  readonly report: ComplianceReport;
  readonly workspace: PolicyWorkspace;
}

export type { ComplianceStateSetters } from "../../shared/editor-compliance-state-contract.js";

export interface ComplianceRefreshProps {
  readonly complianceSources: RecommendationSource[];
  readonly selection: Selection | undefined;
  readonly setComplianceError: Dispatch<SetStateAction<string | undefined>>;
  readonly setComplianceLoading: Dispatch<SetStateAction<boolean>>;
  readonly setComplianceReportState: Dispatch<SetStateAction<ComplianceReportState | undefined>>;
  readonly state: AppState | undefined;
}
