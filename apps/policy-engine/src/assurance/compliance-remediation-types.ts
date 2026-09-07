/** Declares remediation options and report-driven workspace application contracts. */
import type { BuildComplianceReportInput, ComplianceRemediationOption } from "./compliance-contracts.js";
import type { ComplianceReport } from "./compliance-report-types.js";
import type { RecommendationSource } from "./recommendation-types.js";
import type { PolicyWorkspace } from "../workspace/types.js";

export interface ApplyComplianceRemediationInput extends BuildComplianceReportInput {
  source: RecommendationSource;
  recommendationId: string;
  remediationId: string;
}

export interface ApplyComplianceRemediationResult {
  workspace: PolicyWorkspace;
  report: ComplianceReport;
  appliedRemediation: ComplianceRemediationOption;
}
