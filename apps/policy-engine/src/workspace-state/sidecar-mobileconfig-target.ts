/** Selects a sidecar restoration destination only when identifiers are unique. */
import type { PolicyWorkspace } from "../workspace/types.js";
import type { JsonRecord } from "../platform/serialization/json-guards.js";
import type { MobileConfigRestoreEntry } from "./sidecar-types.js";

export function findMobileConfigTargetPolicy(workspace: PolicyWorkspace, entry: MobileConfigRestoreEntry): PolicyWorkspace["policies"][number] | undefined {
  const exactMatches = workspace.policies.filter((policy) => policy.path === entry.policyPath);
  if (exactMatches.length === 1) return exactMatches[0];
  if (exactMatches.length > 1) return undefined;
  const fallback = workspace.policies.filter((policy) => policy.document.name === entry.policyName && policy.document.platform === entry.platform);
  return fallback.length === 1 ? fallback[0] : undefined;
}

export function findMobileConfigTargetVersion(policy: JsonRecord, entry: MobileConfigRestoreEntry): JsonRecord | undefined {
  const versions = Array.isArray(policy.versions) ? policy.versions.filter(isRecord) : [];
  if (versions.length === 0) return undefined;
  if (entry.versionUuid !== undefined && entry.versionUuid.length > 0) {
    const matches = versions.filter((version) => version.uuid === entry.versionUuid);
    return matches.length === 1 ? matches[0] : undefined;
  }
  return versions.length === 1 ? versions[0] : undefined;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
