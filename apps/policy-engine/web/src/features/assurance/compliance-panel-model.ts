/** Defines compliance-view labels and pure filter behavior shared by its controls and result cards. */
import type { ComplianceRecommendationResult, ComplianceStatus } from "../../../../src/browser/assurance.js";
import type { RecommendationSource } from "../../../../src/browser/assurance.js";
import { secondaryRecommendationId } from "./recommendation-record-utils.js";

export const ALL_COMPLIANCE_STATUSES = "ALL";
export type ComplianceFilterStatus = ComplianceStatus | typeof ALL_COMPLIANCE_STATUSES;

export const COMPLIANCE_SOURCE_LABELS: Readonly<Record<RecommendationSource, string>> = {
  bsi: "BSI",
  vendor: "Vendor",
  cis: "CIS",
};

export function filterComplianceResults(
  results: readonly ComplianceRecommendationResult[],
  activeSources: readonly RecommendationSource[],
  query: string,
  status: ComplianceFilterStatus,
): ComplianceRecommendationResult[] {
  const normalizedQuery = query.trim().toLowerCase();
  return results.filter((result) => {
    if (!activeSources.includes(result.source) || (status !== ALL_COMPLIANCE_STATUSES && result.status !== status)) {
      return false;
    }
    return normalizedQuery.length === 0 || complianceSearchTerms(result).some((value) => value.toLowerCase().includes(normalizedQuery));
  });
}

export function complianceStatusLabel(status: ComplianceStatus): string {
  const labels: Readonly<Record<ComplianceStatus, string>> = {
    compliant: "Compliant",
    "exact-gap": "Exact gap",
    "choice-required": "Choice required",
    "parameter-required": "Parameter required",
    "not-checkable": "Not checkable",
  };
  return labels[status];
}

function complianceSearchTerms(result: ComplianceRecommendationResult): readonly string[] {
  return [
    result.recommendation.title,
    result.recommendation.platform,
    COMPLIANCE_SOURCE_LABELS[result.source],
    secondaryRecommendationId(result.source, result.recommendation),
  ];
}
