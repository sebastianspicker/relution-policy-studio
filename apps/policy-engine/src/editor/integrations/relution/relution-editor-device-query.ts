/** Parses bounded Relution device query inputs. */
import { optionalString } from "../../editor-api-request-input.js";
import { badRequest } from "../../editor-http-error.js";
import { optionalNonNegativeInteger } from "../../editor-request-numbers.js";
import { applyRelutionDeviceQueryOptions, MAX_RELUTION_DEVICE_QUERY_LIMIT, optionalRelutionDeviceSortField, unsupportedRelutionDeviceSortFieldMessage } from "../../../integrations/relution/relution-device-query.js";
import type { RelutionDeviceQueryInput, RelutionDeviceSortField } from "../../../contracts/relution-assessment.js";

export function parseRelutionDeviceQuery(body: Record<string, unknown>): RelutionDeviceQueryInput {
  const limit = optionalNonNegativeInteger(body, "limit") ?? 100;
  if (limit > MAX_RELUTION_DEVICE_QUERY_LIMIT) throw badRequest(`Relution device query limit must not exceed ${String(MAX_RELUTION_DEVICE_QUERY_LIMIT)}`);
  const query: RelutionDeviceQueryInput = { limit, offset: optionalNonNegativeInteger(body, "offset") ?? 0 };
  return applyRelutionDeviceQueryOptions(query, {
    platforms: optionalStringArray(body, "platforms"),
    statuses: optionalStringArray(body, "statuses"),
    ownerships: optionalStringArray(body, "ownerships"),
    search: optionalString(body, "search"),
    sortField: optionalSortField(body),
    sortAscending: optionalBoolean(body, "sortAscending"),
  });
}

function optionalStringArray(body: Record<string, unknown>, key: string): string[] | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) throw badRequest(`Expected string array for ${key}`);
  return value;
}

function optionalBoolean(body: Record<string, unknown>, key: string): boolean | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw badRequest(`Expected boolean body field: ${key}`);
  return value;
}

function optionalSortField(body: Record<string, unknown>): RelutionDeviceSortField | undefined {
  return optionalRelutionDeviceSortField(
    optionalString(body, "sortField"),
    (value) => badRequest(unsupportedRelutionDeviceSortFieldMessage(value)),
  );
}
