import type { RelutionDeviceQueryResult, RelutionDeviceSummary } from "./relution-api.js";

export function buildRelutionDeviceQueryResult(
  baseUrl: string,
  devices: RelutionDeviceSummary[],
  total: number | undefined,
): RelutionDeviceQueryResult {
  const result: RelutionDeviceQueryResult = {
    baseUrl,
    count: devices.length,
    truncated: total !== undefined && devices.length < total,
    devices,
  };
  if (total !== undefined) {
    result.total = total;
  }
  return result;
}
