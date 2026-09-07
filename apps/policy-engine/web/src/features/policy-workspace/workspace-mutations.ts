/** Applies low-level workspace mutations while preserving report and policy consistency. */
import type { WorkspacePolicy } from "../../../../src/browser/workspace.js";
import { asRecord } from "../../shared/editor-record-utils.js";
import { newBrowserUuid } from "../../shared/editor-workspace-utils.js";
import type { JsonRecord } from "../../shared/editor-contracts.js";
export { recordPolicyInReport, removePolicyFromReport, updateReportPolicyName } from "../../shared/workspace-report-mutations.js";

export function duplicatePolicy(source: WorkspacePolicy): WorkspacePolicy {
  const document = structuredClone(source.document) as JsonRecord;
  const policyUuid = newBrowserUuid();
  document.uuid = policyUuid;
  document.name = `${typeof document.name === "string" ? document.name : "Policy"} Copy`;
  refreshNestedUuids(document);
  return {
    path: `policies/policy_${policyUuid}.json`,
    document,
  };
}

function refreshNestedUuids(value: unknown, visited = new Set<object>()): void {
  if (Array.isArray(value)) {
    if (visited.has(value)) {
      return;
    }
    visited.add(value);
    for (const entry of value) {
      refreshNestedUuids(entry, visited);
    }
    return;
  }
  const record = asRecord(value);
  if (record === undefined) {
    return;
  }
  if (visited.has(record)) {
    return;
  }
  visited.add(record);
  if (Object.hasOwn(record, "uuid") && typeof record.uuid === "string") {
    record.uuid = newBrowserUuid();
  }
  for (const entry of Object.values(record)) {
    refreshNestedUuids(entry, visited);
  }
}
