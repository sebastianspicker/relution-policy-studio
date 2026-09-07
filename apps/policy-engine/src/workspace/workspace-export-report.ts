/** Builds and updates the Relution-compatible workspace export report. */
import type { JsonRecord } from "../platform/serialization/json-guards.js";

export interface ExportedWorkspacePolicy {
  uuid: string;
  name: string;
}

export function createWorkspaceExportReport(policies: readonly ExportedWorkspacePolicy[]): JsonRecord {
  return {
    policiesToExport: policies.map((policy) => policy.uuid),
    exportedPolicies: Object.fromEntries(
      policies.map((policy) => [policy.uuid, exportedPolicyResult(policy)]),
    ),
    failedPolicies: {},
    exportFile: emptyExportFile(),
  };
}

export function recordPolicyInWorkspaceExportReport(report: JsonRecord, policy: ExportedWorkspacePolicy): void {
  const policiesToExport = Array.isArray(report.policiesToExport)
    ? report.policiesToExport.filter((entry): entry is string => typeof entry === "string")
    : [];
  if (!policiesToExport.includes(policy.uuid)) policiesToExport.push(policy.uuid);
  report.policiesToExport = policiesToExport;

  const exportedPolicies = isRecord(report.exportedPolicies) ? report.exportedPolicies : {};
  Object.defineProperty(exportedPolicies, policy.uuid, {
    value: exportedPolicyResult(policy), writable: true, enumerable: true, configurable: true,
  });
  report.exportedPolicies = exportedPolicies;
  if (!isRecord(report.failedPolicies)) report.failedPolicies = {};
}

/** Rebuilds report membership from accepted policy documents while retaining prior result fields. */
export function synchronizeWorkspaceExportReport(workspace: { report: JsonRecord; policies: Array<{ document: JsonRecord }> }): void {
  const previous = isRecord(workspace.report.exportedPolicies) ? workspace.report.exportedPolicies : undefined;
  const exported = Object.create(null) as JsonRecord;
  const ids: string[] = [];
  for (const policy of workspace.policies) synchronizePolicyReportEntry(policy.document, previous, exported, ids);
  workspace.report.policiesToExport = ids;
  workspace.report.exportedPolicies = exported;
  if (!isRecord(workspace.report.failedPolicies)) workspace.report.failedPolicies = {};
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exportedPolicyResult(policy: ExportedWorkspacePolicy): JsonRecord {
  return { policyUuid: policy.uuid, policyName: policy.name, result: "SUCCESS", errors: [] };
}

function synchronizePolicyReportEntry(document: JsonRecord, previous: JsonRecord | undefined, exported: JsonRecord, ids: string[]): void {
  const uuid = typeof document.uuid === "string" ? document.uuid : undefined;
  const name = typeof document.name === "string" ? document.name : undefined;
  if (uuid === undefined || name === undefined) return;
  ids.push(uuid);
  const prior = previous !== undefined && Object.hasOwn(previous, uuid) && isRecord(previous[uuid]) ? previous[uuid] : undefined;
  Object.defineProperty(exported, uuid, { value: { ...exportedPolicyResult({ uuid, name }), ...prior, policyUuid: uuid, policyName: name }, writable: true, enumerable: true, configurable: true });
}

function emptyExportFile(): JsonRecord {
  return {
    uuid: null,
    name: null,
    contentType: null,
    size: 0,
    modificationDate: 0,
    properties: {},
    hashcode: null,
    link: null,
  };
}
