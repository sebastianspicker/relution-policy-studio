/** Loads and durably replaces the managed workspace JSON surface. */
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { decodeStrictUtf8 } from "../platform/serialization/strict-utf8.js";
import { readBoundedRegularFileNoFollow } from "../platform/filesystem/bounded-file-read.js";
import { requireRecord, type JsonRecord } from "../platform/serialization/json-guards.js";
import { assertNoSymlinkPath, resolveSymlinkFreePath } from "../platform/filesystem/path-safety.js";
import { isPolicyPath } from "./policy-path.js";
import { assertWorkspaceIntegrity } from "./workspace-integrity.js";
import { assertPersistableWorkspaceShape as assertShape } from "./workspace-storage-shape.js";
import { listPolicyFiles } from "./workspace-policy-files.js";
import { createWorkspaceTransaction, discardWorkspaceTransaction, recoverWorkspaceTransaction, replaceWorkspaceSurface, workspaceTransactionStageDirectory } from "./workspace-storage-transaction.js";
import type { PolicyWorkspace } from "./types.js";

const MAX_WORKSPACE_POLICY_FILES = 1024;
const MAX_WORKSPACE_JSON_BYTES = 16 * 1024 * 1024;
export const MAX_WORKSPACE_TOTAL_JSON_BYTES = 128 * 1024 * 1024;

interface SerializedWorkspace { metadata: string; report: string; policies: Array<{ path: string; document: string }>; }

export function loadPersistedWorkspace(workspaceDir: string): PolicyWorkspace {
  const root = resolveSymlinkFreePath(workspaceDir, "Workspace path");
  recoverWorkspaceTransaction(root);
  const policyPaths = listPolicyFiles(root, MAX_WORKSPACE_POLICY_FILES);
  const documents = readWorkspaceDocuments(root, ["metadata.json", "report.json", ...policyPaths]);
  const workspace = { metadata: documents.get("metadata.json")!, report: documents.get("report.json")!, policies: policyPaths.map((path) => ({ path, document: documents.get(path)! })) };
  assertWorkspaceIntegrity(workspace);
  return workspace;
}

export function savePersistedWorkspace(workspaceDir: string, workspace: PolicyWorkspace): void {
  const root = resolveSymlinkFreePath(workspaceDir, "Workspace path");
  recoverWorkspaceTransaction(root);
  const serialized = serializeWorkspace(workspace);
  assertManagedSurfaceIsSymlinkFree(root);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  chmodSync(root, 0o700);
  const transaction = createWorkspaceTransaction(root);
  try {
    writeSerializedWorkspace(workspaceTransactionStageDirectory(transaction), serialized);
    replaceWorkspaceSurface(transaction);
  } catch (error) {
    recoverWorkspaceTransaction(root);
    throw error;
  } finally {
    discardWorkspaceTransaction(transaction);
  }
}

export function assertPersistableWorkspaceShape(workspace: PolicyWorkspace): void {
  assertShape(workspace, MAX_WORKSPACE_POLICY_FILES);
}


function readWorkspaceDocuments(root: string, paths: string[]): Map<string, JsonRecord> {
  const buffers = new Map<string, Buffer>(); let total = 0;
  for (const path of paths) {
    assertNoSymlinkPath(root, path, "Workspace path");
    const buffer = readBoundedRegularFileNoFollow(resolveWorkspacePath(root, path), { label: "Workspace JSON file", maxBytes: MAX_WORKSPACE_JSON_BYTES });
    total = addWorkspaceJsonBytes(total, buffer.length);
    buffers.set(path, buffer);
  }
  const result = new Map<string, JsonRecord>();
  for (const [path, buffer] of buffers) result.set(path, parseWorkspaceJson(buffer, resolveWorkspacePath(root, path)));
  return result;
}

function parseWorkspaceJson(buffer: Buffer, path: string): JsonRecord {
  try { return requireRecord(JSON.parse(decodeStrictUtf8(buffer, "workspace JSON file")) as unknown, path); }
  catch (error) { throw new Error(`Failed to parse workspace JSON file ${path}: ${error instanceof Error ? error.message : String(error)}`, { cause: error }); }
}

function serializeWorkspace(workspace: PolicyWorkspace): SerializedWorkspace {
  assertPersistableWorkspaceShape(workspace);
  const serialized = { metadata: serializeJson(workspace.metadata), report: serializeJson(workspace.report), policies: workspace.policies.map((policy) => ({ path: policy.path, document: serializeJson(policy.document) })) };
  assertSerializedSizes(serialized);
  assertWorkspaceIntegrity(workspace);
  return serialized;
}

function serializeJson(value: unknown): string { return `${JSON.stringify(value, null, 2)}\n`; }
function assertSerializedSizes(serialized: SerializedWorkspace): void { assertByteLimits([{ path: "metadata.json", text: serialized.metadata }, { path: "report.json", text: serialized.report }, ...serialized.policies.map((policy) => ({ path: policy.path, text: policy.document }))]); }
function assertByteLimits(entries: Array<{ path: string; text: string }>): void { let total = 0; for (const entry of entries) { const bytes = Buffer.byteLength(entry.text); if (bytes > MAX_WORKSPACE_JSON_BYTES) throw new Error(`Workspace JSON file exceeds the ${String(MAX_WORKSPACE_JSON_BYTES)} byte limit: ${entry.path}`); total = addWorkspaceJsonBytes(total, bytes); } }
function addWorkspaceJsonBytes(total: number, bytes: number): number { const next = total + bytes; if (next > MAX_WORKSPACE_TOTAL_JSON_BYTES) throw new Error(`Workspace JSON files exceed the ${String(MAX_WORKSPACE_TOTAL_JSON_BYTES)} byte aggregate limit`); return next; }
function writeSerializedWorkspace(root: string, serialized: SerializedWorkspace): void { mkdirSync(resolve(root, "policies"), { recursive: true, mode: 0o700 }); writeJson(root, "metadata.json", serialized.metadata); writeJson(root, "report.json", serialized.report); for (const policy of serialized.policies) writeJson(root, policy.path, policy.document); }
function writeJson(root: string, relative: string, value: string): void { const path = resolveWorkspacePath(root, relative); mkdirSync(dirname(path), { recursive: true, mode: 0o700 }); chmodSync(dirname(path), 0o700); writeFileSync(path, value, { mode: 0o600 }); chmodSync(path, 0o600); }
function assertManagedSurfaceIsSymlinkFree(root: string): void { for (const path of ["metadata.json", "report.json", "policies"]) assertNoSymlinkPath(root, path, "Workspace path"); }
function resolveWorkspacePath(root: string, relative: string): string { if (relative !== "metadata.json" && relative !== "report.json" && !isPolicyPath(relative)) throw new Error(`Workspace path must stay within the managed workspace surface: ${relative}`); const candidate = resolve(root, relative); if (!candidate.startsWith(`${root}${sep}`)) throw new Error(`Workspace path escapes the workspace root: ${relative}`); return candidate; }
