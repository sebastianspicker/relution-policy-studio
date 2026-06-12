import type { IncomingMessage, ServerResponse } from "node:http";
import { HttpError, assignOptionalHttpConnectionFields, badRequest, optionalRecord, optionalString, readJsonBody, requireNumber, requireString } from "./editor-server-helpers.js";
import { requireRuntimeConnection, sendJson } from "./editor-routes-utils.js";
import { assertOutboundHostAllowed, outboundHostPolicyError } from "./outbound-host-policy.js";
import {
  applyRelutionDeviceQueryOptions,
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

type RelutionRouteHandler = (
  url: URL,
  request: IncomingMessage,
  response: ServerResponse,
  runtime: RelutionEditorRuntime,
  workspace: string,
  allowLocalServiceHosts: boolean,
) => boolean | Promise<boolean>;

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
  for (const handler of RELUTION_ROUTE_HANDLERS) {
    if (await handler(url, request, response, runtime, workspace, allowLocalServiceHosts)) return true;
  }
  sendJson(response, 404, { error: `Unknown Relution endpoint: ${request.method ?? "GET"} ${url.pathname}` });
  return true;
}

async function handleRelutionSessionRoute(
  url: URL,
  request: IncomingMessage,
  response: ServerResponse,
  runtime: RelutionEditorRuntime,
  _workspace: string,
  allowLocalServiceHosts: boolean,
): Promise<boolean> {
  if (url.pathname === "/api/relution/session" && request.method === "GET") {
    sendJson(response, 200, publicRelutionSession(runtime.connection));
    return true;
  }
  if (url.pathname === "/api/relution/session" && request.method === "POST") {
    runtime.connection = await parseAllowedRelutionConnection(await readJsonBody(request), allowLocalServiceHosts);
    sendJson(response, 200, publicRelutionSession(runtime.connection));
    return true;
  }
  if (url.pathname === "/api/relution/test" && request.method === "POST") {
    sendJson(response, 200, await testRelutionConnection(await requireOutboundConnection(runtime, allowLocalServiceHosts)));
    return true;
  }
  return false;
}

async function handleRelutionDeviceRoute(
  url: URL,
  request: IncomingMessage,
  response: ServerResponse,
  runtime: RelutionEditorRuntime,
  _workspace: string,
  allowLocalServiceHosts: boolean,
): Promise<boolean> {
  if (url.pathname === "/api/relution/devices/query" && request.method === "POST") {
    const result = await queryRelutionDevices(await requireOutboundConnection(runtime, allowLocalServiceHosts), parseDeviceQuery(await readJsonBody(request)));
    runtime.lastDevices = result.devices;
    sendJson(response, 200, result);
    return true;
  }
  if (url.pathname === "/api/relution/devices/assess" && request.method === "POST") {
    const body = await readJsonBody(request);
    const devices = parseDevices(body) ?? runtime.lastDevices;
    const report = assessRelutionDevices(requireRuntimeConnection(runtime, "Relution").baseUrl, devices);
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
  return false;
}

async function handleRelutionReportRoute(
  url: URL,
  request: IncomingMessage,
  response: ServerResponse,
  runtime: RelutionEditorRuntime,
  workspace: string,
): Promise<boolean> {
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
  return false;
}

const RELUTION_ROUTE_HANDLERS: readonly RelutionRouteHandler[] = [
  handleRelutionSessionRoute,
  handleRelutionDeviceRoute,
  handleRelutionReportRoute,
];

async function parseAllowedRelutionConnection(body: Record<string, unknown>, allowLocalServiceHosts: boolean): Promise<RelutionConnection> {
  const connection = normalizeRelutionConnection(parseRelutionConnectionInput(body));
  const policyError = await outboundHostPolicyError("Relution", connection.host, allowLocalServiceHosts);
  if (policyError === undefined) {
    return connection;
  }
  if (policyError.kind === "blocked") {
    console.warn(`[relution outbound host blocked] ${policyError.reason}`);
    throw badRequest(policyError.reason);
  }
  console.warn(`[relution outbound host dns-failure] ${policyError.error}`);
  throw new HttpError(502, policyError.error);
}

function parseRelutionConnectionInput(body: Record<string, unknown>): RelutionConnectionInput {
  const input: RelutionConnectionInput = {
    host: requireString(body, "host"),
    apiToken: requireString(body, "apiToken"),
  };
  assignOptionalHttpConnectionFields(input, body);
  return input;
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
  return applyRelutionDeviceQueryOptions(query, { platforms, statuses, ownerships, search, sortField, sortAscending });
}

async function requireOutboundConnection(runtime: RelutionEditorRuntime, allowLocalServiceHosts: boolean): Promise<RelutionConnection> {
  const connection = requireRuntimeConnection(runtime, "Relution");
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
