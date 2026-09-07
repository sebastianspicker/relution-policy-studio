import { useState, type JSX } from "react";
import type { RelutionAssessmentReport } from "../../../../src/browser/integrations.js";
import type { ZammadTicketDraft } from "../../../../src/browser/integrations.js";
import { InlineStatus } from "../../ui/InlineStatus.js";
import { DeviceFindingTable } from "./relution-dashboard-device-table.js";
import { FindingDetail } from "./relution-dashboard-finding-detail.js";
import { deviceKey, filterAssessments, parseDeviceFilter } from "./relution-dashboard-findings-data.js";
import type { DeviceFilter } from "./relution-dashboard-types.js";

export interface DeviceFindingsSectionProps {
  readonly assessment: RelutionAssessmentReport;
  readonly filter: DeviceFilter;
  readonly search: string;
  readonly zammadReady: boolean;
  readonly loading: boolean;
  readonly onFilter: (value: DeviceFilter) => void;
  readonly onSearch: (value: string) => void;
  readonly onTicketDraft: (draft: ZammadTicketDraft) => void;
}

export function DeviceFindingsSection(props: DeviceFindingsSectionProps): JSX.Element {
  const [selectedKey, setSelectedKey] = useState<string>();
  const assessments = filterAssessments(props.assessment.devices, props.filter, props.search);
  const selected = assessments.find((entry) => deviceKey(entry) === selectedKey) ?? assessments[0];

  return (
    <section className="audit-findings" aria-labelledby="audit-findings-title">
      <div className="audit-findings-heading">
        <div>
          <h2 id="audit-findings-title">Device findings</h2>
          <CompletenessWarning assessment={props.assessment} />
        </div>
        <div className="audit-filter-bar">
          <label>
            <span>Filter</span>
            <select value={props.filter} onChange={(event) => props.onFilter(parseDeviceFilter(event.target.value))}>
              <option value="all">All</option>
              <option value="noncompliant">Non-compliant</option>
              <option value="missing-policy">Missing policy</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
          <label>
            <span>Search</span>
            <input value={props.search} onChange={(event) => props.onSearch(event.target.value)} />
          </label>
        </div>
      </div>

      {assessments.length === 0 ? (
        <InlineStatus kind="info">No devices match the current filter.</InlineStatus>
      ) : (
        <>
          <DeviceFindingTable assessments={assessments} selected={selected} onSelect={setSelectedKey} />
          {selected === undefined ? null : (
            <FindingDetail
              entry={selected}
              loading={props.loading}
              zammadReady={props.zammadReady}
              onTicketDraft={props.onTicketDraft}
            />
          )}
        </>
      )}
    </section>
  );
}

function CompletenessWarning(props: { readonly assessment: RelutionAssessmentReport }): JSX.Element | null {
  const completeness = props.assessment.completeness;
  if (completeness.status === "partial") {
    return (
      <p className="warning" role="alert">
        Showing {completeness.assessedCount} of {completeness.total ?? "unknown"} enrolled devices; compliance results are incomplete.
      </p>
    );
  }
  if (completeness.status === "unknown") {
    return <p className="warning" role="alert">The server did not report a total device count; audit completeness is unknown.</p>;
  }
  return null;
}
