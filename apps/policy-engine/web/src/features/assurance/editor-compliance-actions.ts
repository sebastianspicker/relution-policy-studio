/** Composes compliance check and remediation controller actions. */
import { createComplianceCheckAction } from "./editor-compliance-check-action.js";
import { createComplianceRemediationAction } from "./editor-compliance-remediation-action.js";
import type { ComplianceActionsInput } from "./editor-compliance-action-runtime.js";

export function createComplianceActions(input: ComplianceActionsInput): {
  readonly refreshCompliance: () => Promise<void>;
  readonly applyComplianceRemediation: (remediationId: string) => Promise<void>;
} {
  return {
    refreshCompliance: createComplianceCheckAction(input),
    applyComplianceRemediation: createComplianceRemediationAction(input),
  };
}
