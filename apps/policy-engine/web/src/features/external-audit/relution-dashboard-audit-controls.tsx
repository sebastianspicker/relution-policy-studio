import type { JSX } from "react";
import type { RelutionAssessmentReport, RelutionDeviceQueryResult } from "../../../../src/browser/integrations.js";
import { InlineStatus } from "../../ui/InlineStatus.js";
import type { ReportWriteResult } from "./relution-dashboard-types.js";
import { StatusChip } from "../../ui/StatusChip.js";

export interface AuditRunControlsProps {
  readonly platforms: string;
  readonly statuses: string;
  readonly expectedPolicies: string;
  readonly loading: boolean;
  readonly configured: boolean;
  readonly hasAssessment: boolean;
  readonly onPlatforms: (value: string) => void;
  readonly onStatuses: (value: string) => void;
  readonly onExpectedPolicies: (value: string) => void;
  readonly onRun: () => void;
  readonly onWriteReport: () => void;
}

export function AuditRunControls(props: AuditRunControlsProps): JSX.Element {
  return (
    <details className="audit-disclosure" open>
      <summary>
        <span>Audit configuration</span>
        <StatusChip kind="info">Read-only</StatusChip>
      </summary>
      <div className="audit-form-grid audit-form-grid--run">
        <label>
          <span>Platforms</span>
          <input disabled={props.loading} value={props.platforms} onChange={(event) => props.onPlatforms(event.target.value)} />
        </label>
        <label>
          <span>Statuses</span>
          <input
            disabled={props.loading}
            value={props.statuses}
            placeholder="COMPLIANT,INACTIVE"
            onChange={(event) => props.onStatuses(event.target.value)}
          />
        </label>
        <label className="audit-form-wide">
          <span>Expected policies</span>
          <input
            disabled={props.loading}
            value={props.expectedPolicies}
            placeholder="IOS=Baseline iOS;ANDROID_ENTERPRISE=Android Baseline"
            onChange={(event) => props.onExpectedPolicies(event.target.value)}
          />
        </label>
        <div className="audit-form-actions">
          <button type="button" disabled={props.loading || !props.configured} onClick={props.onRun}>
            Run audit
          </button>
          <button type="button" disabled={props.loading || !props.hasAssessment} onClick={props.onWriteReport}>
            Write report
          </button>
        </div>
      </div>
    </details>
  );
}

export interface AuditSummaryProps {
  readonly devices: RelutionDeviceQueryResult | undefined;
  readonly assessment: RelutionAssessmentReport | undefined;
  readonly reportPath: ReportWriteResult | undefined;
}

export function AuditSummary(props: AuditSummaryProps): JSX.Element {
  if (props.assessment === undefined) {
    return <InlineStatus kind="info">No Relution audit available. Configure a read-only session and run an audit.</InlineStatus>;
  }
  const { summary } = props.assessment;
  return (
    <section className="audit-summary" aria-labelledby="audit-summary-title">
      <div className="audit-summary-heading">
        <h2 id="audit-summary-title">Results summary</h2>
        {props.reportPath === undefined ? null : <span className="ok">Report written: {props.reportPath.markdownPath}</span>}
      </div>
      <div className="audit-summary-stats" role="status" aria-label="Relution device summary">
        <StatusChip>Devices {String(props.devices?.count ?? summary.totalDevices)}</StatusChip>
        <StatusChip kind="success">Compliant {String(summary.compliant)}</StatusChip>
        <StatusChip kind="danger">Issues {String(summary.issue)}</StatusChip>
        <StatusChip kind="info">Not checkable {String(summary.notCheckable)}</StatusChip>
        <StatusChip kind="warning">Missing policy {String(summary.missingPolicy)}</StatusChip>
        <StatusChip kind="warning">Inactive 30+ {String(summary.inactiveWarning)}</StatusChip>
        <StatusChip kind="danger">Inactive 90+ {String(summary.inactiveProblem)}</StatusChip>
      </div>
    </section>
  );
}
