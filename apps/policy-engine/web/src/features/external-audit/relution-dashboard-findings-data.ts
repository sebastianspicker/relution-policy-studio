import type { RelutionDeviceAssessment } from "../../../../src/browser/integrations.js";
import type { DeviceFilter } from "./relution-dashboard-types.js";

const DEVICE_FILTERS = ["all", "noncompliant", "missing-policy", "inactive"] as const satisfies readonly DeviceFilter[];

export function deviceKey(entry: RelutionDeviceAssessment): string {
  return entry.device.uuid ?? `${entry.device.name}:${entry.device.serialNumber ?? ""}`;
}

export function parseDeviceFilter(value: string): DeviceFilter {
  for (const filter of DEVICE_FILTERS) {
    if (filter === value) return filter;
  }
  throw new Error(`Unsupported device filter: ${value}`);
}

export function filterAssessments(
  entries: RelutionDeviceAssessment[],
  filter: DeviceFilter,
  search: string,
): RelutionDeviceAssessment[] {
  const needle = search.trim().toLowerCase();
  return entries.filter((entry) => matchesFilter(entry, filter) && matchesSearch(entry, needle));
}

function matchesFilter(entry: RelutionDeviceAssessment, filter: DeviceFilter): boolean {
  if (filter === "all") return true;
  if (filter === "noncompliant") return entry.status === "issue";
  if (filter === "missing-policy") return entry.issues.some((issue) => issue.id === "missing-policy");
  return entry.issues.some((issue) => issue.id === "inactive-warning" || issue.id === "inactive-problem");
}

function matchesSearch(entry: RelutionDeviceAssessment, needle: string): boolean {
  if (needle.length === 0) return true;
  return [
    entry.device.name,
    entry.device.uuid,
    entry.device.userEmail,
    entry.device.serialNumber,
  ].some((value) => value?.toLowerCase().includes(needle) === true);
}
