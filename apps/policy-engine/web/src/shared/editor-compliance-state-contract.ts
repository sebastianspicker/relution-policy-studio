/** Controller-facing compliance setters shared without coupling to feature ownership. */
import type { Dispatch, SetStateAction } from "react";
import type { ComplianceReport, RecommendationSource } from "../../../src/browser/assurance.js";
import type { PolicyWorkspace } from "../../../src/browser/workspace.js";

export interface ComplianceStateSetters {
  readonly setComplianceSources: Dispatch<SetStateAction<RecommendationSource[]>>;
  readonly setComplianceReportForWorkspace: (report: ComplianceReport, workspace: PolicyWorkspace) => void;
  readonly setComplianceLoading: Dispatch<SetStateAction<boolean>>;
  readonly setComplianceError: Dispatch<SetStateAction<string | undefined>>;
}
