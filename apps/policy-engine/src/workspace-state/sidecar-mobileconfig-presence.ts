/** Detects configurations already present before sidecar reconciliation. */
import type { JsonRecord } from "../platform/serialization/json-guards.js";
import type { MobileConfigRestoreEntry } from "./sidecar-types.js";

export function workspaceHasMobileConfig(policy: JsonRecord, entry: MobileConfigRestoreEntry): boolean {
  const serialized = entry.configurationUuid.length === 0 ? JSON.stringify(entry.configuration) : undefined;
  const versions = Array.isArray(policy.versions) ? policy.versions : [];
  return versions.some((version) => hasConfiguration(version, entry.configurationUuid, serialized));
}

function hasConfiguration(version: unknown, uuid: string, serialized: string | undefined): boolean {
  const configurations = isRecord(version) && Array.isArray(version.configurations) ? version.configurations : [];
  return configurations.some((configuration) => matchesConfiguration(configuration, uuid, serialized));
}

function matchesConfiguration(configuration: unknown, uuid: string, serialized: string | undefined): boolean {
  const record = isRecord(configuration) ? configuration : undefined;
  return uuid.length > 0 ? record?.uuid === uuid : serialized !== undefined && JSON.stringify(record ?? {}) === serialized;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
