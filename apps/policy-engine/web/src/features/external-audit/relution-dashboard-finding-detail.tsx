import type { JSX } from "react";
import type { RelutionDeviceAssessment } from "../../../../src/browser/integrations.js";
import { buildZammadTicketDraft, type ZammadTicketDraft } from "../../../../src/browser/integrations.js";
import { InlineStatus } from "../../ui/InlineStatus.js";
import { DeviceFindingContext, IssueDetail } from "./relution-dashboard-device-context.js";

export interface FindingDetailProps {
  readonly entry: RelutionDeviceAssessment;
  readonly zammadReady: boolean;
  readonly loading: boolean;
  readonly onTicketDraft: (draft: ZammadTicketDraft) => void;
}

export function FindingDetail(props: FindingDetailProps): JSX.Element {
  const { issues } = props.entry;
  return (
    <div className="audit-finding-detail">
      <DeviceFindingContext entry={props.entry} />
      <div className="audit-issue-list">
        <h3>Evidence and follow-up</h3>
        {issues.length === 0 ? (
          <InlineStatus kind="success">No issues were reported for this device.</InlineStatus>
        ) : issues.map((issue) => (
          <IssueDetail
            key={issue.id}
            issue={issue}
            loading={props.loading}
            zammadReady={props.zammadReady}
            onTicketDraft={() => props.onTicketDraft(buildZammadTicketDraft(props.entry, issue))}
          />
        ))}
      </div>
    </div>
  );
}
