/** Selects and clones workspace records without mutating the source workspace. */
import type { PolicyWorkspace } from "../../../src/browser/workspace.js";
import { asRecord } from "../../../src/browser/json.js";
import type { JsonRecord, Selection } from "./editor-contracts.js";

export function firstConfigurationSelection(workspace: PolicyWorkspace): Selection | undefined {
  for (const [policyIndex] of workspace.policies.entries()) {
    const version = versionRecord(workspace, policyIndex, 0);
    const configurations = Array.isArray(version?.configurations) ? version.configurations : [];
    if (configurations.length > 0) {
      return { policyIndex, versionIndex: 0, configurationIndex: 0 };
    }
  }
  return workspace.policies.length > 0 ? { policyIndex: 0, versionIndex: 0 } : undefined;
}

export function selectedConfiguration(workspace: PolicyWorkspace, selection: Selection): JsonRecord | undefined {
  if (selection.configurationIndex === undefined) {
    return undefined;
  }
  const version = versionRecord(workspace, selection.policyIndex, selection.versionIndex);
  const configurations = Array.isArray(version?.configurations) ? version.configurations : [];
  return asRecord(configurations[selection.configurationIndex]);
}

export function versionRecord(workspace: PolicyWorkspace, policyIndex: number, versionIndex: number): JsonRecord | undefined {
  const policy = workspace.policies[policyIndex];
  const versions = Array.isArray(policy?.document.versions) ? policy.document.versions : [];
  return asRecord(versions[versionIndex]);
}

export function cloneWorkspace(workspace: PolicyWorkspace): PolicyWorkspace {
  return structuredClone(workspace) as PolicyWorkspace;
}

export function newBrowserUuid(): string {
  return globalThis.crypto.randomUUID().toUpperCase();
}
