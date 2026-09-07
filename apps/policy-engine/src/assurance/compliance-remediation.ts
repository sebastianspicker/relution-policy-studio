/** Applies one available report-driven compliance remediation to a workspace clone. */
import {
  applyNativeBundle,
  applyRecommendationMappings,
  selectedPolicyTarget,
} from "./compliance-internals.js";
import { buildComplianceReport } from "./compliance-report.js";
import type {
  ApplyComplianceRemediationInput,
  ApplyComplianceRemediationResult,
} from "./compliance-types.js";
import { findSettingBundle } from "./compliance-value-lookups.js";
import type { PolicyWorkspace } from "../workspace/types.js";

export function applyComplianceRemediationToWorkspace(input: ApplyComplianceRemediationInput): ApplyComplianceRemediationResult {
  // Remediation is deliberately report-driven: first compute the same result the
  // UI shows, then apply the selected option to a clone. This keeps "what would
  // be fixed" and "what was fixed" on the same mapping rules.
  const report = buildComplianceReport(input);
  const result = report.results.find((candidate) => candidate.source === input.source && candidate.recommendationId === input.recommendationId);
  if (result === undefined) {
    throw new Error(`Compliance recommendation not found: ${input.source}:${input.recommendationId}`);
  }
  const remediation = result.remediationOptions.find((candidate) => candidate.id === input.remediationId);
  if (remediation === undefined) {
    throw new Error(`Compliance remediation not available: ${input.remediationId}`);
  }
  if (remediation.available === false) {
    throw new Error(`Compliance remediation unavailable: ${remediation.unavailableReason ?? input.remediationId}`);
  }

  const nextWorkspace = structuredClone(input.workspace) as PolicyWorkspace;
  const target = selectedPolicyTarget(nextWorkspace, input.selection);

  if (remediation.kind === "native-bundle") {
    const bundle = findSettingBundle(input.catalogs[input.source]?.settingBundleCatalog, remediation.bundleId);
    if (bundle === undefined) {
      throw new Error(`Compliance bundle not found: ${String(remediation.bundleId)}`);
    }
    applyNativeBundle(target.configurations, bundle, input.bundle);
  } else {
    applyRecommendationMappings(target.configurations, result.recommendation, input.bundle, input.appleSchema);
  }

  return {
    workspace: nextWorkspace,
    report: buildComplianceReport({ ...input, workspace: nextWorkspace }),
    appliedRemediation: remediation,
  };
}
