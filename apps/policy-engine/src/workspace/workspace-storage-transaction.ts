/** Recovers or finalizes crash-interrupted workspace-surface replacement transactions. */
import { randomUUID } from "node:crypto";
import { chmodSync, closeSync, constants, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, renameSync, rmSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { writePrivateFileAtomic, createPrivateDirectoryExclusive } from "../platform/filesystem/atomic-private-file.js";
import { lstatIfPresent } from "../platform/filesystem/filesystem.js";
import { decodeStrictUtf8 } from "../platform/serialization/strict-utf8.js";
import { readBoundedRegularFileNoFollow } from "../platform/filesystem/bounded-file-read.js";
import { assertNoSymlinkPath, resolveSymlinkFreePath } from "../platform/filesystem/path-safety.js";

const ENTRIES = ["metadata.json", "report.json", "policies"] as const;
const TRANSACTION_DIRECTORY = ".rexp-studio-workspace-transaction";
const JOURNAL_FILE = "journal.json";
const JOURNAL_VERSION = 1;
type ManagedEntry = typeof ENTRIES[number];
type Phase = "initializing" | "staged" | "backing-up" | "backed-up" | "installing" | "installed" | "rolling-back" | "rolled-back";
type MoveDirection = "backup" | "install" | "restore";
interface PendingMove { readonly entry: ManagedEntry; readonly direction: MoveDirection; }

export interface WorkspaceTransaction {
  readonly version: typeof JOURNAL_VERSION;
  readonly workspaceDir: string;
  readonly nonce: string;
  readonly stage: string;
  readonly backup: string;
  phase: Phase;
  movedToBackup: ManagedEntry[];
  movedFromStage: ManagedEntry[];
  /** Entries whose backup-to-live restore has durably completed. */
  restoredFromBackup?: ManagedEntry[];
  /** Durable intent written immediately before an individual managed-entry rename. */
  pendingMove?: PendingMove;
}

/** Test-only interruption hooks around a rename after its durable intent is recorded. */
export interface ReplaceWorkspaceSurfaceOptions {
  readonly beforeManagedEntryRename?: (move: PendingMove) => void;
  readonly afterManagedEntryRename?: (move: PendingMove) => void;
}

/** Test-only interruption hooks for replaying rollback and terminal cleanup crashes. */
export interface RecoverWorkspaceTransactionOptions {
  readonly beforeManagedEntryRestoreRename?: (move: PendingMove) => void;
  readonly afterManagedEntryRestoreRename?: (move: PendingMove) => void;
  readonly afterStageDeletion?: () => void;
  readonly afterBackupDeletion?: () => void;
  readonly beforeJournalDeletion?: () => void;
}

/** Creates private, nonce-bound transaction storage inside the workspace. */
export function createWorkspaceTransaction(workspaceDir: string): WorkspaceTransaction {
  const nonce = randomUUID();
  const transaction: WorkspaceTransaction = {
    version: JOURNAL_VERSION,
    workspaceDir: workspaceRoot(workspaceDir),
    nonce,
    stage: `stage-${nonce}`,
    backup: `backup-${nonce}`,
    phase: "initializing",
    movedToBackup: [],
    movedFromStage: [],
    restoredFromBackup: [],
  };
  ensureTransactionDirectory(transaction.workspaceDir);
  writeTransaction(transaction);
  try {
    createPrivateDirectoryExclusive(stageDirectory(transaction), "Workspace transaction stage");
    createPrivateDirectoryExclusive(backupDirectory(transaction), "Workspace transaction backup");
  } catch (error) {
    rollbackTransaction(transaction);
    throw error;
  }
  transaction.phase = "staged";
  writeTransaction(transaction);
  return transaction;
}

/** Returns the private staging directory for a transaction created in this process. */
export function workspaceTransactionStageDirectory(transaction: WorkspaceTransaction): string {
  assertTransaction(transaction, transaction.workspaceDir);
  return stageDirectory(transaction);
}

/** Removes unjournaled transaction directories after setup fails before publication begins. */
export function discardWorkspaceTransaction(transaction: WorkspaceTransaction): void {
  assertTransaction(transaction, transaction.workspaceDir);
  if (lstatIfPresent(journalPath(transaction.workspaceDir)) !== undefined) return;
  removeTransactionDirectory(transaction, "stage");
  removeTransactionDirectory(transaction, "backup");
}

export function replaceWorkspaceSurface(transaction: WorkspaceTransaction, options: ReplaceWorkspaceSurfaceOptions = {}): void {
  assertTransaction(transaction, transaction.workspaceDir);
  writeTransaction(transaction);
  transaction.phase = "backing-up";
  writeTransaction(transaction);
  moveAll(transaction, transaction.workspaceDir, backupDirectory(transaction), transaction.movedToBackup, "backup", options);
  transaction.phase = "backed-up";
  writeTransaction(transaction);
  transaction.phase = "installing";
  writeTransaction(transaction);
  moveAll(transaction, stageDirectory(transaction), transaction.workspaceDir, transaction.movedFromStage, "install", options);
  transaction.phase = "installed";
  writeTransaction(transaction);
  finalizeTransaction(transaction);
}

export function recoverWorkspaceTransaction(workspaceDir: string, options: RecoverWorkspaceTransactionOptions = {}): void {
  const root = workspaceRoot(workspaceDir);
  const directory = transactionDirectory(root);
  if (lstatIfPresent(directory) === undefined) return;
  ensureTransactionDirectory(root);
  const journal = journalPath(root);
  if (lstatIfPresent(journal) === undefined) return;
  const transaction = parseTransaction(journal, root);
  if (isCompleteInstall(transaction)) finalizeTransaction(transaction, options);
  else rollbackTransaction(transaction, options);
}

function moveAll(transaction: WorkspaceTransaction, from: string, to: string, moved: ManagedEntry[], direction: MoveDirection, options: ReplaceWorkspaceSurfaceOptions): void {
  for (const entry of ENTRIES) {
    if (!existsSync(join(from, entry))) continue;
    const pendingMove: PendingMove = { entry, direction };
    transaction.pendingMove = pendingMove;
    writeTransaction(transaction);
    options.beforeManagedEntryRename?.(pendingMove);
    moveEntry(from, to, entry);
    options.afterManagedEntryRename?.(pendingMove);
    moved.push(entry);
    delete transaction.pendingMove;
    writeTransaction(transaction);
  }
}

function moveEntry(from: string, to: string, entry: ManagedEntry): boolean {
  const source = join(from, entry);
  if (!existsSync(source)) return false;
  assertNoSymlinkPath(from, entry, "Workspace transaction path");
  mkdirSync(to, { recursive: true, mode: 0o700 });
  renameSync(source, join(to, entry));
  syncDirectory(from);
  syncDirectory(to);
  return true;
}

function isCompleteInstall(transaction: WorkspaceTransaction): boolean {
  if (transaction.phase !== "installed" && transaction.phase !== "installing") return false;
  return ENTRIES.every((entry) => existsSync(join(transaction.workspaceDir, entry)) && !existsSync(join(stageDirectory(transaction), entry)));
}

function rollbackTransaction(transaction: WorkspaceTransaction, options: RecoverWorkspaceTransactionOptions = {}): void {
  if (transaction.phase === "rolled-back") {
    finalizeRollback(transaction, options);
    return;
  }
  transaction.phase = "rolling-back";
  writeTransaction(transaction);
  const entriesToRestore = rollbackEntries(transaction);
  for (const entry of ENTRIES) {
    if (entriesToRestore.includes(entry)) restoreBackupEntry(transaction, entry, options);
    else if (transaction.movedFromStage.includes(entry) || (transaction.pendingMove?.direction === "install" && transaction.pendingMove.entry === entry)) {
      removeWorkspaceEntry(transaction.workspaceDir, entry);
    }
  }
  if (!hasCompleteManagedSurface(transaction.workspaceDir)) throw new Error("Workspace transaction rollback could not restore the previous workspace surface");
  transaction.phase = "rolled-back";
  writeTransaction(transaction);
  finalizeRollback(transaction, options);
}

function restoreBackupEntry(transaction: WorkspaceTransaction, entry: ManagedEntry, options: RecoverWorkspaceTransactionOptions): void {
  const backupEntry = join(backupDirectory(transaction), entry);
  const liveEntry = join(transaction.workspaceDir, entry);
  const restoreCompleted = transaction.restoredFromBackup?.includes(entry) === true;
  const restorePending = transaction.pendingMove?.direction === "restore" && transaction.pendingMove.entry === entry;
  const backupExists = existsSync(backupEntry);
  const liveExists = existsSync(liveEntry);

  if (restoreCompleted) {
    if (!backupExists && liveExists) return;
    throw new Error(`Workspace transaction restored entry is inconsistent: ${entry}`);
  }
  if (!backupExists) {
    if (restorePending && liveExists) {
      recordRestoredEntry(transaction, entry);
      return;
    }
    throw new Error(`Workspace transaction backup entry is missing: ${entry}`);
  }

  transaction.pendingMove = { entry, direction: "restore" };
  writeTransaction(transaction);
  options.beforeManagedEntryRestoreRename?.(transaction.pendingMove);
  removeWorkspaceEntry(transaction.workspaceDir, entry);
  if (!moveEntry(backupDirectory(transaction), transaction.workspaceDir, entry)) throw new Error(`Workspace transaction backup entry is missing: ${entry}`);
  options.afterManagedEntryRestoreRename?.({ entry, direction: "restore" });
  recordRestoredEntry(transaction, entry);
}

function recordRestoredEntry(transaction: WorkspaceTransaction, entry: ManagedEntry): void {
  const restored = transaction.restoredFromBackup ?? [];
  if (!restored.includes(entry)) restored.push(entry);
  transaction.restoredFromBackup = restored;
  delete transaction.pendingMove;
  writeTransaction(transaction);
}

function rollbackEntries(transaction: WorkspaceTransaction): ManagedEntry[] {
  return ENTRIES.filter((entry) => existsSync(join(backupDirectory(transaction), entry))
    || transaction.movedToBackup.includes(entry)
    || (transaction.pendingMove?.direction === "backup" && transaction.pendingMove.entry === entry && !existsSync(join(transaction.workspaceDir, entry))));
}

function finalizeTransaction(transaction: WorkspaceTransaction, options: RecoverWorkspaceTransactionOptions = {}): void {
  if (!isCompleteInstall(transaction)) throw new Error("Workspace transaction cannot finalize an incomplete workspace surface");
  removeTransactionResidue(transaction, options);
}

function finalizeRollback(transaction: WorkspaceTransaction, options: RecoverWorkspaceTransactionOptions): void {
  if (!hasCompleteManagedSurface(transaction.workspaceDir)) throw new Error("Workspace transaction cannot finalize an incomplete rollback surface");
  removeTransactionResidue(transaction, options);
}

function removeWorkspaceEntry(workspaceDir: string, entry: ManagedEntry): void {
  const path = join(workspaceDir, entry);
  if (!existsSync(path)) return;
  assertNoSymlinkPath(workspaceDir, entry, "Workspace transaction path");
  rmSync(path, { recursive: entry === "policies", force: true });
  syncDirectory(workspaceDir);
}

function removeTransactionResidue(transaction: WorkspaceTransaction, options: RecoverWorkspaceTransactionOptions = {}): void {
  if (removeTransactionDirectory(transaction, "stage")) options.afterStageDeletion?.();
  if (removeTransactionDirectory(transaction, "backup")) options.afterBackupDeletion?.();
  const journal = journalPath(transaction.workspaceDir);
  if (lstatIfPresent(journal) !== undefined) {
    assertPrivateRegularFile(transaction.workspaceDir, JOURNAL_FILE, "Workspace transaction journal");
    options.beforeJournalDeletion?.();
    unlinkSync(journal);
    syncDirectory(transactionDirectory(transaction.workspaceDir));
  }
}

function writeTransaction(transaction: WorkspaceTransaction): void {
  assertTransaction(transaction, transaction.workspaceDir);
  ensureTransactionDirectory(transaction.workspaceDir);
  writePrivateFileAtomic(journalPath(transaction.workspaceDir), Buffer.from(`${JSON.stringify(transaction)}\n`, "utf8"), { force: true, label: "Workspace transaction journal" });
}

function parseTransaction(journal: string, workspaceDir: string): WorkspaceTransaction {
  assertPrivateRegularFile(workspaceDir, JOURNAL_FILE, "Workspace transaction journal");
  const text = decodeStrictUtf8(readBoundedRegularFileNoFollow(journal, { label: "Workspace transaction journal", maxBytes: 64 * 1024 }), "workspace transaction journal");
  let parsed: unknown;
  try { parsed = JSON.parse(text) as unknown; } catch (error) { throw new Error(`Workspace transaction journal is invalid: ${error instanceof Error ? error.message : String(error)}`); }
  if (!isTransaction(parsed, workspaceDir)) throw new Error("Workspace transaction journal is invalid");
  return parsed;
}

function isTransaction(value: unknown, workspaceDir: string): value is WorkspaceTransaction {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const transaction = value as Partial<WorkspaceTransaction>;
  const root = workspaceRoot(workspaceDir);
  return transaction.version === JOURNAL_VERSION && (transaction.workspaceDir === root || transaction.workspaceDir === resolve(workspaceDir)) && isNonce(transaction.nonce)
    && transaction.stage === transactionEntryName(transaction.nonce, "stage")
    && transaction.backup === transactionEntryName(transaction.nonce, "backup")
    && ["initializing", "staged", "backing-up", "backed-up", "installing", "installed", "rolling-back", "rolled-back"].includes(transaction.phase ?? "")
    && Array.isArray(transaction.movedToBackup) && Array.isArray(transaction.movedFromStage)
    && transaction.movedToBackup.every(isEntry) && transaction.movedFromStage.every(isEntry)
    && (transaction.restoredFromBackup === undefined || (Array.isArray(transaction.restoredFromBackup) && transaction.restoredFromBackup.every(isEntry)))
    && (transaction.pendingMove === undefined || isPendingMove(transaction.pendingMove));
}

function assertTransaction(transaction: WorkspaceTransaction, workspaceDir: string): void {
  if (!isTransaction(transaction, workspaceDir)) throw new Error("Workspace transaction is invalid");
}

function removeTransactionDirectory(transaction: WorkspaceTransaction, kind: "stage" | "backup"): boolean {
  const name = kind === "stage" ? transaction.stage : transaction.backup;
  const directory = join(transactionDirectory(transaction.workspaceDir), name);
  if (lstatIfPresent(directory) === undefined) return false;
  assertNoSymlinkPath(transaction.workspaceDir, `${TRANSACTION_DIRECTORY}/${name}`, "Workspace transaction path");
  if (!lstatSync(directory).isDirectory()) throw new Error(`Workspace transaction path must be a directory: ${directory}`);
  rmSync(directory, { recursive: true, force: true });
  syncDirectory(transactionDirectory(transaction.workspaceDir));
  return true;
}

function ensureTransactionDirectory(workspaceDir: string): void {
  const root = workspaceRoot(workspaceDir);
  const directory = transactionDirectory(root);
  assertNoSymlinkPath(root, TRANSACTION_DIRECTORY, "Workspace transaction path");
  const stats = lstatIfPresent(directory);
  if (stats === undefined) {
    try { createPrivateDirectoryExclusive(directory, "Workspace transaction directory"); }
    catch (error) {
      if (!isAlreadyExists(error)) throw error;
    }
  }
  const current = lstatIfPresent(directory);
  if (current === undefined || !current.isDirectory()) throw new Error(`Workspace transaction path must be a directory: ${directory}`);
  chmodSync(directory, 0o700);
  syncDirectory(root);
}

function assertPrivateRegularFile(workspaceDir: string, relative: string, label: string): void {
  assertNoSymlinkPath(workspaceDir, `${TRANSACTION_DIRECTORY}/${relative}`, label);
  const path = join(transactionDirectory(workspaceDir), relative);
  const stats = lstatIfPresent(path);
  if (stats === undefined || !stats.isFile()) throw new Error(`${label} must be a regular file: ${path}`);
}

function transactionEntryName(nonce: string, kind: "stage" | "backup"): string { return `${kind}-${nonce}`; }
function stageDirectory(transaction: WorkspaceTransaction): string { return join(transactionDirectory(transaction.workspaceDir), transaction.stage); }
function backupDirectory(transaction: WorkspaceTransaction): string { return join(transactionDirectory(transaction.workspaceDir), transaction.backup); }
function transactionDirectory(workspaceDir: string): string { return join(workspaceRoot(workspaceDir), TRANSACTION_DIRECTORY); }
function journalPath(workspaceDir: string): string { return join(transactionDirectory(workspaceDir), JOURNAL_FILE); }
function workspaceRoot(workspaceDir: string): string { return resolveSymlinkFreePath(workspaceDir, "Workspace transaction path"); }
function isNonce(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value); }
function isEntry(value: unknown): value is ManagedEntry { return typeof value === "string" && (ENTRIES as readonly string[]).includes(value); }
function isPendingMove(value: unknown): value is PendingMove { return typeof value === "object" && value !== null && !Array.isArray(value) && isEntry((value as Partial<PendingMove>).entry) && ["backup", "install", "restore"].includes((value as Partial<PendingMove>).direction ?? ""); }
function isAlreadyExists(error: unknown): boolean { return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST"; }
function hasCompleteManagedSurface(workspaceDir: string): boolean { return ENTRIES.every((entry) => existsSync(join(workspaceDir, entry))); }
function syncDirectory(path: string): void {
  if (process.platform === "win32") return;
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_DIRECTORY);
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
}
