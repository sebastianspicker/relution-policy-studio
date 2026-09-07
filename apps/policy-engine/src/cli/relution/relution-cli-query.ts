/** Builds Relution inventory and audit query options from CLI arguments. */
import { applyRelutionDeviceQueryOptions, requireRelutionDeviceSortField, unsupportedRelutionDeviceSortFieldMessage } from "../../integrations/relution/relution-device-query.js";
import type { RelutionDeviceQueryInput } from "../../integrations/relution/relution-api-types.js";
import { optionalBoolean, optionalCsv, optionalInteger, optionalString, type RelutionCliArgs } from "./relution-cli-options.js";

export function queryFromArgs(args: RelutionCliArgs): RelutionDeviceQueryInput {
  const requestedSortField = optionalString(args, "sort-field");
  const query: RelutionDeviceQueryInput = {};
  return applyRelutionDeviceQueryOptions(query, {
    limit: optionalInteger(args, "limit"),
    offset: optionalInteger(args, "offset"),
    platforms: optionalCsv(args, "platform"),
    statuses: optionalCsv(args, "status"),
    ownerships: optionalCsv(args, "ownership"),
    search: optionalString(args, "search"),
    sortField: requestedSortField === undefined
      ? undefined
      : requireRelutionDeviceSortField(
        requestedSortField,
        new Error(unsupportedRelutionDeviceSortFieldMessage(requestedSortField)),
      ),
    sortAscending: optionalBoolean(args, "sort-ascending"),
  });
}

export function expectedPoliciesFromArgs(args: RelutionCliArgs): Record<string, string[]> | undefined {
  const values = optionalCsv(args, "expected-policy");
  if (values === undefined) return undefined;
  const result = Object.create(null) as Record<string, string[]>;
  for (const value of values) {
    const separator = value.indexOf("=");
    const platform = separator < 0 ? "" : value.slice(0, separator).trim();
    const policy = separator < 0 ? "" : value.slice(separator + 1).trim();
    if (platform.length === 0 || policy.length === 0) {
      throw new Error("Expected --expected-policy entries as Platform=Policy Name");
    }
    const existing = Object.hasOwn(result, platform) ? result[platform] : undefined;
    result[platform] = [...(existing ?? []), policy];
  }
  return result;
}
