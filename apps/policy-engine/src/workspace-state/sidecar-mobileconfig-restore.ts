/** Captures mobileconfig configurations that must survive archive roundtrips. */
import { mobileConfigRestoreEntryForConfiguration, isSidecarRecord } from "./sidecar-mobileconfig-entry.js";
import type { PolicyWorkspace } from "../workspace/types.js";
import type { MobileConfigRestoreEntry } from "./sidecar-types.js";

export function collectMobileConfigRestoreEntries(workspace: PolicyWorkspace): MobileConfigRestoreEntry[] {
  return workspace.policies.flatMap((policy) => entriesForPolicy(policy));
}

function entriesForPolicy(policy: PolicyWorkspace["policies"][number]): MobileConfigRestoreEntry[] {
  const policyName = typeof policy.document.name === "string" ? policy.document.name : policy.path;
  const platform = typeof policy.document.platform === "string" ? policy.document.platform : "UNKNOWN";
  const versions = Array.isArray(policy.document.versions) ? policy.document.versions : [];
  return versions.flatMap((version, index) => entriesForVersion(policy.path, policyName, platform, version, index));
}

function entriesForVersion(policyPath: string, policyName: string, platform: string, version: unknown, versionIndex: number): MobileConfigRestoreEntry[] {
  const record = isSidecarRecord(version) ? version : undefined;
  const configurations = Array.isArray(record?.configurations) ? record.configurations : [];
  return configurations.flatMap((configuration) => mobileConfigRestoreEntryForConfiguration(policyPath, policyName, platform, record, versionIndex, configuration));
}
