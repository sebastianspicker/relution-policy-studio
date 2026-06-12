import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { AppleCompatReport } from "../src/apple-compat.js";
import { startEditorServer, type EditorServerHandle } from "../src/editor-server.js";
import type { EditorSidecarState } from "../src/sidecar.js";
import { loadTemplateBundle, type RelutionTemplateBundle } from "../src/templates.js";
import { createNewWorkspace, type PolicyWorkspace, type WorkspaceValidationResult } from "../src/workspace.js";

export const fixture = resolve("example/sample-policy-export.rexp");
export const password = Buffer.from([0x6b, 0x65, 0x79, 0x31, 0x32, 0x33]).toString("utf8");

export function makeTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `${prefix}-${randomUUID().slice(0, 8)}-`));
}

export async function startTestEditor(options: {
  readonly prefix: string;
  readonly platform: string;
  readonly name: string;
  readonly key?: string;
}): Promise<{
  readonly bundle: RelutionTemplateBundle;
  readonly root: string;
  readonly out: string;
  readonly workspaceDir: string;
  readonly workspace: PolicyWorkspace;
  readonly handle: EditorServerHandle;
}> {
  const bundle = loadTemplateBundle();
  const root = mkdtempSync(join(tmpdir(), options.prefix));
  const out = join(root, "policy.rexp");
  const workspaceDir = join(root, "workspace");
  const workspace = createNewWorkspace({
    workspace: workspaceDir,
    platform: options.platform,
    name: options.name,
    serverVersion: bundle.serverVersion,
  });
  const handle = await startEditorServer({
    workspace: workspaceDir,
    out,
    key: options.key ?? password,
    port: 0,
    host: "127.0.0.1",
  });
  return { bundle, root, out, workspaceDir, workspace, handle };
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
  const response = await fetch(localApiUrl(url));
  assert.equal(response.ok, true);
  return await response.json() as T;
}

export async function postJson(url: string, body: unknown): Promise<Response> {
  return await fetch(localApiUrl(url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function localApiUrl(url: string): URL {
  const parsed = new URL(url);
  if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
    throw new Error(`Unexpected local test host: ${parsed.hostname}`);
  }
  if (!parsed.pathname.startsWith("/api/")) {
    throw new Error(`Unexpected local API path: ${parsed.pathname}`);
  }
  return parsed;
}

export interface RelutionTemplateAuditShape {
  configurationTypes: Array<{ fields: unknown[] }>;
}

export interface EditorStateResponse {
  bundle: RelutionTemplateBundle;
  workspace: PolicyWorkspace;
  keySet: boolean;
  keyValidated: boolean;
  keyValidationReason?: string;
  appleCompat: AppleCompatReport;
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
