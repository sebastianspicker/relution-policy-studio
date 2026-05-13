import type { IncomingMessage, ServerResponse } from "node:http";
import { badRequest, optionalRecord, optionalString, readJsonBody, requireNumber, requireString } from "./editor-server-helpers.js";
import { optionalHttpProtocol, optionalPort } from "./editor-routes-utils.js";
import { assertOutboundHostAllowed, outboundHostPolicyError } from "./outbound-host-policy.js";
import {
  assessRelutionDevices,
  auditRelutionDevices,
  normalizeRelutionConnection,
  publicRelutionSession,
  queryRelutionDevices,
  testRelutionConnection,
  type RelutionAssessmentReport,
  type RelutionAssessmentOptions,
  type RelutionConnection,
  type RelutionConnectionInput,
  type RelutionDeviceQueryInput,
  type RelutionDeviceSummary,
  type RelutionDeviceSortField,
} from "./relution-api.js";
import { listRelutionReports, writeRelutionReport } from "./relution-reports.js";

export interface RelutionEditorRuntime {
  connection?: RelutionConnection;
  lastDevices: RelutionDeviceSummary[];
  lastAssessment?: RelutionAssessmentReport;
}

export function createRelutionEditorRuntime(): RelutionEditorRuntime {
  return { lastDevices: [] };
}

export async function handleRelutionApiRequest(
  url: URL,
  request: IncomingMessage,
  response: ServerResponse,
  runtime: RelutionEditorRuntime,
  workspace: string,
  allowLocalServiceHosts = false,
): Promise<boolean> {
  if (!url.pathname.startsWith("/api/relution")) {
    return false;
  }
  if (url.pathname === "/api/relution/session" && request.method === "GET") {
    sendJson(response, 200, publicRelutionSession(runtime.connection));
    return true;
  }
  if (url.pathname === "/api/relution/session" && request.method === "POST") {
    const body = await readJsonBody(request);
    const connectionInput: RelutionConnectionInput = {
      host: requireString(body, "host"),
      apiToken: requireString(body, "apiToken"),
    };
    const protocol = optionalHttpProtocol(body);
    const port = optionalPort(body);
    const basePath = optionalString(body, "basePath");
    if (protocol !== undefined) {
      connectionInput.protocol = protocol;
    }
    if (port !== undefined) {
      connectionInput.port = port;
    }
    if (basePath !== undefined) {
      connectionInput.basePath = basePath;
    }
    const connection = normalizeRelutionConnection(connectionInput);
    const policyError = await outboundHostPolicyError("Relution", connection.host, allowLocalServiceHosts);
    if (policyError !== undefined) {
      throw badRequest(policyError);
    }
    runtime.connection = connection;
    sendJson(response, 200, publicRelutionSession(runtime.connection));
    return true;
  }
  if (url.pathname === "/api/relution/test" && request.method === "POST") {
    sendJson(response, 200, await testRelutionConnection(await requireOutboundConnection(runtime, allowLocalServiceHosts)));
    return true;
  }
  if (url.pathname === "/api/relution/devices/query" && request.method === "POST") {
    const result = await queryRelutionDevices(await requireOutboundConnection(runtime, allowLocalServiceHosts), parseDeviceQuery(await readJsonBody(request)));
    runtime.lastDevices = result.devices;
    sendJson(response, 200, result);
    return true;
  }
  if (url.pathname === "/api/relution/devices/assess" && request.method === "POST") {
    const body = await readJsonBody(request);
    const devices = parseDevices(body) ?? runtime.lastDevices;
    const report = assessRelutionDevices(requireConnection(runtime).baseUrl, devices);
    runtime.lastAssessment = report;
    sendJson(response, 200, { report });
    return true;
  }
  if (url.pathname === "/api/relution/devices/audit" && request.method === "POST") {
    const body = await readJsonBody(request);
    const result = await auditRelutionDevices(await requireOutboundConnection(runtime, allowLocalServiceHosts), parseDeviceQuery(body), parseAssessmentOptions(body));
    runtime.lastDevices = result.query.devices;
    runtime.lastAssessment = result.report;
    sendJson(response, 200, result);
    return true;
  }
  if (url.pathname === "/api/relution/reports/compliance" && request.method === "POST") {
    const body = await readJsonBody(request);
    const report = parseAssessmentReport(body) ?? runtime.lastAssessment;
    if (report === undefined) {
      throw badRequest("No Relution assessment report is available");
    }
    runtime.lastAssessment = report;
    sendJson(response, 200, writeRelutionReport(workspace, report));
    return true;
  }
  if (url.pathname === "/api/relution/reports" && request.method === "GET") {
    sendJson(response, 200, { reports: listRelutionReports(workspace) });
    return true;
  }
  sendJson(response, 404, { error: `Unknown Relution endpoint: ${request.method ?? "GET"} ${url.pathname}` });
  return true;
}

function parseAssessmentOptions(body: Record<string, unknown>): RelutionAssessmentOptions {
  const options: RelutionAssessmentOptions = {};
  const expectedPoliciesByPlatform = optionalExpectedPolicies(body);
  const inactiveWarningDays = optionalPositiveInteger(body, "inactiveWarningDays");
  const inactiveProblemDays = optionalPositiveInteger(body, "inactiveProblemDays");
  if (expectedPoliciesByPlatform !== undefined) {
    options.expectedPoliciesByPlatform = expectedPoliciesByPlatform;
  }
  if (inactiveWarningDays !== undefined) {
    options.inactiveWarningDays = inactiveWarningDays;
  }
  if (inactiveProblemDays !== undefined) {
    options.inactiveProblemDays = inactiveProblemDays;
  }
  return options;
}

function parseDeviceQuery(body: Record<string, unknown>): RelutionDeviceQueryInput {
  const query: RelutionDeviceQueryInput = {
    limit: optionalPositiveInteger(body, "limit") ?? 100,
    offset: optionalPositiveInteger(body, "offset") ?? 0,
  };
  const platforms = optionalStringArray(body, "platforms");
  const statuses = optionalStringArray(body, "statuses");
  const ownerships = optionalStringArray(body, "ownerships");
  const search = optionalString(body, "search");
  const sortField = optionalSortField(body);
  const sortAscending = optionalBoolean(body, "sortAscending");
  if (platforms !== undefined) {
    query.platforms = platforms;
  }
  if (statuses !== undefined) {
    query.statuses = statuses;
  }
  if (ownerships !== undefined) {
    query.ownerships = ownerships;
  }
  if (search !== undefined) {
    query.search = search;
  }
  if (sortField !== undefined) {
    query.sortField = sortField;
  }
  if (sortAscending !== undefined) {
    query.sortAscending = sortAscending;
  }
  return query;
}

function requireConnection(runtime: RelutionEditorRuntime): RelutionConnection {
  if (runtime.connection === undefined) {
    throw badRequest("Relution API session is not configured");
  }
  return runtime.connection;
}

async function requireOutboundConnection(runtime: RelutionEditorRuntime, allowLocalServiceHosts: boolean): Promise<RelutionConnection> {
  const connection = requireConnection(runtime);
  await assertOutboundHostAllowed("Relution", connection.host, allowLocalServiceHosts);
  return connection;
}

function parseDevices(body: Record<string, unknown>): RelutionDeviceSummary[] | undefined {
  const rawDevices = body.devices;
  if (rawDevices === undefined) {
    return undefined;
  }
  if (!Array.isArray(rawDevices)) {
    throw badRequest("Expected devices array");
  }
  return rawDevices.map((entry) => {
    const record = optionalRecord({ entry }, "entry");
    if (record === undefined || typeof record.name !== "string" || typeof record.raw !== "object" || record.raw === null || Array.isArray(record.raw)) {
      throw badRequest("Invalid device summary");
    }
    return record as unknown as RelutionDeviceSummary;
  });
}

function parseAssessmentReport(body: Record<string, unknown>): RelutionAssessmentReport | undefined {
  const report = optionalRecord(body, "report");
  if (report === undefined) {
    return undefined;
  }
  if (typeof report.generatedAt !== "string" || typeof report.baseUrl !== "string" || !Array.isArray(report.devices)) {
    throw badRequest("Invalid Relution assessment report");
  }
  return report as unknown as RelutionAssessmentReport;
}

function optionalPositiveInteger(body: Record<string, unknown>, key: string): number | undefined {
  if (body[key] === undefined) {
    return undefined;
  }
  const value = requireNumber(body, key);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw badRequest(`Expected non-negative integer for ${key}`);
  }
  return value;
}

function optionalStringArray(body: Record<string, unknown>, key: string): string[] | undefined {
  const value = body[key];
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw badRequest(`Expected string array for ${key}`);
  }
  return value;
}

function optionalExpectedPolicies(body: Record<string, unknown>): Record<string, string[]> | undefined {
  const value = body.expectedPoliciesByPlatform;
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw badRequest("Expected expectedPoliciesByPlatform object");
  }
  const result: Record<string, string[]> = {};
  for (const [platform, policies] of Object.entries(value)) {
    if (!Array.isArray(policies) || !policies.every((policy) => typeof policy === "string")) {
      throw badRequest(`Expected string array for expectedPoliciesByPlatform.${platform}`);
    }
    result[platform] = policies;
  }
  return result;
}

function optionalBoolean(body: Record<string, unknown>, key: string): boolean | undefined {
  const value = body[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw badRequest(`Expected boolean body field: ${key}`);
  }
  return value;
}

function optionalSortField(body: Record<string, unknown>): RelutionDeviceSortField | undefined {
  const value = optionalString(body, "sortField");
  if (value === undefined) {
    return undefined;
  }
  if (!["lastConnectionDate", "name", "platform", "status", "policyStatus"].includes(value)) {
    throw badRequest(`Unsupported Relution device sort field: ${value}`);
  }
  return value as RelutionDeviceSortField;
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}
