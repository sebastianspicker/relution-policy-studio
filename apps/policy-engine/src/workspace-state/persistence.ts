/** Atomically recovers or publishes the workspace surface and editor sidecar as one durable unit. */
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, closeSync, constants, fsyncSync, lstatSync, mkdirSync, openSync, rmdirSync, rmSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { decodeStrictUtf8 } from "../platform/serialization/strict-utf8.js";
import { assertWorkspaceIntegrity } from "../workspace/workspace-integrity.js";
import { MAX_WORKSPACE_TOTAL_JSON_BYTES, assertPersistableWorkspaceShape, loadPersistedWorkspace, savePersistedWorkspace } from "../workspace/storage.js";
import type { PolicyWorkspace } from "../workspace/types.js";
import { MAX_EDITOR_SIDECAR_JSON_BYTES } from "./sidecar-types.js";
import { deleteEditorSidecarFile, readEditorSidecarBytes, writeEditorSidecarBytes } from "./sidecar-path.js";
import { parseEditorSidecar, validateSidecarInput } from "./sidecar-validation.js";
import { writePrivateFileAtomic, createPrivateDirectoryExclusive, removeEmptyPrivateDirectoryDurably } from "../platform/filesystem/atomic-private-file.js";
import { readBoundedRegularFileNoFollow } from "../platform/filesystem/bounded-file-read.js";
import { hasErrorCode } from "../platform/filesystem/error-code.js";
import { lstatIfPresent } from "../platform/filesystem/filesystem.js";
import { assertNoSymlinkPath, resolveSymlinkFreePath } from "../platform/filesystem/path-safety.js";
import { prepareNewWorkspaceDirectory } from "../workspace/workspace-creation.js";
import { recoverWorkspaceTransaction } from "../workspace/workspace-storage-transaction.js";

const STATE_DIRECTORY = ".rexp-studio-workspace-state";
const JOURNAL_FILE = "journal.json";
const SNAPSHOT_FILE = "state.json";
const STAGE_DIRECTORY = "stage";
const BACKUP_DIRECTORY = "backup";
const LOCK_DIRECTORY = "lock";
const LOCK_OWNER_FILE = "owner.json";
const STALE_UNOWNED_LOCK_MILLISECONDS = 1_000;
const MAX_SNAPSHOT_BYTES = MAX_WORKSPACE_TOTAL_JSON_BYTES + MAX_EDITOR_SIDECAR_JSON_BYTES * 2 + 1024 * 1024;

type SidecarState = { readonly kind: "missing" } | { readonly kind: "file"; readonly contents: Buffer };
type Phase = "prepared" | "workspace-published" | "sidecar-published" | "rolling-back" | "complete";

interface StoredWorkspaceState {
  readonly workspace: PolicyWorkspace;
  readonly sidecar: { readonly kind: "missing" } | { readonly kind: "file"; readonly contentsBase64: string };
}

interface Journal {
  readonly version: 1;
  phase: Phase;
  /** Omitted for journals written before first-time initialization was supported. */
  readonly hasPrevious?: boolean;
}

interface LockOwner { readonly version: 1; readonly pid: number; readonly nonce: string; }

/** The complete durable state that must move together for an editor mutation. */
export interface WorkspaceState {
  readonly workspace: PolicyWorkspace;
  readonly sidecar: SidecarState;
}

/** A consistent state read plus its opaque optimistic-concurrency token. */
export interface WorkspaceStateSnapshot {
  readonly state: WorkspaceState;
  readonly revision: string;
}

/** Options for a lock-held mutation that must reject a stale client state. */
export interface MutateWorkspaceStateOptions extends SaveWorkspaceStateOptions {
  readonly expectedRevision?: string;
}

/** Thrown only after the live state is read while the workspace lock is held. */
export class WorkspaceStateRevisionConflictError extends Error {
  readonly expectedRevision: string;
  readonly actualRevision: string;

  constructor(expectedRevision: string, actualRevision: string) {
    super("Workspace changed in another editor. Reload before saving again.");
    this.name = "WorkspaceStateRevisionConflictError";
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
  }
}

/** A synchronous, side-effect-free state transform applied while the workspace lock is held. */
export type WorkspaceStateMutation = (current: WorkspaceState) => WorkspaceState;

/** A private archive source with no exposed mutable workspace or filesystem path. */
export interface WorkspaceStateArchiveSnapshot {
  /** A frozen projection used only to validate the exact captured workspace. */
  readonly validationWorkspace: Readonly<PolicyWorkspace>;
  /** The captured sidecar is retained for editor response metadata. */
  readonly sidecar: SidecarState;
  /** Packs the exact frozen workspace representation used for validation. */
  pack<T>(build: (workspace: Readonly<PolicyWorkspace>) => T): T;
  dispose(): void;
}

/** Test-only interruption seam; production callers should omit this option. */
export interface SaveWorkspaceStateOptions {
  readonly afterStageCreated?: () => void;
  readonly afterWorkspacePublished?: () => void;
  readonly afterSidecarPublished?: () => void;
}

/** Options for creating a missing workspace or replacing an existing workspace-and-sidecar pair. */
export interface InitializeWorkspaceStateOptions extends SaveWorkspaceStateOptions {
  readonly force?: boolean;
}

/** Loads a consistent workspace/sidecar pair, first completing any interrupted composite operation. */
export function loadWorkspaceState(workspaceDir: string): WorkspaceState {
  return loadWorkspaceStateSnapshot(workspaceDir).state;
}

/** Reads one durable state pair and calculates its revision under the same lock. */
export function loadWorkspaceStateSnapshot(workspaceDir: string, expectedRevision?: string): WorkspaceStateSnapshot {
  const root = resolveWorkspaceRoot(workspaceDir);
  return withWorkspaceStateLock(root, () => {
    recoverWorkspaceStateLocked(root);
    const state = readWorkspaceStateLocked(root);
    assertExpectedWorkspaceRevision(state, expectedRevision);
    return { state, revision: workspaceStateRevision(state) };
  });
}

/**
 * Captures the exact workspace-and-sidecar pair under the workspace lock. The
 * frozen workspace is the single source for validation and archive packing;
 * later live-workspace mutations cannot change either result.
 */
export function captureWorkspaceStateArchiveSnapshot(workspaceDir: string): WorkspaceStateArchiveSnapshot {
  const root = resolveWorkspaceRoot(workspaceDir);
  return withWorkspaceStateLock(root, () => {
    recoverWorkspaceStateLocked(root);
    const state = readWorkspaceStateLocked(root);
    const workspace = freezeSnapshotProjection(structuredClone(state.workspace));
    return {
      sidecar: state.sidecar.kind === "missing" ? state.sidecar : { kind: "file", contents: Buffer.from(state.sidecar.contents) },
      validationWorkspace: workspace,
      pack: (build) => build(workspace),
      dispose: () => undefined,
    };
  });
}

/**
 * Publishes a workspace and its sidecar as one recoverable unit of work.
 * A process failure leaves a private journal that the next load/save recovers.
 */
export function saveWorkspaceState(workspaceDir: string, next: WorkspaceState, options: SaveWorkspaceStateOptions = {}): void {
  assertWorkspaceState(next, true);
  const root = resolveWorkspaceRoot(workspaceDir);
  withWorkspaceStateLock(root, () => {
    recoverWorkspaceStateLocked(root);
    const previous = readWorkspaceStateLocked(root);
    publishWorkspaceState(root, next, previous, options);
  });
}

/**
 * Reads, transforms, validates, and publishes the complete workspace-and-sidecar
 * pair under one inter-process lock. The transform must not perform I/O or call
 * another workspace-state operation, because it runs while the lock is held.
 */
export function mutateWorkspaceState(
  workspaceDir: string, mutate: WorkspaceStateMutation, options: MutateWorkspaceStateOptions = {},
): WorkspaceState {
  const root = resolveWorkspaceRoot(workspaceDir);
  return withWorkspaceStateLock(root, () => {
    recoverWorkspaceStateLocked(root);
    // Keep the freshly loaded pair private for rollback. Only the mutator input
    // is cloned, so in-place transforms cannot alter the recovery snapshot.
    const previous = readWorkspaceStateLocked(root);
    assertExpectedWorkspaceRevision(previous, options.expectedRevision);
    const next = mutate(cloneWorkspaceState(previous));
    assertWorkspaceState(next, true);
    publishWorkspaceState(root, next, previous, options);
    return readWorkspaceStateLocked(root);
  });
}

/** Stable opaque revision for the semantic managed workspace and sidecar state. */
export function workspaceStateRevision(state: WorkspaceState): string {
  return createHash("sha256").update(canonicalJson({
    workspace: state.workspace,
    sidecar: state.sidecar.kind === "missing"
      ? { kind: "missing" }
      : { kind: "file", contents: JSON.parse(decodeStrictUtf8(state.sidecar.contents, "editor sidecar JSON file")) },
  })).digest("hex");
}

/**
 * Publishes a new workspace and a fresh or missing sidecar under the same lock
 * and journal used by editor mutations. With force, the existing pair is the
 * rollback snapshot rather than a separately reset sidecar.
 */
export function initializeWorkspaceState(workspaceDir: string, next: WorkspaceState, options: InitializeWorkspaceStateOptions = {}): WorkspaceState {
  assertWorkspaceState(next, true);
  const root = resolveWorkspaceRootForInitialization(workspaceDir);
  return withWorkspaceStateLock(root, () => {
    recoverWorkspaceStateLocked(root);
    recoverWorkspaceTransaction(root);
    prepareNewWorkspaceDirectory(root, options.force === true, { allowWorkspaceState: true });
    const previous = hasPersistedWorkspace(root)
      ? { workspace: loadPersistedWorkspace(root), sidecar: captureSidecar(root) }
      : undefined;
    publishWorkspaceState(root, next, previous, options);
    return readWorkspaceStateLocked(root);
  });
}

/** Completes or rolls back the interrupted composite operation, if one exists. */
export function recoverWorkspaceState(workspaceDir: string): void {
  const root = resolveWorkspaceRoot(workspaceDir);
  withWorkspaceStateLock(root, () => recoverWorkspaceStateLocked(root));
}

function publishWorkspaceState(root: string, next: WorkspaceState, previous: WorkspaceState | undefined, options: SaveWorkspaceStateOptions): void {
  createSnapshotDirectory(root, STAGE_DIRECTORY, next);
  options.afterStageCreated?.();
  try {
    if (previous !== undefined) createSnapshotDirectory(root, BACKUP_DIRECTORY, previous);
    const journal: Journal = previous === undefined ? { version: 1, phase: "prepared", hasPrevious: false } : { version: 1, phase: "prepared" };
    writeJournal(root, journal);
    try {
      savePersistedWorkspace(root, next.workspace);
      journal.phase = "workspace-published";
      writeJournal(root, journal);
      options.afterWorkspacePublished?.();
      applySidecar(root, next.sidecar);
      journal.phase = "sidecar-published";
      writeJournal(root, journal);
      options.afterSidecarPublished?.();
    } catch (error) {
      rollbackAfterFailedSave(root, journal, previous, error);
    }
    markCompleteAndRemoveTransactionArtifacts(root, journal);
  } catch (error) {
    if (lstatIfPresent(statePath(root, JOURNAL_FILE)) === undefined) removeUnjournaledResidue(root);
    throw error;
  }
}

function rollbackAfterFailedSave(root: string, journal: Journal, previous: WorkspaceState | undefined, originalError: unknown): never {
  const failures: string[] = [];
  try {
    journal.phase = "rolling-back";
    writeJournal(root, journal);
  } catch (error) {
    failures.push(`journal rollback marker failed: ${message(error)}`);
  }
  try {
    if (previous === undefined) removeInitialWorkspaceState(root);
    else applyWorkspaceState(root, previous);
  } catch (error) {
    failures.push(`workspace-state recovery failed: ${message(error)}`);
  }
  if (failures.length === 0) {
    markCompleteAndRemoveTransactionArtifacts(root, journal);
    throw originalError;
  }
  throw new Error(`${message(originalError)}; ${failures.join("; ")}`, { cause: originalError });
}

function recoverWorkspaceStateLocked(root: string): void {
  const journalPath = statePath(root, JOURNAL_FILE);
  if (lstatIfPresent(journalPath) === undefined) return;
  assertPrivateRegularFile(root, JOURNAL_FILE, "Workspace state journal");
  const journal = parseJournal(readBoundedRegularFileNoFollow(journalPath, { label: "Workspace state journal", maxBytes: 16 * 1024 }));
  if (journal.phase === "complete") {
    removeTransactionArtifacts(root);
    return;
  }
  if (journal.phase === "workspace-published" || journal.phase === "sidecar-published") {
    applyWorkspaceState(root, readSnapshot(root, STAGE_DIRECTORY));
  } else if (journal.hasPrevious !== false) {
    applyWorkspaceState(root, readSnapshot(root, BACKUP_DIRECTORY));
  } else {
    removeInitialWorkspaceState(root);
  }
  markCompleteAndRemoveTransactionArtifacts(root, journal);
}

function applyWorkspaceState(root: string, state: WorkspaceState): void {
  savePersistedWorkspace(root, state.workspace);
  applySidecar(root, state.sidecar);
}

function readWorkspaceStateLocked(root: string): WorkspaceState {
  return { workspace: loadPersistedWorkspace(root), sidecar: captureSidecar(root) };
}

function assertExpectedWorkspaceRevision(state: WorkspaceState, expectedRevision: string | undefined): void {
  if (expectedRevision === undefined) return;
  const actualRevision = workspaceStateRevision(state);
  if (actualRevision !== expectedRevision) throw new WorkspaceStateRevisionConflictError(expectedRevision, actualRevision);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  throw new Error("Workspace state revision cannot serialize a non-JSON value");
}

function freezeSnapshotProjection<T>(value: T): T {
  if (typeof value !== "object" || value === null) return value;
  for (const child of Object.values(value)) freezeSnapshotProjection(child);
  return Object.freeze(value);
}

/** Supplies transforms a distinct mutable state so rollback always has the original pair. */
function cloneWorkspaceState(state: WorkspaceState): WorkspaceState {
  return {
    workspace: structuredClone(state.workspace),
    sidecar: state.sidecar.kind === "missing" ? state.sidecar : { kind: "file", contents: Buffer.from(state.sidecar.contents) },
  };
}

function removeInitialWorkspaceState(root: string): void {
  applySidecar(root, { kind: "missing" });
  for (const entry of ["metadata.json", "report.json", "policies"] as const) {
    const path = join(root, entry);
    if (lstatIfPresent(path) === undefined) continue;
    assertNoSymlinkPath(root, entry, "Workspace path");
    rmSync(path, { recursive: entry === "policies", force: true });
  }
  fsyncDirectory(root);
}

function hasPersistedWorkspace(root: string): boolean {
  return ["metadata.json", "report.json", "policies"].every((entry) => lstatIfPresent(join(root, entry)) !== undefined);
}

function applySidecar(root: string, sidecar: SidecarState): void {
  if (sidecar.kind === "missing") deleteEditorSidecarFile(root);
  else writeEditorSidecarBytes(root, sidecar.contents);
}

function captureSidecar(root: string): SidecarState {
  const contents = readEditorSidecarBytes(root);
  return contents === undefined ? { kind: "missing" } : { kind: "file", contents };
}

function assertWorkspaceState(state: WorkspaceState, validateSidecar: boolean): void {
  if (typeof state !== "object" || state === null || typeof state.workspace !== "object" || state.workspace === null || typeof state.sidecar !== "object" || state.sidecar === null) {
    throw new Error("Workspace state is invalid");
  }
  assertPersistableWorkspaceShape(state.workspace);
  assertWorkspaceIntegrity(state.workspace);
  if (state.sidecar.kind === "missing") return;
  if (state.sidecar.kind !== "file" || !Buffer.isBuffer(state.sidecar.contents)) throw new Error("Workspace sidecar state is invalid");
  if (state.sidecar.contents.length > MAX_EDITOR_SIDECAR_JSON_BYTES) {
    throw new Error(`Editor sidecar snapshot exceeds the ${String(MAX_EDITOR_SIDECAR_JSON_BYTES)} byte limit`);
  }
  if (!validateSidecar) return;
  const parsed = parseEditorSidecar(decodeStrictUtf8(state.sidecar.contents, "editor sidecar JSON file"));
  validateSidecarInput(parsed);
}

function createSnapshotDirectory(root: string, name: typeof STAGE_DIRECTORY | typeof BACKUP_DIRECTORY, state: WorkspaceState): void {
  const directory = statePath(root, name);
  assertNoSymlinkPath(root, `${STATE_DIRECTORY}/${name}`, "Workspace state path");
  createPrivateDirectoryExclusive(directory, "Workspace state snapshot directory");
  writePrivateFileAtomic(join(directory, SNAPSHOT_FILE), serializeSnapshot(state), { force: false, label: "Workspace state snapshot" });
}

function readSnapshot(root: string, directory: typeof STAGE_DIRECTORY | typeof BACKUP_DIRECTORY): WorkspaceState {
  const relative = `${directory}/${SNAPSHOT_FILE}`;
  assertPrivateRegularFile(root, relative, "Workspace state snapshot");
  const data = readBoundedRegularFileNoFollow(statePath(root, `${directory}/${SNAPSHOT_FILE}`), { label: "Workspace state snapshot", maxBytes: MAX_SNAPSHOT_BYTES });
  return parseSnapshot(data);
}

function serializeSnapshot(state: WorkspaceState): Buffer {
  const stored: StoredWorkspaceState = {
    workspace: state.workspace,
    sidecar: state.sidecar.kind === "missing" ? { kind: "missing" } : { kind: "file", contentsBase64: state.sidecar.contents.toString("base64") },
  };
  const output = Buffer.from(`${JSON.stringify(stored)}\n`, "utf8");
  if (output.length > MAX_SNAPSHOT_BYTES) throw new Error(`Workspace state snapshot exceeds the ${String(MAX_SNAPSHOT_BYTES)} byte limit`);
  return output;
}

function parseSnapshot(data: Buffer): WorkspaceState {
  let stored: unknown;
  try { stored = JSON.parse(decodeStrictUtf8(data, "workspace state snapshot")) as unknown; } catch (error) { throw new Error(`Workspace state snapshot is invalid: ${message(error)}`); }
  if (typeof stored !== "object" || stored === null || Array.isArray(stored)) throw new Error("Workspace state snapshot is invalid");
  const candidate = stored as Partial<StoredWorkspaceState>;
  if (typeof candidate.workspace !== "object" || candidate.workspace === null || typeof candidate.sidecar !== "object" || candidate.sidecar === null) throw new Error("Workspace state snapshot is invalid");
  let sidecar: SidecarState;
  if (candidate.sidecar.kind === "missing") sidecar = { kind: "missing" };
  else if (candidate.sidecar.kind === "file" && typeof candidate.sidecar.contentsBase64 === "string") {
    const contents = Buffer.from(candidate.sidecar.contentsBase64, "base64");
    if (contents.toString("base64") !== candidate.sidecar.contentsBase64 || contents.length > MAX_EDITOR_SIDECAR_JSON_BYTES) throw new Error("Workspace state snapshot has an invalid sidecar");
    sidecar = { kind: "file", contents };
  } else throw new Error("Workspace state snapshot is invalid");
  const state: WorkspaceState = { workspace: candidate.workspace as PolicyWorkspace, sidecar };
  assertWorkspaceState(state, false);
  return state;
}

function writeJournal(root: string, journal: Journal): void {
  writePrivateFileAtomic(statePath(root, JOURNAL_FILE), Buffer.from(`${JSON.stringify(journal)}\n`, "utf8"), { force: true, label: "Workspace state journal" });
}

function parseJournal(data: Buffer): Journal {
  let parsed: unknown;
  try { parsed = JSON.parse(decodeStrictUtf8(data, "workspace state journal")) as unknown; } catch (error) { throw new Error(`Workspace state journal is invalid: ${message(error)}`); }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("Workspace state journal is invalid");
  const journal = parsed as Partial<Journal>;
  if (journal.version !== 1 || !["prepared", "workspace-published", "sidecar-published", "rolling-back", "complete"].includes(journal.phase ?? "") || (journal.hasPrevious !== undefined && typeof journal.hasPrevious !== "boolean")) throw new Error("Workspace state journal is invalid");
  return journal as Journal;
}

function removeTransactionArtifacts(root: string): void {
  removeSnapshotDirectory(root, STAGE_DIRECTORY);
  removeSnapshotDirectory(root, BACKUP_DIRECTORY);
  removePrivateFile(root, JOURNAL_FILE);
}

function markCompleteAndRemoveTransactionArtifacts(root: string, journal: Journal): void {
  journal.phase = "complete";
  writeJournal(root, journal);
  removeTransactionArtifacts(root);
}

function removeUnjournaledResidue(root: string): void {
  if (lstatIfPresent(statePath(root, JOURNAL_FILE)) !== undefined) return;
  removeSnapshotDirectory(root, STAGE_DIRECTORY);
  removeSnapshotDirectory(root, BACKUP_DIRECTORY);
}

function removeSnapshotDirectory(root: string, name: typeof STAGE_DIRECTORY | typeof BACKUP_DIRECTORY): void {
  const relative = name;
  const directory = statePath(root, name);
  if (lstatIfPresent(directory) === undefined) return;
  assertNoSymlinkPath(root, `${STATE_DIRECTORY}/${relative}`, "Workspace state path");
  if (!lstatSync(directory).isDirectory()) throw new Error(`Workspace state path must be a directory: ${directory}`);
  removePrivateFile(root, `${relative}/${SNAPSHOT_FILE}`);
  rmdirSync(directory);
  fsyncDirectory(statePath(root, ""));
}

function removePrivateFile(root: string, relative: string): void {
  const path = statePath(root, relative);
  if (lstatIfPresent(path) === undefined) return;
  assertPrivateRegularFile(root, relative, "Workspace state path");
  unlinkSync(path);
  fsyncDirectory(join(path, ".."));
}

function assertPrivateRegularFile(root: string, relative: string, label: string): void {
  assertNoSymlinkPath(root, `${STATE_DIRECTORY}/${relative}`, label);
  const path = statePath(root, relative);
  const stats = lstatIfPresent(path);
  if (stats === undefined || !stats.isFile()) throw new Error(`${label} must be a regular file: ${path}`);
}

function resolveWorkspaceRoot(workspaceDir: string): string {
  const root = resolveSymlinkFreePath(workspaceDir, "Workspace state path");
  const stats = lstatIfPresent(root);
  if (stats === undefined || !stats.isDirectory()) throw new Error(`Workspace state path must be an existing directory: ${root}`);
  return root;
}

/** Creates only the lockable root; force validation runs after interrupted state has recovered. */
function resolveWorkspaceRootForInitialization(workspaceDir: string): string {
  const root = resolveSymlinkFreePath(workspaceDir, "Workspace state path");
  const stats = lstatIfPresent(root);
  if (stats === undefined) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    return root;
  }
  if (!stats.isDirectory()) throw new Error(`Workspace state path must be an existing directory: ${root}`);
  return root;
}

function withWorkspaceStateLock<T>(root: string, action: () => T): T {
  const stateDirectory = statePath(root, "");
  ensureStateDirectory(root);
  const lock = join(stateDirectory, LOCK_DIRECTORY);
  const owner = acquireWorkspaceStateLock(root, lock);
  let outcome: T | undefined;
  let failure: unknown;
  try {
    removeUnjournaledResidue(root);
    outcome = action();
  } catch (error) { failure = error; }
  try { releaseWorkspaceStateLock(root, lock, owner); }
  catch (error) { if (failure !== undefined) throw new AggregateError([failure, error], "Workspace state operation and lock cleanup both failed"); throw error; }
  if (failure !== undefined) throw failure;
  return outcome as T;
}

function acquireWorkspaceStateLock(root: string, lock: string): LockOwner {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const owner: LockOwner = { version: 1, pid: process.pid, nonce: randomUUID() };
    try {
      createPrivateDirectoryExclusive(lock, "Workspace state lock");
      writePrivateFileAtomic(join(lock, LOCK_OWNER_FILE), Buffer.from(`${JSON.stringify(owner)}\n`, "utf8"), { force: false, label: "Workspace state lock owner" });
      return owner;
    } catch (error) {
      if (!hasErrorCode(error, "EEXIST") || !reclaimStaleWorkspaceStateLock(root, lock)) throw new Error("Workspace state is busy; retry after the other editor finishes.", { cause: error });
    }
  }
  throw new Error("Workspace state is busy; retry after the other editor finishes.");
}

function reclaimStaleWorkspaceStateLock(root: string, lock: string): boolean {
  assertNoSymlinkPath(root, `${STATE_DIRECTORY}/${LOCK_DIRECTORY}`, "Workspace state lock");
  const lockStats = lstatIfPresent(lock);
  if (lockStats === undefined) return true;
  if (!lockStats.isDirectory()) throw new Error(`Workspace state lock must be a directory: ${lock}`);
  const ownerPath = join(lock, LOCK_OWNER_FILE);
  const ownerStats = lstatIfPresent(ownerPath);
  if (ownerStats === undefined) {
    if (Date.now() - lockStats.mtimeMs < STALE_UNOWNED_LOCK_MILLISECONDS) return false;
    removeEmptyPrivateDirectoryDurably(lock, "Workspace state lock");
    return true;
  }
  if (!ownerStats.isFile()) throw new Error(`Workspace state lock owner must be a regular file: ${ownerPath}`);
  const owner = parseLockOwner(readBoundedRegularFileNoFollow(ownerPath, { label: "Workspace state lock owner", maxBytes: 4 * 1024 }));
  if (isProcessAlive(owner.pid)) return false;
  unlinkSync(ownerPath);
  fsyncDirectory(lock);
  removeEmptyPrivateDirectoryDurably(lock, "Workspace state lock");
  return true;
}

function releaseWorkspaceStateLock(root: string, lock: string, expected: LockOwner): void {
  assertNoSymlinkPath(root, `${STATE_DIRECTORY}/${LOCK_DIRECTORY}/${LOCK_OWNER_FILE}`, "Workspace state lock");
  const ownerPath = join(lock, LOCK_OWNER_FILE);
  const owner = parseLockOwner(readBoundedRegularFileNoFollow(ownerPath, { label: "Workspace state lock owner", maxBytes: 4 * 1024 }));
  if (owner.nonce !== expected.nonce || owner.pid !== expected.pid) throw new Error("Workspace state lock ownership changed unexpectedly");
  unlinkSync(ownerPath);
  fsyncDirectory(lock);
  removeEmptyPrivateDirectoryDurably(lock, "Workspace state lock");
}

function parseLockOwner(data: Buffer): LockOwner {
  let parsed: unknown;
  try { parsed = JSON.parse(decodeStrictUtf8(data, "workspace state lock owner")) as unknown; } catch (error) { throw new Error(`Workspace state lock owner is invalid: ${message(error)}`); }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("Workspace state lock owner is invalid");
  const owner = parsed as Partial<LockOwner>;
  if (owner.version !== 1 || typeof owner.pid !== "number" || !Number.isSafeInteger(owner.pid) || owner.pid <= 0 || typeof owner.nonce !== "string" || owner.nonce.length === 0) throw new Error("Workspace state lock owner is invalid");
  return owner as LockOwner;
}

function isProcessAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) {
    if (hasErrorCode(error, "ESRCH")) return false;
    return true;
  }
}

function ensureStateDirectory(root: string): void {
  assertNoSymlinkPath(root, STATE_DIRECTORY, "Workspace state path");
  const directory = statePath(root, "");
  const stats = lstatIfPresent(directory);
  if (stats === undefined) mkdirSync(directory, { mode: 0o700 });
  else if (!stats.isDirectory()) throw new Error(`Workspace state path must be a directory: ${directory}`);
  chmodSync(directory, 0o700);
  fsyncDirectory(root);
}

function statePath(root: string, suffix: string): string { return join(root, STATE_DIRECTORY, suffix); }
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function fsyncDirectory(path: string): void {
  if (process.platform === "win32") return;
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_DIRECTORY);
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
}
