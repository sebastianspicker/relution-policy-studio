/** Renders matches, mapping evidence, blockers, and directly applicable remediation actions. */
import type { JSX } from "react";
import type { ComplianceRecommendationResult } from "../../../../src/browser/assurance.js";
import { complianceStatusLabel } from "./compliance-panel-model.js";

export function ComplianceEvaluation(props: {
  readonly result: ComplianceRecommendationResult;
  readonly onApply: (remediationId: string) => void;
}): JSX.Element {
  const { result } = props;
  return (
    <section className="preview-block">
      <h4>Compliance</h4>
      <p>Status: {complianceStatusLabel(result.status)}</p>
      <MatchedConfigurations result={result} />
      {result.mappingResults.length > 0 ? <pre>{result.mappingResults.map((entry) => `${entry.kind}: ${entry.target} -> ${entry.status}`).join("\n")}</pre> : null}
      {result.blockingReasons.length > 0 ? <pre>{result.blockingReasons.join("\n")}</pre> : null}
      {result.remediationOptions.length > 0 ? <RemediationActions result={result} onApply={props.onApply} /> : null}
    </section>
  );
}

function MatchedConfigurations({ result }: { readonly result: ComplianceRecommendationResult }): JSX.Element {
  return result.matchedConfigurations.length > 0 ? (
    <pre>{result.matchedConfigurations.map((entry) => `${entry.label} (#${entry.configurationIndex + 1})`).join("\n")}</pre>
  ) : <p>No matching configuration currently satisfies this recommendation.</p>;
}

function RemediationActions(props: { readonly result: ComplianceRecommendationResult; readonly onApply: (remediationId: string) => void }): JSX.Element {
  return <div className="json-actions">{props.result.remediationOptions.map((option) => (
    <button key={option.id} type="button" disabled={option.available === false} title={option.available === false ? option.unavailableReason : undefined}
      onClick={() => props.onApply(option.id)}>{option.label}</button>
  ))}</div>;
}
