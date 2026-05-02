import { resolve } from "node:path";
import {
  assessRelutionDevices,
  auditRelutionDevices,
  normalizeRelutionConnection,
  queryRelutionDevices,
  testRelutionConnection,
  type RelutionConnectionInput,
  type RelutionDeviceQueryInput,
  type RelutionDeviceSortField,
  type RelutionProtocol,
} from "./relution-api.js";
import { writeRelutionReport } from "./relution-reports.js";

interface RelutionCliArgs {
  positionals: string[];
  options: Record<string, string | boolean>;
}

export async function runRelutionCliCommand(args: RelutionCliArgs): Promise<void> {
  const action = args.positionals[0];
  if (action === "test") {
    const result = await testRelutionConnection(connectionFromArgs(args));
    printResult(args, result, `Relution API connection OK: ${result.baseUrl}`);
    return;
  }
  if (action === "devices") {
    const result = await queryRelutionDevices(connectionFromArgs(args), queryFromArgs(args));
    printResult(args, result, `Devices: ${String(result.count)}${result.total === undefined ? "" : ` of ${String(result.total)}`}`);
    return;
  }
  if (action === "assess") {
    const connection = connectionFromArgs(args);
    const devices = await queryRelutionDevices(connection, queryFromArgs(args));
    const report = assessRelutionDevices(connection.baseUrl, devices.devices);
    const workspace = optionalString(args, "workspace");
    const output = workspace === undefined ? { report } : { report, files: writeRelutionReport(workspace, report) };
    if (args.options.json === true) {
      printJson(output);
      return;
    }
    console.log(`Devices: ${String(report.summary.totalDevices)}`);
    console.log(`Compliant: ${String(report.summary.compliant)}`);
    console.log(`Issues: ${String(report.summary.issue)}`);
    console.log(`Not checkable: ${String(report.summary.notCheckable)}`);
    if (workspace !== undefined && "files" in output) {
      console.log(`Report JSON: ${resolve(output.files.jsonPath)}`);
      console.log(`Report Markdown: ${resolve(output.files.markdownPath)}`);
    }
    return;
  }
  if (action === "audit") {
    const connection = connectionFromArgs(args);
    const auditOptions: Parameters<typeof auditRelutionDevices>[2] = {};
    const expectedPoliciesByPlatform = expectedPoliciesFromArgs(args);
    const inactiveWarningDays = optionalInteger(args, "inactive-warning-days");
    const inactiveProblemDays = optionalInteger(args, "inactive-problem-days");
    if (expectedPoliciesByPlatform !== undefined) {
      auditOptions.expectedPoliciesByPlatform = expectedPoliciesByPlatform;
    }
    if (inactiveWarningDays !== undefined) {
      auditOptions.inactiveWarningDays = inactiveWarningDays;
    }
    if (inactiveProblemDays !== undefined) {
      auditOptions.inactiveProblemDays = inactiveProblemDays;
    }
    const output = await auditRelutionDevices(connection, queryFromArgs(args), auditOptions);
    const workspace = optionalString(args, "workspace");
    const files = workspace === undefined ? undefined : writeRelutionReport(workspace, output.report);
    if (args.options.json === true) {
      printJson(files === undefined ? output : { ...output, files });
      return;
    }
    console.log(`Devices: ${String(output.report.summary.totalDevices)}`);
    console.log(`Issues: ${String(output.report.summary.issue)}`);
    console.log(`Missing policy: ${String(output.report.summary.missingPolicy)}`);
    console.log(`Inactive 30+: ${String(output.report.summary.inactiveWarning)}`);
    console.log(`Inactive 90+: ${String(output.report.summary.inactiveProblem)}`);
    if (files !== undefined) {
      console.log(`Report JSON: ${resolve(files.jsonPath)}`);
      console.log(`Report Markdown: ${resolve(files.markdownPath)}`);
    }
    return;
  }
  throw new Error("relution requires an action: test, devices, assess, or audit");
}

function connectionFromArgs(args: RelutionCliArgs): ReturnType<typeof normalizeRelutionConnection> {
  const input: RelutionConnectionInput = {
    host: requireString(args, "host", "Missing --host <relution-host> or RELUTION_BASE_URL"),
    apiToken: requireString(args, "token", "Missing --token <api-token> or RELUTION_ACCESS_TOKEN"),
  };
  const protocol = optionalProtocol(args);
  const port = optionalInteger(args, "port");
  const basePath = optionalString(args, "base-path");
  if (protocol !== undefined) {
    input.protocol = protocol;
  }
  if (port !== undefined) {
    input.port = port;
  }
  if (basePath !== undefined) {
    input.basePath = basePath;
  }
  return normalizeRelutionConnection(input);
}

function queryFromArgs(args: RelutionCliArgs): RelutionDeviceQueryInput {
  const query: RelutionDeviceQueryInput = {};
  assignNumber(query, "limit", optionalInteger(args, "limit"));
  assignNumber(query, "offset", optionalInteger(args, "offset"));
  assignStrings(query, "platforms", optionalCsv(args, "platform"));
  assignStrings(query, "statuses", optionalCsv(args, "status"));
  assignStrings(query, "ownerships", optionalCsv(args, "ownership"));
  const search = optionalString(args, "search");
  const sortField = optionalSortField(args);
  const sortAscending = optionalBoolean(args, "sort-ascending");
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

function assignNumber(target: RelutionDeviceQueryInput, key: "limit" | "offset", value: number | undefined): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

function assignStrings(
  target: RelutionDeviceQueryInput,
  key: "platforms" | "statuses" | "ownerships",
  value: string[] | undefined,
): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

function optionalProtocol(args: RelutionCliArgs): RelutionProtocol | undefined {
  const protocol = optionalString(args, "protocol");
  if (protocol === undefined) {
    return undefined;
  }
  if (protocol !== "http" && protocol !== "https") {
    throw new Error(`Unsupported protocol: ${protocol}`);
  }
  return protocol;
}

function optionalSortField(args: RelutionCliArgs): RelutionDeviceSortField | undefined {
  const field = optionalString(args, "sort-field");
  if (field === undefined) {
    return undefined;
  }
  if (!["lastConnectionDate", "name", "platform", "status", "policyStatus"].includes(field)) {
    throw new Error(`Unsupported Relution device sort field: ${field}`);
  }
  return field as RelutionDeviceSortField;
}

function optionalCsv(args: RelutionCliArgs, name: string): string[] | undefined {
  const value = optionalString(args, name);
  if (value === undefined) {
    return undefined;
  }
  const entries = value.split(",").map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  return entries.length === 0 ? undefined : entries;
}

function expectedPoliciesFromArgs(args: RelutionCliArgs): Record<string, string[]> | undefined {
  const values = optionalCsv(args, "expected-policy");
  if (values === undefined) {
    return undefined;
  }
  const result: Record<string, string[]> = {};
  for (const value of values) {
    const [platform, policy] = value.split("=");
    if (platform === undefined || policy === undefined || platform.trim().length === 0 || policy.trim().length === 0) {
      throw new Error("Expected --expected-policy entries as Platform=Policy Name");
    }
    result[platform.trim()] = [...(result[platform.trim()] ?? []), policy.trim()];
  }
  return result;
}

function optionalBoolean(args: RelutionCliArgs, name: string): boolean | undefined {
  const value = args.options[name];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  throw new Error(`Expected boolean for --${name}`);
}

function requireString(args: RelutionCliArgs, name: string, message: string): string {
  const value = optionalString(args, name) ?? envFallback(name);
  if (value === undefined || value.length === 0) {
    throw new Error(message);
  }
  return value;
}

function optionalString(args: RelutionCliArgs, name: string): string | undefined {
  const value = args.options[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function optionalInteger(args: RelutionCliArgs, name: string): number | undefined {
  const value = optionalString(args, name);
  if (value === undefined) {
    return undefined;
  }
  if (!/^\d+$/u.test(value)) {
    throw new Error(`Expected non-negative integer for --${name}`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`Expected safe integer for --${name}`);
  }
  return parsed;
}

function envFallback(name: string): string | undefined {
  if (name === "host") {
    return process.env.RELUTION_BASE_URL;
  }
  if (name === "token") {
    return process.env.RELUTION_ACCESS_TOKEN;
  }
  return undefined;
}

function printResult(args: RelutionCliArgs, value: unknown, text: string): void {
  if (args.options.json === true) {
    printJson(value);
    return;
  }
  console.log(text);
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}
