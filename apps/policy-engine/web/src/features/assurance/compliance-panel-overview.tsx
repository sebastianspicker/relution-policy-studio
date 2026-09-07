/** Renders the selected policy, source selection, refresh action, and compliance summary. */
import type { JSX } from "react";
import type { ComplianceReport } from "../../../../src/browser/assurance.js";
import type { RecommendationSource } from "../../../../src/browser/assurance.js";
import type { WorkspacePolicy } from "../../../../src/browser/workspace.js";
import { COMPLIANCE_SOURCE_LABELS } from "./compliance-panel-model.js";

const COMPLIANCE_SOURCES = ["bsi", "vendor", "cis"] as const;

export function ComplianceOverview(props: {
  readonly policy: WorkspacePolicy;
  readonly sources: readonly RecommendationSource[];
  readonly report: ComplianceReport | undefined;
  readonly onToggleSource: (source: RecommendationSource) => void;
  readonly onRefresh: () => void;
}): JSX.Element {
  return (
    <>
      <p className="status recommendation-summary">{props.policy.document.name as string} | {String(props.policy.document.platform)}</p>
      <ComplianceSourceSwitcher sources={props.sources} onToggleSource={props.onToggleSource} />
      <div className="compliance-actions"><button type="button" onClick={props.onRefresh}>Refresh</button></div>
      {props.report === undefined ? null : <ComplianceSummary report={props.report} />}
    </>
  );
}

function ComplianceSourceSwitcher(props: {
  readonly sources: readonly RecommendationSource[];
  readonly onToggleSource: (source: RecommendationSource) => void;
}): JSX.Element {
  return (
    <div className="recommendation-source-switcher" role="group" aria-label="Compliance sources">
      {COMPLIANCE_SOURCES.map((source) => {
        const active = props.sources.includes(source);
        const isLastActiveSource = active && props.sources.length === 1;
        return (
          <button key={source} type="button" aria-pressed={active} className={active ? "active" : ""} disabled={isLastActiveSource}
            title={isLastActiveSource ? "At least one compliance source must remain active." : undefined} onClick={() => props.onToggleSource(source)}>
            {COMPLIANCE_SOURCE_LABELS[source]}
          </button>
        );
      })}
    </div>
  );
}

function ComplianceSummary({ report }: { readonly report: ComplianceReport }): JSX.Element {
  const status = report.summary.byStatus;
  return (
    <div className="compliance-stat-row" role="status" aria-label="Compliance summary">
      <span className="compliance-stat compliance-stat--compliant"><span role="img" aria-label="Compliant">✓</span> {status.compliant}</span>
      <span className="compliance-stat compliance-stat--gap">Gap {status["exact-gap"]}</span>
      <span className="compliance-stat compliance-stat--choice">Choice {status["choice-required"]}</span>
      <span className="compliance-stat compliance-stat--param">Param {status["parameter-required"]}</span>
      <span className="compliance-stat compliance-stat--unknown"><span role="img" aria-label="Not checkable">?</span> {status["not-checkable"]}</span>
    </div>
  );
}
