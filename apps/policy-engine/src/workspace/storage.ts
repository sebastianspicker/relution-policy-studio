/** Loads and writes the managed workspace JSON surface. */
import { chmodSync, closeSync, constants, fchmodSync, fstatSync, fsyncSync, mkdirSync, openSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { decodeStrictUtf8 } from "../platform/serialization/strict-utf8.js";
import { readBoundedRegularFileNoFollow } from "../platform/filesystem/bounded-file-read.js";
import { fsyncDirectory } from "../platform/filesystem/atomic-private-file.js";
import { lstatIfPresent } from "../platform/filesystem/filesystem.js";
import { requireRecord, type JsonRecord } from "../platform/serialization/json-guards.js";
import { assertNoSymlinkPath, resolveSymlinkFreePath } from "../platform/filesystem/path-safety.js";
import { isPolicyPath, policyPathCollisionKey } from "./policy-path.js";
import { assertWorkspaceIntegrity } from "./workspace-integrity.js";
import { assertPersistableWorkspaceShape as assertShape } from "./workspace-storage-shape.js";
import { listPolicyFiles } from "./workspace-policy-files.js";
import type { PolicyWorkspace } from "./types.js";

const MAX_WORKSPACE_POLICY_FILES = 1024;
const MAX_WORKSPACE_JSON_BYTES = 16 * 1024 * 1024;
export const MAX_WORKSPACE_TOTAL_JSON_BYTES = 128 * 1024 * 1024;

interface SerializedWorkspace { metadata: string; report: string; policies: Array<{ path: string; document: string }>; }

export function loadPersistedWorkspace(workspaceDir: string): PolicyWorkspace {
  const root = resolveSymlinkFreePath(workspaceDir, "Workspace path");
  const policyPaths = listPolicyFiles(root, MAX_WORKSPACE_POLICY_FILES);
  const documents = readWorkspaceDocuments(root, ["metadata.json", "report.json", ...policyPaths]);
  const workspace = { metadata: documents.get("metadata.json")!, report: documents.get("report.json")!, policies: policyPaths.map((path) => ({ path, document: documents.get(path)! })) };
  assertWorkspaceIntegrity(workspace);
  return workspace;
}

/**
 * Writes the managed surface in place. This is not atomic on its own: editor saves run it under the workspace-state
 * journal (workspace-state/persistence.ts), which rewrites the whole surface from its snapshot after a crash. Other
 * callers only write throwaway workspaces. Unchanged files are skipped, except with `rewriteAll`: recovery passes it,
 * because a crashed writer may have left matching contents that were never fsynced.
 */
export function savePersistedWorkspace(workspaceDir: string, workspace: PolicyWorkspace, options: { readonly rewriteAll?: boolean } = {}): void {
  const root = resolveSymlinkFreePath(workspaceDir, "Workspace path");
  const serialized = serializeWorkspace(workspace);
  assertManagedSurfaceIsSymlinkFree(root);
  const policies = join(root, "policies");
  mkdirSync(policies, { recursive: true, mode: 0o700 });
  chmodSync(root, 0o700);
  chmodSync(policies, 0o700);
  const wanted = new Map(serialized.policies.map((policy) => [policyPathCollisionKey(policy.path), policy.path]));
  for (const path of existingPolicyFiles(root)) {
    // Removes stale policies, and an old spelling that differs only in case on case-insensitive disks.
    if (wanted.get(policyPathCollisionKey(path)) !== path) unlinkSync(resolveWorkspacePath(root, path));
  }
  const rewriteAll = options.rewriteAll === true;
  writeManagedFile(root, "metadata.json", serialized.metadata, rewriteAll);
  writeManagedFile(root, "report.json", serialized.report, rewriteAll);
  for (const policy of serialized.policies) writeManagedFile(root, policy.path, policy.document, rewriteAll);
  fsyncDirectory(policies);
  fsyncDirectory(root);
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
/** Regular files in policies/ with a managed policy name; anything else is left for load-time validation. */
function existingPolicyFiles(root: string): string[] {
  return readdirSync(join(root, "policies"), { withFileTypes: true })
    .filter((entry) => entry.isFile() && isPolicyPath(`policies/${entry.name}`))
    .map((entry) => `policies/${entry.name}`);
}

/** fsyncs each written file so the journal never advances past contents that are not on disk. */
function writeManagedFile(root: string, relative: string, text: string, rewrite: boolean): void {
  const path = resolveWorkspacePath(root, relative);
  const data = Buffer.from(text, "utf8");
  const existing = lstatIfPresent(path);
  // A file a completed save wrote is already fsynced; a wrong mode is repaired by rewriting it.
  const unchanged = existing?.isFile() === true && (existing.mode & 0o777) === 0o600 && existing.size === data.length && readFileSync(path).equals(data);
  if (unchanged && !rewrite) return;
  const descriptor = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o600);
  try {
    if (!fstatSync(descriptor).isFile()) throw new Error(`Workspace path is not a regular file: ${relative}`);
    fchmodSync(descriptor, 0o600);
    writeFileSync(descriptor, data);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}
function assertManagedSurfaceIsSymlinkFree(root: string): void { for (const path of ["metadata.json", "report.json", "policies"]) assertNoSymlinkPath(root, path, "Workspace path"); }
function resolveWorkspacePath(root: string, relative: string): string { if (relative !== "metadata.json" && relative !== "report.json" && !isPolicyPath(relative)) throw new Error(`Workspace path must stay within the managed workspace surface: ${relative}`); const candidate = resolve(root, relative); if (!candidate.startsWith(`${root}${sep}`)) throw new Error(`Workspace path escapes the workspace root: ${relative}`); return candidate; }
