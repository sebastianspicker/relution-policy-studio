/** Renders compliance feedback, controls, results, and remediation details. */
import type { JSX } from "react";
import type { ComplianceRecommendationResult, ComplianceReport } from "../../../../src/browser/assurance.js";
import type { RecommendationSource } from "../../../../src/browser/assurance.js";
import type { WorkspacePolicy } from "../../../../src/browser/workspace.js";
import { ComplianceControls } from "./compliance-panel-controls.js";
import { ComplianceDetail } from "./compliance-panel-detail.js";
import { ComplianceFeedback } from "./compliance-panel-feedback.js";
import { ComplianceList } from "./compliance-panel-list.js";
import type { ComplianceFilterStatus } from "./compliance-panel-model.js";
import { ComplianceOverview } from "./compliance-panel-overview.js";

export function CompliancePanelView(props: {
  readonly policy: WorkspacePolicy | undefined;
  readonly sources: readonly RecommendationSource[];
  readonly report: ComplianceReport | undefined;
  readonly error: string | undefined;
  readonly loading: boolean;
  readonly query: string;
  readonly statusFilter: ComplianceFilterStatus;
  readonly filteredResults: readonly ComplianceRecommendationResult[];
  readonly selectedResult: ComplianceRecommendationResult | undefined;
  readonly onToggleSource: (source: RecommendationSource) => void;
  readonly onRefresh: () => void;
  readonly onQueryChange: (query: string) => void;
  readonly onStatusChange: (status: ComplianceFilterStatus) => void;
  readonly onSelectResult: (resultId: string | undefined) => void;
  readonly onApplyRemediation: (remediationId: string) => void;
}): JSX.Element {
  return (
    <div className="inspector-content recommendations-panel">
      <h2>Compliance</h2>
      {props.policy === undefined ? <p className="empty-state">Select a policy to compare it against the harvested recommendations.</p> : (
        <>
          <ComplianceOverview
            policy={props.policy}
            sources={props.sources}
            report={props.report}
            onToggleSource={props.onToggleSource}
            onRefresh={props.onRefresh}
          />
          <ComplianceFeedback report={props.report} error={props.error} loading={props.loading} />
          {props.report !== undefined && !props.loading ? (
            <>
              <ComplianceControls query={props.query} status={props.statusFilter} onQueryChange={props.onQueryChange} onStatusChange={props.onStatusChange} />
              {props.selectedResult === undefined ? (
                <ComplianceList results={props.filteredResults} onSelect={props.onSelectResult} />
              ) : (
                <ComplianceDetail
                  result={props.selectedResult}
                  onBack={() => props.onSelectResult(undefined)}
                  onApply={props.onApplyRemediation}
                />
              )}
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
