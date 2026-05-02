import type { WorkspacePolicy } from "../../../src/workspace.js";
import { asRecord } from "./editor-utils.js";
import type { JsonRecord } from "./types.js";

export function updateReportPolicyName(policyDocument: JsonRecord, report: JsonRecord, name: string): void {
  const uuid = typeof policyDocument.uuid === "string" ? policyDocument.uuid : undefined;
  const exportedPolicies = asRecord(report.exportedPolicies);
  const entry = uuid === undefined ? undefined : asRecord(exportedPolicies?.[uuid]);
  if (entry !== undefined) {
    entry.policyName = name;
  }
}

export function recordPolicyInReport(report: JsonRecord, policyDocument: JsonRecord): void {
  const uuid = typeof policyDocument.uuid === "string" ? policyDocument.uuid : undefined;
  const name = typeof policyDocument.name === "string" ? policyDocument.name : "Policy copy";
  if (uuid === undefined) {
    return;
  }
  const policiesToExport = Array.isArray(report.policiesToExport)
    ? report.policiesToExport.filter((entry): entry is string => typeof entry === "string")
    : [];
  report.policiesToExport = policiesToExport.includes(uuid) ? policiesToExport : [...policiesToExport, uuid];
  const exportedPolicies = asRecord(report.exportedPolicies) ?? {};
  exportedPolicies[uuid] = { policyUuid: uuid, policyName: name, result: "SUCCESS", errors: [] };
  report.exportedPolicies = exportedPolicies;
}

export function removePolicyFromReport(report: JsonRecord, policyDocument: JsonRecord): void {
  const uuid = typeof policyDocument.uuid === "string" ? policyDocument.uuid : undefined;
  if (uuid === undefined) {
    return;
  }
  if (Array.isArray(report.policiesToExport)) {
    report.policiesToExport = report.policiesToExport.filter((entry) => entry !== uuid);
  }
  const exportedPolicies = asRecord(report.exportedPolicies);
  if (exportedPolicies !== undefined) {
    delete exportedPolicies[uuid];
  }
}

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

function refreshNestedUuids(value: unknown): void {
  if (Array.isArray(value)) {
    for (const entry of value) {
      refreshNestedUuids(entry);
    }
    return;
  }
  const record = asRecord(value);
  if (record === undefined) {
    return;
  }
  if (typeof record.uuid === "string") {
    record.uuid = newBrowserUuid();
  }
  for (const entry of Object.values(record)) {
    refreshNestedUuids(entry);
  }
}

function newBrowserUuid(): string {
  if (globalThis.crypto?.randomUUID !== undefined) {
    return globalThis.crypto.randomUUID().toUpperCase();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/gu, (token) => {
    const random = Math.floor(Math.random() * 16);
    const value = token === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  }).toUpperCase();
}
