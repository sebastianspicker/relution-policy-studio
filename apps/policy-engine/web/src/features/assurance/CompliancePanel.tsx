/** Displays filtered compliance findings and applies their remediation through the editor controller. */
import type { JSX } from "react";
import { CompliancePanelView } from "./CompliancePanelView.js";
import type { EditorController } from "../../shared/editor-contracts.js";
import { useCompliancePanelState } from "./useCompliancePanelState.js";

export function CompliancePanel({ controller }: { readonly controller: EditorController }): JSX.Element {
  const report = controller.complianceReport;
  const state = useCompliancePanelState(report, controller.complianceSources);
  return (
    <CompliancePanelView
      policy={controller.policy}
      sources={controller.complianceSources}
      report={report}
      error={controller.complianceError}
      loading={controller.complianceLoading}
      query={state.query}
      statusFilter={state.statusFilter}
      filteredResults={state.filteredResults}
      selectedResult={state.selectedResult}
      onToggleSource={controller.toggleComplianceSource}
      onRefresh={() => void controller.refreshCompliance()}
      onQueryChange={state.setQuery}
      onStatusChange={state.setStatusFilter}
      onSelectResult={state.setSelectedResultId}
      onApplyRemediation={(remediationId) => void controller.applyComplianceRemediation(remediationId)}
    />
  );
}
