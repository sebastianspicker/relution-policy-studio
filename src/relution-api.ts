export type RelutionProtocol = "http" | "https";

export interface RelutionConnectionInput {
  protocol?: RelutionProtocol;
  host: string;
  port?: number;
  basePath?: string;
  apiToken: string;
}

export interface RelutionConnection {
  protocol: RelutionProtocol;
  host: string;
  port?: number;
  basePath: string;
  apiToken: string;
  baseUrl: string;
  mode: "read-only";
}

export interface RelutionPublicSession {
  configured: boolean;
  baseUrl?: string;
  tokenConfigured: boolean;
  mode: "read-only";
}

export interface RelutionDeviceQueryInput {
  limit?: number;
  offset?: number;
  platforms?: string[];
  statuses?: string[];
  ownerships?: string[];
  search?: string;
  sortField?: RelutionDeviceSortField;
  sortAscending?: boolean;
}

export type RelutionDeviceSortField = "lastConnectionDate" | "name" | "platform" | "status" | "policyStatus";

export interface RelutionDeviceQueryResult {
  baseUrl: string;
  count: number;
  total?: number;
  devices: RelutionDeviceSummary[];
}

export interface RelutionDeviceSummary {
  uuid?: string;
  name: string;
  platform?: string;
  status?: string;
  policyStatus?: string;
  lastConnectionDate?: string;
  inactiveDays?: number;
  ownership?: string;
  serialNumber?: string;
  userName?: string;
  userEmail?: string;
  assignedPolicies?: string[];
  raw: Record<string, unknown>;
}

export type RelutionAssessmentIssueId =
  | "device-status-missing"
  | "device-status-noncompliant"
  | "policy-status-missing"
  | "policy-status-not-applied"
  | "missing-policy"
  | "policy-assignment-unknown"
  | "inactive-warning"
  | "inactive-problem";

export interface RelutionAssessmentIssue {
  id: RelutionAssessmentIssueId;
  severity: "warning" | "problem" | "unknown";
  message: string;
  evidence: Record<string, string>;
}

export interface RelutionDeviceAssessment {
  device: RelutionDeviceSummary;
  status: "compliant" | "issue" | "not-checkable";
  issues: RelutionAssessmentIssue[];
}

export interface RelutionAssessmentReport {
  generatedAt: string;
  baseUrl: string;
  summary: {
    totalDevices: number;
    compliant: number;
    issue: number;
    notCheckable: number;
    missingPolicy: number;
    inactiveWarning: number;
    inactiveProblem: number;
    byPlatform: Record<string, number>;
    byStatus: Record<string, number>;
    byPolicyStatus: Record<string, number>;
  };
  devices: RelutionDeviceAssessment[];
}

export interface RelutionAssessmentOptions {
  expectedPoliciesByPlatform?: Record<string, string[]>;
  inactiveWarningDays?: number;
  inactiveProblemDays?: number;
  now?: Date;
}

interface RelutionQueryResponse {
  results?: unknown[];
  total?: number;
  nonpagedCount?: number;
}

export function normalizeRelutionConnection(input: RelutionConnectionInput): RelutionConnection {
  const parsed = parseHostInput(input.host);
  const protocol = input.protocol ?? parsed.protocol ?? "https";
  if (protocol !== "http" && protocol !== "https") {
    throw new Error(`Unsupported Relution protocol: ${String(protocol)}`);
  }
  const host = parsed.host;
  if (host.length === 0) {
    throw new Error("Relution host is required");
  }
  const apiToken = input.apiToken.trim();
  if (apiToken.length === 0) {
    throw new Error("Relution API token is required");
  }
  const basePath = normalizeBasePath(input.basePath ?? parsed.basePath ?? "");
  const port = input.port ?? parsed.port;
  if (port !== undefined && (!Number.isSafeInteger(port) || port < 1 || port > 65535)) {
    throw new Error(`Invalid Relution port: ${String(port)}`);
  }
  const authority = port === undefined ? host : `${host}:${String(port)}`;
  return {
    protocol,
    host,
    ...(port === undefined ? {} : { port }),
    basePath,
    apiToken,
    baseUrl: `${protocol}://${authority}${basePath}`,
    mode: "read-only",
  };
}

export function publicRelutionSession(connection: RelutionConnection | undefined): RelutionPublicSession {
  if (connection === undefined) {
    return { configured: false, tokenConfigured: false, mode: "read-only" };
  }
  return { configured: true, baseUrl: connection.baseUrl, tokenConfigured: connection.apiToken.length > 0, mode: "read-only" };
}

export async function testRelutionConnection(connection: RelutionConnection): Promise<{ ok: true; baseUrl: string }> {
  await relutionFetch(connection, "/api/v2/devices/baseInfo/query", {
    method: "POST",
    body: JSON.stringify(buildDeviceQueryBody({ limit: 1 })),
  });
  return { ok: true, baseUrl: connection.baseUrl };
}

export async function queryRelutionDevices(
  connection: RelutionConnection,
  input: RelutionDeviceQueryInput,
): Promise<RelutionDeviceQueryResult> {
  const response = await relutionFetch(connection, "/api/v2/devices/baseInfo/query", {
    method: "POST",
    body: JSON.stringify(buildDeviceQueryBody(input)),
  });
  const body = await response.json() as RelutionQueryResponse;
  const devices = (Array.isArray(body.results) ? body.results : []).map(normalizeDevice);
  return {
    baseUrl: connection.baseUrl,
    count: devices.length,
    ...(typeof body.nonpagedCount === "number" ? { total: body.nonpagedCount } : {}),
    ...(typeof body.total === "number" ? { total: body.total } : {}),
    devices,
  };
}

export function assessRelutionDevices(baseUrl: string, devices: RelutionDeviceSummary[]): RelutionAssessmentReport {
  return createRelutionAssessmentReport(baseUrl, devices, {});
}

export async function auditRelutionDevices(
  connection: RelutionConnection,
  query: RelutionDeviceQueryInput,
  options: RelutionAssessmentOptions = {},
): Promise<{ query: RelutionDeviceQueryResult; report: RelutionAssessmentReport }> {
  const result = await queryRelutionDevices(connection, query);
  return { query: result, report: createRelutionAssessmentReport(connection.baseUrl, result.devices, options) };
}

export function createRelutionAssessmentReport(
  baseUrl: string,
  devices: RelutionDeviceSummary[],
  options: RelutionAssessmentOptions = {},
): RelutionAssessmentReport {
  const assessments = devices.map((device) => assessDevice(device, normalizeAssessmentOptions(options)));
  const summary = {
    totalDevices: assessments.length,
    compliant: assessments.filter((entry) => entry.status === "compliant").length,
    issue: assessments.filter((entry) => entry.status === "issue").length,
    notCheckable: assessments.filter((entry) => entry.status === "not-checkable").length,
    missingPolicy: assessments.filter((entry) => entry.issues.some((issue) => issue.id === "missing-policy")).length,
    inactiveWarning: assessments.filter((entry) => entry.issues.some((issue) => issue.id === "inactive-warning")).length,
    inactiveProblem: assessments.filter((entry) => entry.issues.some((issue) => issue.id === "inactive-problem")).length,
    byPlatform: countBy(devices.map((device) => device.platform ?? "UNKNOWN")),
    byStatus: countBy(devices.map((device) => device.status ?? "UNKNOWN")),
    byPolicyStatus: countBy(devices.map((device) => device.policyStatus ?? "UNKNOWN")),
  };
  return { generatedAt: new Date().toISOString(), baseUrl, summary, devices: assessments };
}

function buildDeviceQueryBody(input: RelutionDeviceQueryInput): Record<string, unknown> {
  const filters: Array<Record<string, unknown>> = [];
  if (input.platforms !== undefined && input.platforms.length > 0) {
    filters.push({ type: "stringEnum", fieldName: "platform", values: input.platforms });
  }
  if (input.statuses !== undefined && input.statuses.length > 0) {
    filters.push({ type: "stringEnum", fieldName: "status", values: input.statuses });
  }
  if (input.ownerships !== undefined && input.ownerships.length > 0) {
    filters.push({ type: "stringEnum", fieldName: "ownership", values: input.ownerships });
  }
  if (input.search !== undefined && input.search.trim().length > 0) {
    filters.push({ type: "string", fieldName: "name", value: input.search.trim(), comparator: "CONTAINS" });
  }
  return {
    limit: input.limit ?? 100,
    offset: input.offset ?? 0,
    getNonpagedCount: true,
    sortOrder: { sortFields: [{ name: input.sortField ?? "lastConnectionDate", ascending: input.sortAscending ?? false }] },
    ...(filters.length === 0 ? {} : { filter: { type: "logOp", operation: "AND", filters } }),
  };
}

async function relutionFetch(connection: RelutionConnection, path: string, init: RequestInit): Promise<Response> {
  assertRelutionReadOnlyRequest(init.method, path);
  const response = await fetch(`${connection.baseUrl}${path}`, {
    ...init,
    headers: {
      "accept": "application/json",
      "accept-charset": "UTF-8",
      "content-type": "application/json",
      "X-User-Access-Token": connection.apiToken,
      ...init.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`Relution API request failed: ${String(response.status)} ${response.statusText}`);
  }
  return response;
}

export function assertRelutionReadOnlyRequest(method: string | undefined, path: string): void {
  const normalizedMethod = (method ?? "GET").toUpperCase();
  // Relution exposes device search as POST, but this endpoint only reads base
  // device information. Do not add mutating endpoints here for production use.
  if (normalizedMethod === "POST" && path === "/api/v2/devices/baseInfo/query") {
    return;
  }
  throw new Error(`Blocked non-read-only Relution API request: ${normalizedMethod} ${path}`);
}

function normalizeDevice(value: unknown): RelutionDeviceSummary {
  const raw = asRecord(value) ?? {};
  const uuid = firstString(raw, ["uuid", "id"]);
  const platform = firstString(raw, ["platform", "osPlatform"]);
  const status = firstString(raw, ["status", "complianceStatus"]);
  const policyStatus = firstString(raw, ["policyStatus", "policyState"]);
  const lastConnectionDate = firstString(raw, ["lastConnectionDate", "lastSeen", "lastContact"]);
  const ownership = firstString(raw, ["ownership", "ownerShip"]);
  const serialNumber = firstString(raw, ["serialNumber", "serial", "imei", "udid"]);
  const userName = firstString(raw, ["userName", "username", "ownerName"]);
  const userEmail = firstString(raw, ["userEmail", "email", "ownerEmail"]);
  const assignedPolicies = assignedPolicyNames(raw);
  const name = firstString(raw, ["name", "deviceName", "displayName"]) ?? firstString(raw, ["uuid", "id"]) ?? "Unnamed device";
  return {
    ...(uuid === undefined ? {} : { uuid }),
    name,
    ...(platform === undefined ? {} : { platform }),
    ...(status === undefined ? {} : { status }),
    ...(policyStatus === undefined ? {} : { policyStatus }),
    ...(lastConnectionDate === undefined ? {} : { lastConnectionDate }),
    ...(ownership === undefined ? {} : { ownership }),
    ...(serialNumber === undefined ? {} : { serialNumber }),
    ...(userName === undefined ? {} : { userName }),
    ...(userEmail === undefined ? {} : { userEmail }),
    ...(assignedPolicies === undefined ? {} : { assignedPolicies }),
    raw,
  };
}

function assessDevice(device: RelutionDeviceSummary, options: Required<RelutionAssessmentOptions>): RelutionDeviceAssessment {
  const issues: RelutionAssessmentIssue[] = [];
  const inactiveDays = inactiveDaysSince(device.lastConnectionDate, options.now);
  const assessedDevice = inactiveDays === undefined ? device : { ...device, inactiveDays };
  if (device.status === undefined) {
    issues.push({
      id: "device-status-missing",
      severity: "unknown",
      message: "Device compliance status is not exposed by the query response.",
      evidence: {},
    });
  } else if (device.status !== "COMPLIANT") {
    issues.push({
      id: "device-status-noncompliant",
      severity: "problem",
      message: `Device status is ${device.status}.`,
      evidence: { status: device.status },
    });
  }
  if (device.policyStatus === undefined) {
    issues.push({
      id: "policy-status-missing",
      severity: "unknown",
      message: "Device policy status is not exposed by the query response.",
      evidence: {},
    });
  } else if (!["APPLIED", "UPDATE"].includes(device.policyStatus)) {
    issues.push({
      id: "policy-status-not-applied",
      severity: device.policyStatus === "NONE" || device.policyStatus === "UNKNOWN" ? "problem" : "warning",
      message: `Policy status is ${device.policyStatus}.`,
      evidence: { policyStatus: device.policyStatus },
    });
  }
  addMissingPolicyIssues(issues, device, options.expectedPoliciesByPlatform);
  addInactiveIssues(issues, inactiveDays, options);
  return {
    device: assessedDevice,
    status: issues.length === 0 ? "compliant" : issues.some((issue) => issue.severity === "problem") ? "issue" : "not-checkable",
    issues,
  };
}

function addMissingPolicyIssues(
  issues: RelutionAssessmentIssue[],
  device: RelutionDeviceSummary,
  expectedPoliciesByPlatform: Record<string, string[]>,
): void {
  const expected = device.platform === undefined ? [] : expectedPoliciesByPlatform[device.platform] ?? [];
  if (expected.length === 0) {
    return;
  }
  if (device.assignedPolicies === undefined) {
    issues.push({
      id: "policy-assignment-unknown",
      severity: "unknown",
      message: `Expected policies for ${device.platform} cannot be checked because assigned policies are not exposed by the query response.`,
      evidence: { expectedPolicies: expected.join(", ") },
    });
    return;
  }
  const assigned = new Set(device.assignedPolicies.map((policy) => policy.toLowerCase()));
  const missing = expected.filter((policy) => !assigned.has(policy.toLowerCase()));
  if (missing.length > 0) {
    issues.push({
      id: "missing-policy",
      severity: "problem",
      message: `Missing expected policies: ${missing.join(", ")}.`,
      evidence: { expectedPolicies: expected.join(", "), assignedPolicies: device.assignedPolicies.join(", "), missingPolicies: missing.join(", ") },
    });
  }
}

function addInactiveIssues(
  issues: RelutionAssessmentIssue[],
  inactiveDays: number | undefined,
  options: Required<RelutionAssessmentOptions>,
): void {
  if (inactiveDays === undefined || inactiveDays < options.inactiveWarningDays) {
    return;
  }
  if (inactiveDays >= options.inactiveProblemDays) {
    issues.push({
      id: "inactive-problem",
      severity: "problem",
      message: `Device has not checked in for ${String(inactiveDays)} days.`,
      evidence: { inactiveDays: String(inactiveDays), thresholdDays: String(options.inactiveProblemDays) },
    });
    return;
  }
  issues.push({
    id: "inactive-warning",
    severity: "warning",
    message: `Device has not checked in for ${String(inactiveDays)} days.`,
    evidence: { inactiveDays: String(inactiveDays), thresholdDays: String(options.inactiveWarningDays) },
  });
}

function normalizeAssessmentOptions(options: RelutionAssessmentOptions): Required<RelutionAssessmentOptions> {
  return {
    expectedPoliciesByPlatform: options.expectedPoliciesByPlatform ?? {},
    inactiveWarningDays: options.inactiveWarningDays ?? 30,
    inactiveProblemDays: options.inactiveProblemDays ?? 90,
    now: options.now ?? new Date(),
  };
}

function inactiveDaysSince(value: string | undefined, now: Date): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return undefined;
  }
  return Math.max(0, Math.floor((now.getTime() - timestamp) / 86_400_000));
}

function firstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function assignedPolicyNames(record: Record<string, unknown>): string[] | undefined {
  for (const key of ["assignedPolicies", "policies", "policyNames", "appliedPolicies"]) {
    const value = record[key];
    const names = stringList(value);
    if (names !== undefined) {
      return names;
    }
  }
  return undefined;
}

function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const names = value.flatMap((entry) => {
    if (typeof entry === "string" && entry.length > 0) {
      return [entry];
    }
    const record = asRecord(entry);
    const name = record === undefined ? undefined : firstString(record, ["name", "policyName", "title", "displayName", "uuid", "id"]);
    return name === undefined ? [] : [name];
  });
  return names.length === 0 ? [] : names;
}

function normalizeBasePath(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed === "/") {
    return "";
  }
  return `/${trimmed.replace(/^\/+|\/+$/gu, "")}`;
}

function parseHostInput(value: string): { protocol?: RelutionProtocol; host: string; port?: number; basePath?: string } {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { host: "" };
  }
  const urlText = /^https?:\/\//iu.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(urlText);
    const protocol = parsed.protocol === "http:" ? "http" : parsed.protocol === "https:" ? "https" : undefined;
    const port = parsed.port.length === 0 ? undefined : Number(parsed.port);
    const basePath = parsed.pathname === "/" ? undefined : parsed.pathname;
    return {
      ...(protocol === undefined || !/^https?:\/\//iu.test(trimmed) ? {} : { protocol }),
      host: parsed.hostname,
      ...(port === undefined ? {} : { port }),
      ...(basePath === undefined ? {} : { basePath }),
    };
  } catch {
    return { host: trimmed.replace(/^https?:\/\//iu, "").replace(/\/.*$/u, "") };
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
