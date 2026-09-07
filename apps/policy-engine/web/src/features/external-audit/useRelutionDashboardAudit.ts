/** Owns read-only Relution session, audit, and report state transitions. */
import { useState } from "react";
import type {
  RelutionAssessmentReport,
  RelutionDeviceQueryResult,
  RelutionPublicSession,
} from "../../../../src/browser/integrations.js";
import { csvValues, expectedPoliciesByPlatform, optionalPort } from "./relution-dashboard-input.js";
import { connectionTestFailureMessage, requestDashboardJson } from "./relution-dashboard-request.js";
import type { AuditResponse, ConnectionTestResponse, ReportWriteResult } from "./relution-dashboard-types.js";
import { useDashboardConnectionFields } from "./useDashboardConnectionFields.js";
import type { DashboardRequestRunner } from "./useLatestDashboardRequest.js";

const INITIAL_SESSION: RelutionPublicSession = {
  configured: false,
  tokenConfigured: false,
  mode: "read-only",
};

export function useRelutionDashboardAudit(run: DashboardRequestRunner, clearTicketState: () => void) {
  const connection = useDashboardConnectionFields();
  const [platforms, setPlatforms] = useState("IOS,ANDROID_ENTERPRISE,MACOS,WINDOWS");
  const [statuses, setStatuses] = useState("");
  const [expectedPolicies, setExpectedPolicies] = useState("");
  const [session, setSession] = useState<RelutionPublicSession>(INITIAL_SESSION);
  const [devices, setDevices] = useState<RelutionDeviceQueryResult>();
  const [assessment, setAssessment] = useState<RelutionAssessmentReport>();
  const [assessmentId, setAssessmentId] = useState<string>();
  const [reportPath, setReportPath] = useState<ReportWriteResult>();

  function clearAuditState(): void {
    setDevices(undefined);
    setAssessment(undefined);
    setAssessmentId(undefined);
    setReportPath(undefined);
    clearTicketState();
  }

  async function submitSession(): Promise<void> {
    await run("relution-session", async (isCurrent) => {
      const result = await requestDashboardJson<RelutionPublicSession & { error?: string }>("/api/relution/session", {
        protocol: connection.protocol,
        host: connection.host,
        port: optionalPort(connection.port),
        apiToken: connection.token,
      });
      if (isCurrent()) {
        setSession(result);
        connection.setToken("");
        clearAuditState();
      }
    }, ["relution-audit", "relution-report", "zammad-ticket"]);
  }

  async function testConnection(): Promise<void> {
    await run("relution-session", async (isCurrent) => {
      const result = await requestDashboardJson<ConnectionTestResponse>("/api/relution/test", {});
      if (result.ok === false) throw new Error(connectionTestFailureMessage(result));
      if (isCurrent()) setSession(connectedRelutionSession(result));
    });
  }

  async function runAudit(): Promise<void> {
    await run("relution-audit", async (isCurrent) => {
      const result = await requestDashboardJson<AuditResponse & { error?: string }>("/api/relution/devices/audit", {
        limit: 100,
        platforms: csvValues(platforms, "platform"),
        statuses: csvValues(statuses, "status"),
        expectedPoliciesByPlatform: expectedPoliciesByPlatform(expectedPolicies),
      });
      if (isCurrent()) {
        setDevices(result.query);
        setAssessment(result.report);
        setAssessmentId(result.assessmentId);
        setReportPath(undefined);
        clearTicketState();
      }
    }, ["relution-report", "zammad-ticket"]);
  }

  async function writeReport(): Promise<void> {
    await run("relution-report", async (isCurrent) => {
      if (assessmentId === undefined) throw new Error("No server assessment is available");
      const result = await requestDashboardJson<ReportWriteResult & { error?: string }>("/api/relution/reports/compliance", { assessmentId });
      if (isCurrent()) setReportPath(result);
    });
  }

  return {
    protocol: connection.protocol,
    setProtocol: connection.setProtocol,
    host: connection.host,
    setHost: connection.setHost,
    port: connection.port,
    setPort: connection.setPort,
    apiToken: connection.token,
    setApiToken: connection.setToken,
    platforms, setPlatforms, statuses, setStatuses, expectedPolicies, setExpectedPolicies,
    session, devices, assessment, reportPath, submitSession, testConnection, runAudit, writeReport,
  };
}

function connectedRelutionSession(result: ConnectionTestResponse): RelutionPublicSession {
  return result.baseUrl === undefined
    ? { configured: true, tokenConfigured: true, mode: "read-only" }
    : { configured: true, baseUrl: result.baseUrl, tokenConfigured: true, mode: "read-only" };
}
