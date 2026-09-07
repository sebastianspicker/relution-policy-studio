/** Coordinates Relution and Zammad integration status, requests, and dashboard views. */
import { useState, type JSX } from "react";
import { InlineStatus } from "../../ui/InlineStatus.js";
import { AuditRunControls, AuditSummary } from "./relution-dashboard-audit-controls.js";
import { RelutionConnectionSection } from "./relution-dashboard-connection.js";
import { DeviceFindingsSection } from "./relution-dashboard-findings.js";
import { ZammadSection } from "./relution-dashboard-zammad.js";
import type { DeviceFilter } from "./relution-dashboard-types.js";
import { SectionHeader } from "../../ui/SectionHeader.js";
import { StatusChip } from "../../ui/StatusChip.js";
import { useLatestDashboardRequest } from "./useLatestDashboardRequest.js";
import { useRelutionDashboardAudit } from "./useRelutionDashboardAudit.js";
import { useDashboardZammad } from "./useDashboardZammad.js";

/** Routes integration requests through request domains so late network responses cannot win. */
export function RelutionDashboardPanel(): JSX.Element {
  const [filter, setFilter] = useState<DeviceFilter>("all");
  const [search, setSearch] = useState("");
  const { loading, error, run, invalidate } = useLatestDashboardRequest();
  const zammad = useDashboardZammad(run, invalidate);
  const relution = useRelutionDashboardAudit(run, zammad.clearTicketState);

  const sessionLabel = relution.session.configured
    ? `Relution ${relution.session.baseUrl ?? "unknown"} | read-only`
    : "No Relution API session configured | read-only";

  return (
    <div className="device-audit-workspace">
      <SectionHeader
        title="Device audit"
        description="Inspect enrolled-device posture through a read-only Relution session and create explicitly confirmed follow-up tickets."
        meta={<StatusChip kind={relution.session.configured ? "success" : "neutral"}>{relution.session.configured ? "Connected" : "Not configured"}</StatusChip>}
      />
      <p className="device-audit-session-line">{sessionLabel}</p>
      {error === undefined ? null : <InlineStatus kind="error">{error}</InlineStatus>}
      {loading ? <InlineStatus kind="loading">Working…</InlineStatus> : null}
      <div className="device-audit-setup">
        <RelutionConnectionSection
          protocol={relution.protocol}
          host={relution.host}
          port={relution.port}
          apiToken={relution.apiToken}
          loading={loading}
          configured={relution.session.configured}
          onProtocol={relution.setProtocol}
          onHost={relution.setHost}
          onPort={relution.setPort}
          onToken={relution.setApiToken}
          onSubmit={() => void relution.submitSession()}
          onTest={() => void relution.testConnection()}
        />
        <AuditRunControls
          platforms={relution.platforms}
          statuses={relution.statuses}
          expectedPolicies={relution.expectedPolicies}
          loading={loading}
          configured={relution.session.configured}
          hasAssessment={relution.assessment !== undefined}
          onPlatforms={relution.setPlatforms}
          onStatuses={relution.setStatuses}
          onExpectedPolicies={relution.setExpectedPolicies}
          onRun={() => void relution.runAudit()}
          onWriteReport={() => void relution.writeReport()}
        />
      </div>
      <AuditSummary devices={relution.devices} assessment={relution.assessment} reportPath={relution.reportPath} />
      {relution.assessment === undefined ? null : (
        <DeviceFindingsSection
          assessment={relution.assessment}
          filter={filter}
          search={search}
          zammadReady={zammad.session.configured}
          loading={loading}
          onFilter={setFilter}
          onSearch={setSearch}
          onTicketDraft={zammad.selectTicketDraft}
        />
      )}
      <ZammadSection
        protocol={zammad.protocol}
        host={zammad.host}
        port={zammad.port}
        token={zammad.token}
        group={zammad.group}
        customer={zammad.customer}
        session={zammad.session}
        loading={loading}
        draft={zammad.draft}
        result={zammad.result}
        confirming={zammad.confirming}
        onProtocol={zammad.setProtocol}
        onHost={zammad.setHost}
        onPort={zammad.setPort}
        onToken={zammad.setToken}
        onGroup={zammad.setGroup}
        onCustomer={zammad.setCustomer}
        onSubmit={() => void zammad.submitSession()}
        onTest={() => void zammad.testConnection()}
        onReview={zammad.reviewTicket}
        onCancel={zammad.cancelTicket}
        onCreate={() => void zammad.createTicket()}
      />
    </div>
  );
}
