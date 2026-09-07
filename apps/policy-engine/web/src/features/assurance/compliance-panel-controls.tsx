/** Provides the local search and status controls for a loaded compliance report. */
import type { ChangeEvent, JSX } from "react";
import { ALL_COMPLIANCE_STATUSES, type ComplianceFilterStatus } from "./compliance-panel-model.js";

export function ComplianceControls(props: {
  readonly query: string;
  readonly status: ComplianceFilterStatus;
  readonly onQueryChange: (query: string) => void;
  readonly onStatusChange: (status: ComplianceFilterStatus) => void;
}): JSX.Element {
  return (
    <div className="recommendation-controls">
      <label htmlFor="compliance-search">Search<input id="compliance-search" name="compliance-search" type="search" autoComplete="off" value={props.query} onChange={(event) => props.onQueryChange(event.target.value)} /></label>
      <label>Status<select value={props.status} onChange={(event) => updateStatus(event, props.onStatusChange)}>
        <option value={ALL_COMPLIANCE_STATUSES}>All</option>
        <option value="compliant">Compliant</option>
        <option value="exact-gap">Exact gap</option>
        <option value="choice-required">Choice required</option>
        <option value="parameter-required">Parameter required</option>
        <option value="not-checkable">Not checkable</option>
      </select></label>
    </div>
  );
}

function updateStatus(event: ChangeEvent<HTMLSelectElement>, onStatusChange: (status: ComplianceFilterStatus) => void): void {
  onStatusChange(event.target.value as ComplianceFilterStatus);
}
