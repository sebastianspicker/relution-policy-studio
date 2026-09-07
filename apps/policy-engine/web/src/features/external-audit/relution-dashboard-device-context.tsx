import type { JSX } from "react";
import type { RelutionAssessmentIssue, RelutionDeviceAssessment } from "../../../../src/browser/integrations.js";
import { StatusChip } from "../../ui/StatusChip.js";

export function DeviceFindingContext(props: { readonly entry: RelutionDeviceAssessment }): JSX.Element {
  const { device } = props.entry;
  return (
    <div className="audit-finding-context">
      <h3>Device context</h3>
      <dl>
        <div><dt>Device ID</dt><dd>{device.uuid ?? "Unknown"}</dd></div>
        <div><dt>Serial</dt><dd>{device.serialNumber ?? "Unknown"}</dd></div>
        <div><dt>User</dt><dd>{device.userEmail ?? device.userName ?? "Unknown"}</dd></div>
        <div><dt>Assigned policies</dt><dd>{assignedPolicyText(device.assignedPolicies)}</dd></div>
      </dl>
    </div>
  );
}

function assignedPolicyText(policies: readonly (string | undefined)[] | undefined): string {
  const assigned = policies?.filter((policy): policy is string => typeof policy === "string" && policy.length > 0) ?? [];
  return assigned.length === 0 ? "None" : assigned.join(", ");
}

export interface IssueDetailProps {
  readonly issue: RelutionAssessmentIssue;
  readonly loading: boolean;
  readonly zammadReady: boolean;
  readonly onTicketDraft: () => void;
}

export function IssueDetail(props: IssueDetailProps): JSX.Element {
  return (
    <article className="audit-issue">
      <div className="audit-issue-heading">
        <div>
          <strong>{props.issue.id}</strong>
          <p>{props.issue.message}</p>
        </div>
        <StatusChip kind={props.issue.severity === "problem" ? "danger" : "warning"}>{props.issue.severity}</StatusChip>
      </div>
      {Object.keys(props.issue.evidence).length === 0 ? null : (
        <dl>
          {Object.entries(props.issue.evidence).map(([key, value]) => (
            <div key={key}><dt>{key}</dt><dd>{value}</dd></div>
          ))}
        </dl>
      )}
      <button type="button" disabled={!props.zammadReady || props.loading} onClick={props.onTicketDraft}>
        Ticket: {props.issue.id}
      </button>
    </article>
  );
}
