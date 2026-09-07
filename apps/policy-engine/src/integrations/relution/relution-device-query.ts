// Validates Relution device query options and fetches paginated device summaries.
import type { HttpServiceTransportOptions } from "../../platform/network/http-service-transport.js";
import type {
  RelutionConnection,
  RelutionConnectionTestResult,
  RelutionDeviceQueryInput,
  RelutionDeviceQueryOptions,
  RelutionDeviceQueryResult,
  RelutionDeviceSortField,
} from "./relution-api-types.js";
import { normalizeRelutionDeviceSummary } from "./relution-device-normalization.js";
import { relutionFetch } from "./relution-transport.js";
import { strictResponseJson } from "../../platform/network/strict-response-json.js";
import { asRecord } from "../../platform/serialization/json-guards.js";

const RELUTION_DEVICE_SORT_FIELDS: readonly RelutionDeviceSortField[] = [
  "lastConnectionDate",
  "name",
  "platform",
  "status",
  "policyStatus",
];

export const MAX_RELUTION_DEVICE_QUERY_LIMIT = 1_000;

interface RelutionQueryResponse {
  results: unknown[];
  total?: number;
  nonpagedCount?: number;
}

export function applyRelutionDeviceQueryOptions(
  query: RelutionDeviceQueryInput,
  options: RelutionDeviceQueryOptions,
): RelutionDeviceQueryInput {
  for (const [key, value] of Object.entries(options) as Array<[keyof RelutionDeviceQueryInput, RelutionDeviceQueryInput[keyof RelutionDeviceQueryInput]]>) {
    if (value !== undefined) {
      Object.assign(query, { [key]: value });
    }
  }
  return query;
}

function isRelutionDeviceSortField(value: string): value is RelutionDeviceSortField {
  return RELUTION_DEVICE_SORT_FIELDS.includes(value as RelutionDeviceSortField);
}

export function requireRelutionDeviceSortField(value: string, invalid: Error): RelutionDeviceSortField {
  if (!isRelutionDeviceSortField(value)) throw invalid;
  return value;
}

export function optionalRelutionDeviceSortField(
  value: string | undefined,
  invalid: (value: string) => Error,
): RelutionDeviceSortField | undefined {
  return value === undefined ? undefined : requireRelutionDeviceSortField(value, invalid(value));
}

export function unsupportedRelutionDeviceSortFieldMessage(value: string): string {
  return `Unsupported Relution device sort field: ${value}`;
}

export async function testRelutionConnection(
  connection: RelutionConnection,
  transportOptions: HttpServiceTransportOptions = {},
): Promise<RelutionConnectionTestResult> {
  const response = await relutionFetch(connection, "/api/v2/devices/baseInfo/query", {
    method: "POST",
    body: JSON.stringify(buildDeviceQueryBody({ limit: 1 })),
  }, transportOptions);
  try {
    relutionQueryResponse(await strictResponseJson(response, "Relution connection test"));
  } catch {
    return {
      ok: false,
      baseUrl: connection.baseUrl,
      reason: "Relution connection test returned an unexpected device query response.",
    };
  }
  return { ok: true, baseUrl: connection.baseUrl };
}

export async function queryRelutionDevices(
  connection: RelutionConnection,
  input: RelutionDeviceQueryInput,
  transportOptions: HttpServiceTransportOptions = {},
): Promise<RelutionDeviceQueryResult> {
  const limit = effectiveDeviceQueryLimit(input);
  const response = await relutionFetch(connection, "/api/v2/devices/baseInfo/query", {
    method: "POST",
    body: JSON.stringify(buildDeviceQueryBody(input)),
  }, transportOptions);
  const body = relutionQueryResponse(await strictResponseJson(response, "Relution device query"));
  if (body.results.length > limit) {
    throw new Error("Malformed Relution device query response: returned device count exceeds the requested limit.");
  }
  const devices = body.results.map(normalizeRelutionDeviceSummary);
  const total = relutionResultTotal(body);
  if (total !== undefined && total < devices.length) {
    throw new Error("Malformed Relution device query response: total is smaller than the returned device count.");
  }
  return {
    baseUrl: connection.baseUrl,
    count: devices.length,
    ...(total === undefined ? {} : { total }),
    truncated: total !== undefined && devices.length < total,
    devices,
  };
}

function relutionResultTotal(body: RelutionQueryResponse): number | undefined {
  return typeof body.nonpagedCount === "number" ? body.nonpagedCount : body.total;
}

function relutionQueryResponse(value: unknown): RelutionQueryResponse {
  const body = asRecord(value);
  if (body === undefined || !Array.isArray(body.results)) {
    throw new Error("Malformed Relution device query response: expected results array.");
  }
  if (body.results.some((result) => asRecord(result) === undefined)) {
    throw new Error("Malformed Relution device query response: each result must be an object.");
  }
  const nonpagedCount = optionalDeviceCount(body.nonpagedCount, "nonpagedCount");
  const total = optionalDeviceCount(body.total, "total");
  return {
    results: body.results,
    ...(nonpagedCount === undefined ? {} : { nonpagedCount }),
    ...(total === undefined ? {} : { total }),
  };
}

function optionalDeviceCount(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Malformed Relution device query response: ${field} must be a non-negative safe integer.`);
  }
  return value;
}

function buildDeviceQueryBody(input: RelutionDeviceQueryInput): Record<string, unknown> {
  const limit = effectiveDeviceQueryLimit(input);
  const offset = input.offset ?? 0;
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new Error("Relution device query offset must be a non-negative safe integer");
  }
  const filters = deviceQueryFilters(input);
  return {
    limit,
    offset,
    getNonpagedCount: true,
    sortOrder: { sortFields: [{ name: input.sortField ?? "lastConnectionDate", ascending: input.sortAscending ?? false }] },
    ...(filters.length === 0 ? {} : { filter: { type: "logOp", operation: "AND", filters } }),
  };
}

function effectiveDeviceQueryLimit(input: RelutionDeviceQueryInput): number {
  const limit = input.limit ?? 100;
  if (!Number.isSafeInteger(limit) || limit < 0 || limit > MAX_RELUTION_DEVICE_QUERY_LIMIT) {
    throw new Error(`Relution device query limit must be an integer between 0 and ${String(MAX_RELUTION_DEVICE_QUERY_LIMIT)}`);
  }
  return limit;
}

function deviceQueryFilters(input: RelutionDeviceQueryInput): Array<Record<string, unknown>> {
  return [
    ...stringEnumFilter("platform", input.platforms),
    ...stringEnumFilter("status", input.statuses),
    ...stringEnumFilter("ownership", input.ownerships),
    ...searchFilter(input.search),
  ];
}

function stringEnumFilter(fieldName: string, values: string[] | undefined): Array<Record<string, unknown>> {
  return values === undefined || values.length === 0 ? [] : [{ type: "stringEnum", fieldName, values }];
}

function searchFilter(search: string | undefined): Array<Record<string, unknown>> {
  const value = search?.trim();
  return value === undefined || value.length === 0 ? [] : [{ type: "string", fieldName: "name", value, comparator: "CONTAINS" }];
}
