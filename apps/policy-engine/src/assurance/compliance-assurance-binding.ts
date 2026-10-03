/** Keeps configuration matches distinct from audited source and device applicability. */
import { assuranceApplicability } from "./assurance-applicability.js";
import type { BuildComplianceReportInput } from "./compliance-contracts.js";
import type { ComplianceRecommendationResult } from "./compliance-report-types.js";

export function bindComplianceApplicability(
  result: ComplianceRecommendationResult,
  platform: string,
  assurance: BuildComplianceReportInput["assurance"],
): ComplianceRecommendationResult {
  const audited = assurance?.catalog.catalog.recommendations.find((entry) => entry.id === result.id);
  let reason: string | undefined;
  if (audited === undefined) reason = "Source and applicability audit is unavailable for this recommendation.";
  else if (!audited.selectable) reason = audited.dispositionReasons.join("; ") || "The declared mappings are not supported by the source and schema audit.";
  else {
    const applicability = assuranceApplicability(audited, platform, assurance!.applicability);
    if (!applicability.applies) reason = applicability.reason;
    else if (audited.parameters.some((parameter) => parameter.required)) reason = "Required institutional parameters need a reviewed assurance selection.";
  }
  return reason === undefined ? { ...result, localConfigurationStatus: result.status, applicabilityStatus: "verified" }
    : { ...result, localConfigurationStatus: result.status, applicabilityStatus: "unresolved",
      status: result.status === "parameter-required" ? "parameter-required" : "not-checkable",
      blockingReasons: [...result.blockingReasons, reason], remediationOptions: [] };
}
