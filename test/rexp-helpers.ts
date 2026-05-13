import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { EditorSidecarState } from "../src/sidecar.js";
import type { RelutionTemplateBundle } from "../src/templates.js";
import type { PolicyWorkspace, WorkspaceValidationResult } from "../src/workspace.js";

export const fixture = resolve("example/sample-policy-export.rexp");
export const password = "key123";

export function makeTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `${prefix}-${randomUUID().slice(0, 8)}-`));
}

export function deterministicRandomBytes(): (size: number) => Buffer {
  let counter = 1;
  return (size: number): Buffer => {
    const buffer = Buffer.alloc(size);
    for (let index = 0; index < size; index += 1) {
      buffer[index] = counter % 256;
      counter += 1;
    }
    return buffer;
  };
}

export function requirePolicyPath(workspace: PolicyWorkspace): string {
  const policyPath = workspace.policies[0]?.path;
  if (policyPath === undefined) {
    throw new Error("Workspace has no policy path");
  }
  return policyPath;
}

export function firstConfiguration(workspace: PolicyWorkspace): Record<string, unknown> {
  const policy = workspace.policies[0]?.document;
  const versions = Array.isArray(policy?.versions) ? policy.versions : [];
  const version = versions[0];
  const versionRecord =
    typeof version === "object" && version !== null && !Array.isArray(version) ? (version as Record<string, unknown>) : undefined;
  const configurations = Array.isArray(versionRecord?.configurations) ? versionRecord.configurations : [];
  const configuration = configurations[0];
  if (typeof configuration !== "object" || configuration === null || Array.isArray(configuration)) {
    throw new Error("Workspace has no first configuration");
  }
  return configuration as Record<string, unknown>;
}

export function configurationTypes(workspace: PolicyWorkspace): string[] {
  return configurationTypesForPolicy(workspace, requirePolicyPath(workspace));
}

export function configurationTypesForPolicy(workspace: PolicyWorkspace, policyPath: string): string[] {
  const policy = workspace.policies.find((candidate) => candidate.path === policyPath);
  const versions = Array.isArray(policy?.document.versions) ? policy.document.versions : [];
  const version = versions[0];
  const versionRecord =
    typeof version === "object" && version !== null && !Array.isArray(version) ? (version as Record<string, unknown>) : undefined;
  const configurations = Array.isArray(versionRecord?.configurations) ? versionRecord.configurations : [];
  return configurations.map((configuration) => {
    const record =
      typeof configuration === "object" && configuration !== null && !Array.isArray(configuration)
        ? (configuration as Record<string, unknown>)
        : {};
    const details = record.details;
    if (typeof details !== "object" || details === null || Array.isArray(details)) {
      return "UNKNOWN";
    }
    return typeof (details as Record<string, unknown>).type === "string" ? (details as Record<string, unknown>).type as string : "UNKNOWN";
  });
}

export function assertReportContainsPolicy(workspace: PolicyWorkspace, policyPath: string, policyName: string): void {
  const policy = workspace.policies.find((candidate) => candidate.path === policyPath);
  assert.notEqual(policy, undefined);
  const policyUuid = policy?.document.uuid;
  assert.equal(typeof policyUuid, "string");
  const policiesToExport = workspace.report.policiesToExport;
  assert.equal(Array.isArray(policiesToExport), true);
  assert.equal((policiesToExport as unknown[]).includes(policyUuid), true);
  const exportedPolicies = workspace.report.exportedPolicies;
  assert.equal(typeof exportedPolicies, "object");
  assert.notEqual(exportedPolicies, null);
  assert.equal(Array.isArray(exportedPolicies), false);
  const exportedPolicy = (exportedPolicies as Record<string, unknown>)[policyUuid as string] as Record<string, unknown> | undefined;
  assert.equal(exportedPolicy?.policyName, policyName);
  assert.equal(exportedPolicy?.result, "SUCCESS");
}

export function parseJsonRecord(value: unknown): Record<string, unknown> {
  assert.equal(typeof value, "string");
  const parsed = JSON.parse(value as string) as unknown;
  return requireRecord(parsed);
}

export function requireRecord(value: unknown): Record<string, unknown> {
  assert.equal(typeof value, "object");
  assert.notEqual(value, null);
  assert.equal(Array.isArray(value), false);
  return value as Record<string, unknown>;
}

export function requireArray(value: unknown): unknown[] {
  assert.equal(Array.isArray(value), true);
  return value as unknown[];
}

export async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  assert.equal(response.ok, true);
  return await response.json() as T;
}

export async function postJson(url: string, body: unknown): Promise<Response> {
  return await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export interface RelutionTemplateAuditShape {
  configurationTypes: Array<{ fields: unknown[] }>;
}

export interface EditorStateResponse {
  bundle: RelutionTemplateBundle;
  workspace: PolicyWorkspace;
  appleCompat: { summary: { mobileconfigBacked: number } };
}

export interface AddPolicyResponse {
  workspace: PolicyWorkspace;
  policyPath: string;
}

export interface WorkspaceValidationResponse {
  workspace: PolicyWorkspace;
  validation: WorkspaceValidationResult;
}

export interface WorkspaceValidateOnlyResponse {
  validation: WorkspaceValidationResult;
}

export interface SidecarResponse {
  sidecar: EditorSidecarState;
}

export interface ReconcileResponse {
  workspace: PolicyWorkspace;
  validation: WorkspaceValidationResult;
  sidecar: EditorSidecarState;
}

export interface AppleSchemaEditorStateResponse {
  appleSchema: { counts: Record<string, number> };
  sidecar: { ddmArtifacts: unknown[] };
}
