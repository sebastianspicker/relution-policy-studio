/** Renders selectable compliance result cards after source, text, and status filtering. */
import type { JSX } from "react";
import type { ComplianceRecommendationResult } from "../../../../src/browser/assurance.js";
import { secondaryRecommendationId } from "./recommendation-record-utils.js";
import { COMPLIANCE_SOURCE_LABELS, complianceStatusLabel } from "./compliance-panel-model.js";

export function ComplianceList(props: {
  readonly results: readonly ComplianceRecommendationResult[];
  readonly onSelect: (resultId: string) => void;
}): JSX.Element {
  if (props.results.length === 0) {
    return <p className="empty-state">No compliance results match the current filters.</p>;
  }
  return <div className="recommendation-list">{props.results.map((result) => <ComplianceCard key={result.id} result={result} onSelect={props.onSelect} />)}</div>;
}

function ComplianceCard(props: { readonly result: ComplianceRecommendationResult; readonly onSelect: (resultId: string) => void }): JSX.Element {
  const { result } = props;
  return (
    <button type="button" className="recommendation-card" onClick={() => props.onSelect(result.id)}>
      <strong>{result.recommendation.title}</strong>
      <span>{COMPLIANCE_SOURCE_LABELS[result.source]} | {secondaryRecommendationId(result.source, result.recommendation)}</span>
      <span>{result.recommendation.platform}</span>
      <span>Status: {complianceStatusLabel(result.status)}</span>
      <span>{result.remediationOptions.length > 0 ? `${result.remediationOptions.length} remediation option(s)` : "No direct remediation"}</span>
    </button>
  );
}
