import { useMemo, useState, type JSX } from "react";
import type {
  RelutionAssessmentReport,
  RelutionDeviceAssessment,
  RelutionDeviceQueryResult,
  RelutionPublicSession,
} from "../../../src/relution-api.js";
import { buildZammadTicketDraft, type ZammadTicketDraft } from "../../../src/zammad-ticket-drafts.js";
import type { ZammadPublicSession, ZammadTicketResult } from "../../../src/zammad-api.js";
import { postJson, readJsonResponse } from "./editor-utils.js";

type Protocol = "http" | "https";
type DeviceFilter = "all" | "noncompliant" | "missing-policy" | "inactive";

const DEVICE_FILTERS = ["all", "noncompliant", "missing-policy", "inactive"] as const satisfies readonly DeviceFilter[];
const RELUTION_LIST_VALUE_PATTERN = /^[A-Z0-9_-]+$/u;

interface AuditResponse {
  query: RelutionDeviceQueryResult;
  report: RelutionAssessmentReport;
}

interface ReportWriteResult {
  jsonPath: string;
  markdownPath: string;
}

export function RelutionDashboardPanel(): JSX.Element {
  const [protocol, setProtocol] = useState<Protocol>("https");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [platforms, setPlatforms] = useState("IOS,ANDROID_ENTERPRISE,MACOS,WINDOWS");
  const [statuses, setStatuses] = useState("");
  const [expectedPolicies, setExpectedPolicies] = useState("");
  const [filter, setFilter] = useState<DeviceFilter>("all");
  const [search, setSearch] = useState("");
  const [session, setSession] = useState<RelutionPublicSession>({ configured: false, tokenConfigured: false, mode: "read-only" });
  const [devices, setDevices] = useState<RelutionDeviceQueryResult | undefined>();
  const [assessment, setAssessment] = useState<RelutionAssessmentReport | undefined>();
  const [reportPath, setReportPath] = useState<ReportWriteResult | undefined>();
  const [zammadProtocol, setZammadProtocol] = useState<Protocol>("https");
  const [zammadHost, setZammadHost] = useState("");
  const [zammadPort, setZammadPort] = useState("");
  const [zammadToken, setZammadToken] = useState("");
  const [zammadGroup, setZammadGroup] = useState("IT");
  const [zammadCustomer, setZammadCustomer] = useState("");
  const [zammadSession, setZammadSession] = useState<ZammadPublicSession>({ configured: false, tokenConfigured: false });
  const [ticketDraft, setTicketDraft] = useState<ZammadTicketDraft | undefined>();
  const [ticketResult, setTicketResult] = useState<ZammadTicketResult | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const visibleAssessments = useMemo(
    () => assessment === undefined ? [] : filterAssessments(assessment.devices, filter, search),
    [assessment, filter, search],
  );

  async function submitSession(): Promise<void> {
    await run(async () => {
      const response = await postJson("/api/relution/session", {
        protocol,
        host,
        port: port.trim().length === 0 ? undefined : Number(port),
        apiToken,
      });
      const result = await readJsonResponse<RelutionPublicSession & { error?: string }>(response);
      if (!response.ok) {
        throw new Error(result.error ?? JSON.stringify(result));
      }
      setSession(result);
      setApiToken("");
      setDevices(undefined);
      setAssessment(undefined);
      setReportPath(undefined);
    });
  }

  async function testConnection(): Promise<void> {
    await run(async () => {
      const response = await postJson("/api/relution/test", {});
      const result = await readJsonResponse<{ ok?: boolean; baseUrl?: string; error?: string }>(response);
      if (!response.ok || result.ok !== true) {
        throw new Error(result.error ?? JSON.stringify(result));
      }
      setSession(result.baseUrl === undefined
        ? { configured: true, tokenConfigured: true, mode: "read-only" }
        : { configured: true, baseUrl: result.baseUrl, tokenConfigured: true, mode: "read-only" });
    });
  }

  async function runAudit(): Promise<void> {
    await run(async () => {
      const response = await postJson("/api/relution/devices/audit", {
        limit: 100,
        platforms: csvValues(platforms, "platform"),
        statuses: csvValues(statuses, "status"),
        expectedPoliciesByPlatform: expectedPoliciesByPlatform(expectedPolicies),
      });
      const result = await readJsonResponse<AuditResponse & { error?: string }>(response);
      if (!response.ok) {
        throw new Error(result.error ?? JSON.stringify(result));
      }
      setDevices(result.query);
      setAssessment(result.report);
      setReportPath(undefined);
      setTicketDraft(undefined);
      setTicketResult(undefined);
    });
  }

  async function writeReport(): Promise<void> {
    await run(async () => {
      const response = await postJson("/api/relution/reports/compliance", { report: assessment });
      const result = await readJsonResponse<ReportWriteResult & { error?: string }>(response);
      if (!response.ok) {
        throw new Error(result.error ?? JSON.stringify(result));
      }
      setReportPath(result);
    });
  }

  async function submitZammadSession(): Promise<void> {
    await run(async () => {
      const response = await postJson("/api/zammad/session", {
        protocol: zammadProtocol,
        host: zammadHost,
        port: zammadPort.trim().length === 0 ? undefined : Number(zammadPort),
        apiToken: zammadToken,
        group: zammadGroup,
        customer: zammadCustomer,
      });
      const result = await readJsonResponse<ZammadPublicSession & { error?: string }>(response);
      if (!response.ok) {
        throw new Error(result.error ?? JSON.stringify(result));
      }
      setZammadSession(result);
      setZammadToken("");
    });
  }

  async function testZammadConnection(): Promise<void> {
    await run(async () => {
      const response = await postJson("/api/zammad/test", {});
      const result = await readJsonResponse<{ ok?: boolean; baseUrl?: string; error?: string }>(response);
      if (!response.ok || result.ok !== true) {
        throw new Error(result.error ?? JSON.stringify(result));
      }
      setZammadSession((current) => ({
        ...current,
        configured: true,
        ...(result.baseUrl === undefined ? {} : { baseUrl: result.baseUrl }),
        tokenConfigured: true,
      }));
    });
  }

  async function createTicket(): Promise<void> {
    if (ticketDraft === undefined) {
      return;
    }
    await run(async () => {
      const response = await postJson("/api/zammad/tickets", { draft: ticketDraft });
      const result = await readJsonResponse<{ ticket?: ZammadTicketResult; error?: string }>(response);
      if (!response.ok || result.ticket === undefined) {
        throw new Error(result.error ?? JSON.stringify(result));
      }
      setTicketResult(result.ticket);
    });
  }

  async function run(task: () => Promise<void>): Promise<void> {
    setLoading(true);
    setError(undefined);
    try {
      await task();
    } catch (taskError) {
      setError(taskError instanceof Error ? taskError.message : String(taskError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="inspector-content recommendations-panel">
      <h2>Relution Dashboard</h2>
      <p className="status recommendation-summary">
        {session.configured ? `Relution ${session.baseUrl ?? "unknown"} | read-only` : "No Relution API session configured | read-only"}
      </p>
      {error !== undefined ? <p className="error">{error}</p> : null}
      {loading ? <p className="loading-inline" aria-live="polite">Working...</p> : null}
      <ConnectionSection
        protocol={protocol}
        host={host}
        port={port}
        apiToken={apiToken}
        loading={loading}
        configured={session.configured}
        onProtocol={setProtocol}
        onHost={setHost}
        onPort={setPort}
        onToken={setApiToken}
        onSubmit={() => void submitSession()}
        onTest={() => void testConnection()}
      />
      <section className="preview-block">
        <h3>Audit</h3>
        <div className="recommendation-controls">
          <label>Platforms<input value={platforms} onChange={(event) => setPlatforms(event.target.value)} /></label>
          <label>Statuses<input value={statuses} placeholder="COMPLIANT,INACTIVE" onChange={(event) => setStatuses(event.target.value)} /></label>
          <label>Expected policies<input value={expectedPolicies} placeholder="IOS=Baseline iOS;ANDROID_ENTERPRISE=Android Baseline" onChange={(event) => setExpectedPolicies(event.target.value)} /></label>
          <button type="button" disabled={loading || !session.configured} onClick={() => void runAudit()}>Run audit</button>
          <button type="button" disabled={loading || assessment === undefined} onClick={() => void writeReport()}>Write report</button>
        </div>
        {assessment !== undefined ? <DashboardStats devices={devices} report={assessment} /> : <p className="empty-state">No Relution audit available.</p>}
        {reportPath !== undefined ? <p className="ok">Report written: {reportPath.markdownPath}</p> : null}
      </section>
      {assessment !== undefined ? (
        <section className="preview-block">
          <h3>Devices</h3>
          <div className="recommendation-controls">
            <label>Filter
              <select value={filter} onChange={(event) => setFilter(parseDeviceFilter(event.target.value))}>
                <option value="all">All</option>
                <option value="noncompliant">Non-compliant</option>
                <option value="missing-policy">Missing policy</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <label>Search<input value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          </div>
          <DeviceFindingList
            assessments={visibleAssessments}
            zammadReady={zammadSession.configured}
            onTicketDraft={(draft) => {
              setTicketDraft(draft);
              setTicketResult(undefined);
            }}
          />
        </section>
      ) : null}
      <ZammadSection
        protocol={zammadProtocol}
        host={zammadHost}
        port={zammadPort}
        token={zammadToken}
        group={zammadGroup}
        customer={zammadCustomer}
        session={zammadSession}
        loading={loading}
        draft={ticketDraft}
        result={ticketResult}
        onProtocol={setZammadProtocol}
        onHost={setZammadHost}
        onPort={setZammadPort}
        onToken={setZammadToken}
        onGroup={setZammadGroup}
        onCustomer={setZammadCustomer}
        onSubmit={() => void submitZammadSession()}
        onTest={() => void testZammadConnection()}
        onCreate={() => void createTicket()}
      />
    </div>
  );
}

function ConnectionSection(props: {
  readonly protocol: Protocol;
  readonly host: string;
  readonly port: string;
  readonly apiToken: string;
  readonly loading: boolean;
  readonly configured: boolean;
  readonly onProtocol: (value: Protocol) => void;
  readonly onHost: (value: string) => void;
  readonly onPort: (value: string) => void;
  readonly onToken: (value: string) => void;
  readonly onSubmit: () => void;
  readonly onTest: () => void;
}): JSX.Element {
  return (
    <section className="preview-block">
      <h3>Relution</h3>
      <div className="recommendation-controls">
        <label>Protocol<select value={props.protocol} onChange={(event) => props.onProtocol(event.target.value as Protocol)}><option value="https">https</option><option value="http">http</option></select></label>
        <label>Server<input value={props.host} placeholder="relution.example.org" onChange={(event) => props.onHost(event.target.value)} /></label>
        <label>Port<input value={props.port} inputMode="numeric" placeholder="443" onChange={(event) => props.onPort(event.target.value)} /></label>
        <label>API token<input type="password" value={props.apiToken} autoComplete="off" onChange={(event) => props.onToken(event.target.value)} /></label>
        <button type="button" disabled={props.loading || props.host.trim().length === 0 || props.apiToken.trim().length === 0} onClick={props.onSubmit}>Set session</button>
        <button type="button" disabled={props.loading || !props.configured} onClick={props.onTest}>Test</button>
      </div>
    </section>
  );
}

function DashboardStats(props: { readonly devices: RelutionDeviceQueryResult | undefined; readonly report: RelutionAssessmentReport }): JSX.Element {
  return (
    <div className="compliance-stat-row" role="status" aria-label="Relution device summary">
      <span className="compliance-stat compliance-stat--unknown">Devices {props.devices?.count ?? props.report.summary.totalDevices}</span>
      <span className="compliance-stat compliance-stat--compliant">Compliant {props.report.summary.compliant}</span>
      <span className="compliance-stat compliance-stat--gap">Issues {props.report.summary.issue}</span>
      <span className="compliance-stat compliance-stat--param">Not checkable {props.report.summary.notCheckable}</span>
      <span className="compliance-stat compliance-stat--gap">Missing policy {props.report.summary.missingPolicy}</span>
      <span className="compliance-stat compliance-stat--param">Inactive 30+ {props.report.summary.inactiveWarning}</span>
      <span className="compliance-stat compliance-stat--gap">Inactive 90+ {props.report.summary.inactiveProblem}</span>
    </div>
  );
}

function DeviceFindingList(props: {
  readonly assessments: RelutionDeviceAssessment[];
  readonly zammadReady: boolean;
  readonly onTicketDraft: (draft: ZammadTicketDraft) => void;
}): JSX.Element {
  if (props.assessments.length === 0) {
    return <p className="empty-state">No devices match the current filter.</p>;
  }
  return (
    <div className="recommendation-list">
      {props.assessments.map((entry) => (
        <div key={entry.device.uuid ?? entry.device.name} className="recommendation-card">
          <strong>{entry.device.name}</strong>
          <span>
            {entry.device.platform ?? "unknown platform"}
            <AccessibleSeparator />
            {entry.device.userEmail ?? entry.device.userName ?? "unknown user"}
          </span>
          <span>
            Status: {entry.device.status ?? "unknown"}
            <AccessibleSeparator />
            Policy: {entry.device.policyStatus ?? "unknown"}
          </span>
          <span>Last connection: {entry.device.lastConnectionDate ?? "unknown"}{entry.device.inactiveDays === undefined ? "" : ` (${String(entry.device.inactiveDays)}d)`}</span>
          <span>Assigned policies: {assignedPolicyText(entry.device.assignedPolicies)}</span>
          {entry.issues.length === 0 ? <span>Issues: none</span> : entry.issues.map((issue) => (
            <button key={issue.id} type="button" disabled={!props.zammadReady} onClick={() => props.onTicketDraft(buildZammadTicketDraft(entry, issue))}>
              Ticket: {issue.id}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function AccessibleSeparator(): JSX.Element {
  return (
    <>
      <span aria-hidden="true"> · </span>
      <span className="visually-hidden">, </span>
    </>
  );
}

function assignedPolicyText(policies: readonly (string | undefined)[] | undefined): string {
  const assigned = policies?.filter((policy): policy is string => typeof policy === "string" && policy.length > 0) ?? [];
  return assigned.length === 0 ? "none" : assigned.join(", ");
}

function ZammadSection(props: {
  readonly protocol: Protocol;
  readonly host: string;
  readonly port: string;
  readonly token: string;
  readonly group: string;
  readonly customer: string;
  readonly session: ZammadPublicSession;
  readonly loading: boolean;
  readonly draft: ZammadTicketDraft | undefined;
  readonly result: ZammadTicketResult | undefined;
  readonly onProtocol: (value: Protocol) => void;
  readonly onHost: (value: string) => void;
  readonly onPort: (value: string) => void;
  readonly onToken: (value: string) => void;
  readonly onGroup: (value: string) => void;
  readonly onCustomer: (value: string) => void;
  readonly onSubmit: () => void;
  readonly onTest: () => void;
  readonly onCreate: () => void;
}): JSX.Element {
  return (
    <section className="preview-block">
      <h3>Zammad</h3>
      <p className="status recommendation-summary">{props.session.configured ? `Zammad ${props.session.baseUrl ?? "configured"}` : "No Zammad API session configured"}</p>
      <div className="recommendation-controls">
        <label>Protocol<select value={props.protocol} onChange={(event) => props.onProtocol(event.target.value as Protocol)}><option value="https">https</option><option value="http">http</option></select></label>
        <label>Server<input value={props.host} placeholder="zammad.example.org" onChange={(event) => props.onHost(event.target.value)} /></label>
        <label>Port<input value={props.port} inputMode="numeric" placeholder="443" onChange={(event) => props.onPort(event.target.value)} /></label>
        <label>API token<input type="password" value={props.token} autoComplete="off" onChange={(event) => props.onToken(event.target.value)} /></label>
        <label>Group<input value={props.group} onChange={(event) => props.onGroup(event.target.value)} /></label>
        <label>Customer<input value={props.customer} placeholder="it@example.org" onChange={(event) => props.onCustomer(event.target.value)} /></label>
        <button type="button" disabled={props.loading || props.host.trim().length === 0 || props.token.trim().length === 0 || props.group.trim().length === 0 || props.customer.trim().length === 0} onClick={props.onSubmit}>Set Zammad</button>
        <button type="button" disabled={props.loading || !props.session.configured} onClick={props.onTest}>Test Zammad</button>
      </div>
      {props.draft !== undefined ? (
        <details className="preview-block" open>
          <summary>{props.draft.title}</summary>
          <pre>{props.draft.body}</pre>
          <button type="button" disabled={props.loading || !props.session.configured} onClick={props.onCreate}>Create ticket</button>
        </details>
      ) : null}
      {props.result !== undefined ? <p className="ok">Ticket created: {props.result.number ?? props.result.id ?? "unknown"}</p> : null}
    </section>
  );
}

function filterAssessments(entries: RelutionDeviceAssessment[], filter: DeviceFilter, search: string): RelutionDeviceAssessment[] {
  const needle = search.trim().toLowerCase();
  return entries.filter((entry) => {
    const matchesFilter = filter === "all"
      || (filter === "noncompliant" && entry.status === "issue")
      || (filter === "missing-policy" && entry.issues.some((issue) => issue.id === "missing-policy"))
      || (filter === "inactive" && entry.issues.some((issue) => issue.id === "inactive-warning" || issue.id === "inactive-problem"));
    if (!matchesFilter) {
      return false;
    }
    return needle.length === 0 || [entry.device.name, entry.device.uuid, entry.device.userEmail, entry.device.serialNumber]
      .some((value) => value?.toLowerCase().includes(needle) === true);
  });
}

function expectedPoliciesByPlatform(value: string): Record<string, string[]> | undefined {
  const pairs = value.split(";").map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  if (pairs.length === 0) {
    return undefined;
  }
  const result: Record<string, string[]> = {};
  for (const pair of pairs) {
    const [platform, policies] = pair.split("=");
    if (platform === undefined || policies === undefined) {
      throw new Error("Expected policies must use PLATFORM=Policy A,Policy B entries separated by semicolons.");
    }
    const platformKey = platform.trim();
    if (!RELUTION_LIST_VALUE_PATTERN.test(platformKey)) {
      throw new Error(`Invalid expected-policy platform: ${platformKey}`);
    }
    const policyList = policies.split(",").map((policy) => policy.trim()).filter((policy) => policy.length > 0);
    if (policyList.length === 0) {
      throw new Error(`Expected-policy platform ${platformKey} must include at least one policy name.`);
    }
    result[platformKey] = policyList;
  }
  return result;
}

function csvValues(value: string, fieldLabel: string): string[] | undefined {
  const values = value.split(",").map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  const invalid = values.find((entry) => !RELUTION_LIST_VALUE_PATTERN.test(entry));
  if (invalid !== undefined) {
    throw new Error(`Invalid Relution ${fieldLabel}: ${invalid}`);
  }
  return values.length === 0 ? undefined : values;
}

function parseDeviceFilter(value: string): DeviceFilter {
  for (const filter of DEVICE_FILTERS) {
    if (filter === value) {
      return filter;
    }
  }
  throw new Error(`Unsupported device filter: ${value}`);
}
