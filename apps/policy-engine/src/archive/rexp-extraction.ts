/** Materializes a fully validated REXP archive through a recoverable workspace swap. */
import {
  chmodSync,
  closeSync,
  constants,
  cpSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  renameSync,
  rmSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { createPrivateDirectoryExclusive, writePrivateFileAtomic } from "../platform/filesystem/atomic-private-file.js";
import { readBoundedRegularFileNoFollow } from "../platform/filesystem/bounded-file-read.js";
import { lstatIfPresent } from "../platform/filesystem/filesystem.js";
import { assertNoSymlinkPath, resolveSymlinkFreePath } from "../platform/filesystem/path-safety.js";
import { decryptRelutionPayload, formatJsonBuffer, parseJson } from "./rexp-crypto.js";
import { decryptHashMap, getRequiredEntry, policyEntries, validateArchiveJson } from "./rexp-archive-validation.js";
import { assertArchiveEntryHashes } from "./rexp-archive-hashes.js";
import { readRexpEntries } from "./rexp-archive-reader.js";
import { type ExtractOptions, HASHES_JSON, MANAGED_PROJECT_PATHS, METADATA_JSON, REPORT_JSON } from "./rexp-format.js";
import { listDirectoryNames, resolveManagedProjectPath, writeProjectFile } from "./rexp-project.js";
import type { ZipEntry } from "./zip.js";

const TRANSACTION_SUFFIX = ".rexp-extraction-transaction";
const JOURNAL_FILE = "journal.json";
const STAGING_DIRECTORY = "workspace";
const BACKUP_DIRECTORY = "previous-workspace";
const REPLACEMENT_DIRECTORY = "replacement-workspace";

type Phase = "initializing" | "prepared" | "previous-published" | "replacement-published"
  | "rolling-back" | "rollback-replacement-unpublished" | "rollback-restoring-previous"
  | "rollback-previous-restored" | "rolled-back" | "complete";
interface Journal { readonly version: 1; phase: Phase; }
type InterruptionPoint = Exclude<Phase, "complete"> | "transaction-created"
  | "before-rollback-replacement-rename" | "after-rollback-replacement-rename"
  | "before-rollback-previous-restore-rename" | "after-rollback-previous-restore-rename"
  | "before-rollback-cleanup" | "after-rollback-cleanup";
type InterruptionHook = (phase: InterruptionPoint) => void;

/** Extracts an authenticated REXP archive, recovering an interrupted prior extraction first. */
export function extractRexp(filePath: string, outputDir: string, password: string, options: ExtractOptions = {}): void {
  const output = resolveSymlinkFreePath(outputDir, "Output path");
  recoverInterruptedExtraction(output);
  const entries = readRexpEntries(filePath);
  const hashes = decryptHashMap(entries, password);
  assertArchiveEntryHashes(entries, hashes);
  validateArchiveJson(entries, password);
  replaceManagedProjectSurface(output, materializeProject(entries, hashes, password, options.pretty), options.force === true, interruptionHook(options));
}

function materializeProject(entries: ZipEntry[], hashes: Record<string, string>, password: string, pretty: boolean | undefined): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  files.set(METADATA_JSON, formattedOrOriginal(getRequiredEntry(entries, METADATA_JSON).data, METADATA_JSON, pretty));
  files.set(REPORT_JSON, formattedOrOriginal(getRequiredEntry(entries, REPORT_JSON).data, REPORT_JSON, pretty));
  files.set(HASHES_JSON, formatJsonBuffer(Buffer.from(JSON.stringify(hashes), "utf8"), HASHES_JSON));
  for (const entry of policyEntries(entries)) files.set(entry.name, formattedOrOriginal(decryptRelutionPayload(entry.data, password), entry.name, pretty));
  return files;
}

function formattedOrOriginal(data: Buffer, label: string, pretty: boolean | undefined): Buffer {
  parseJson(data, label);
  return pretty === true ? formatJsonBuffer(data, label) : data;
}

function replaceManagedProjectSurface(output: string, files: Map<string, Buffer>, force: boolean, afterPhase: InterruptionHook | undefined): void {
  assertSafeExtractionDestination(output, force);
  mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
  const transaction = transactionPath(output);
  assertNoSymlinkPath(dirname(output), basename(transaction), "Extraction transaction path");
  createPrivateDirectoryExclusive(transaction, "Extraction transaction path");
  afterPhase?.("transaction-created");
  let journaled = false;
  try {
    installStagedProject(transaction, output, files, afterPhase);
    journaled = true;
  } finally {
    if (!journaled && lstatIfPresent(transaction) !== undefined && lstatIfPresent(join(transaction, JOURNAL_FILE)) === undefined) removeTransactionDirectory(transaction);
  }
}

function installStagedProject(transaction: string, output: string, files: Map<string, Buffer>, afterPhase: InterruptionHook | undefined): void {
  const staging = join(transaction, STAGING_DIRECTORY);
  const backup = join(transaction, BACKUP_DIRECTORY);
  const hadOutput = lstatIfPresent(output) !== undefined;
  let previousPublished = false;
  try {
    writeJournal(transaction, { version: 1, phase: "initializing" });
    afterPhase?.("initializing");
    stageProject(staging, output, files, hadOutput);
    const journal: Journal = { version: 1, phase: "prepared" };
    writeJournal(transaction, journal);
    afterPhase?.("prepared");
    if (hadOutput) {
      assertOutputPath(output);
      renameSync(output, backup);
      fsyncDirectory(dirname(output));
      previousPublished = true;
      journal.phase = "previous-published";
      writeJournal(transaction, journal);
      afterPhase?.("previous-published");
    }
    assertNoSymlinkPath(transaction, STAGING_DIRECTORY, "Extraction staging path");
    renameSync(staging, output);
    fsyncDirectory(output);
    fsyncDirectory(dirname(output));
    journal.phase = "replacement-published";
    writeJournal(transaction, journal);
    afterPhase?.("replacement-published");
    journal.phase = "complete";
    writeJournal(transaction, journal);
    removeTransactionDirectory(transaction);
  } catch (error) {
    rollbackFailedInstallation(transaction, output, hadOutput, previousPublished, error, afterPhase);
  }
}

function stageProject(staging: string, output: string, files: Map<string, Buffer>, hadOutput: boolean): void {
  if (hadOutput) {
    assertSafeExtractionDestination(output, true);
    cpSync(output, staging, { recursive: true, dereference: false });
  } else mkdirSync(staging, { mode: 0o700 });
  chmodSync(staging, 0o700);
  for (const path of MANAGED_PROJECT_PATHS) rmSync(resolveManagedProjectPath(staging, path), { recursive: true, force: true });
  for (const [path, data] of files) writeProjectFile(staging, path, data);
  fsyncTree(staging);
}

function rollbackFailedInstallation(
  transaction: string, output: string, hadOutput: boolean, previousPublished: boolean, originalError: unknown,
  afterPhase: InterruptionHook | undefined,
): never {
  const failures: unknown[] = [originalError];
  const restoringPrevious = hadOutput && (previousPublished || lstatIfPresent(join(transaction, BACKUP_DIRECTORY)) !== undefined);
  const journal: Journal = { version: 1, phase: restoringPrevious ? "rolling-back" : "complete" };
  try {
    writeJournal(transaction, journal);
    if (restoringPrevious) afterPhase?.("rolling-back");
  } catch (error) { failures.push(error); }
  if (restoringPrevious) {
    try { restorePreviousWorkspace(transaction, output, journal, afterPhase); }
    catch (error) { failures.push(error); }
  }
  if (failures.length === 1) {
    try {
      if (restoringPrevious) {
        verifyRestoredWorkspace(output);
        journal.phase = "rolled-back";
        writeJournal(transaction, journal);
        afterPhase?.("rolled-back");
        afterPhase?.("before-rollback-cleanup");
      }
      removeTransactionDirectory(transaction);
      if (restoringPrevious) afterPhase?.("after-rollback-cleanup");
    } catch (error) { failures.push(error); }
  }
  if (failures.length === 1) throw originalError;
  throw new AggregateError(failures, `Failed to install extracted workspace and restore the original; recover it from ${join(transaction, BACKUP_DIRECTORY)}`);
}

function recoverInterruptedExtraction(output: string): void {
  const transaction = transactionPath(output);
  const transactionStats = lstatIfPresent(transaction);
  if (transactionStats === undefined) return;
  assertPrivateTransactionDirectory(transaction);
  if (lstatIfPresent(join(transaction, JOURNAL_FILE)) === undefined) {
    removeUnjournaledTransactionDirectory(transaction);
    return;
  }
  const journal = readJournal(transaction);
  const backup = join(transaction, BACKUP_DIRECTORY);
  const outputExists = lstatIfPresent(output) !== undefined;
  const backupExists = lstatIfPresent(backup) !== undefined;
  if (isRollbackPhase(journal.phase)) {
    recoverRollback(transaction, output, journal);
    return;
  }
  if ((journal.phase === "initializing" || journal.phase === "prepared" || journal.phase === "previous-published") && backupExists && !outputExists) {
    assertNoSymlinkPath(transaction, BACKUP_DIRECTORY, "Extraction backup path");
    renameSync(backup, output);
    fsyncDirectory(dirname(output));
  } else if (!outputExists && (journal.phase === "initializing" || journal.phase === "prepared") && !backupExists) {
    writeJournal(transaction, { version: 1, phase: "complete" });
    removeTransactionDirectory(transaction);
    return;
  } else if (!outputExists && journal.phase !== "initializing" && journal.phase !== "prepared" && journal.phase !== "previous-published") {
    throw new Error(`Extraction recovery cannot find a published workspace: ${output}`);
  }
  assertOutputPath(output);
  fsyncDirectory(output);
  fsyncDirectory(dirname(output));
  writeJournal(transaction, { version: 1, phase: "complete" });
  removeTransactionDirectory(transaction);
}

function restorePreviousWorkspace(
  transaction: string, output: string, journal: Journal, afterPhase: InterruptionHook | undefined,
): void {
  const replacement = join(transaction, REPLACEMENT_DIRECTORY);
  const outputExists = lstatIfPresent(output) !== undefined;
  const backupExists = lstatIfPresent(join(transaction, BACKUP_DIRECTORY)) !== undefined;
  const replacementExists = lstatIfPresent(replacement) !== undefined;
  if (!backupExists) throw new Error(`Extraction rollback backup is missing: ${join(transaction, BACKUP_DIRECTORY)}`);
  if (outputExists) {
    if (replacementExists) throw new Error("Extraction rollback state is ambiguous: both live and replacement workspaces are present");
    assertOutputPath(output);
    assertNoSymlinkPath(transaction, REPLACEMENT_DIRECTORY, "Extraction replacement path");
    afterPhase?.("before-rollback-replacement-rename");
    renameSync(output, replacement);
    fsyncDirectory(dirname(output));
    fsyncDirectory(transaction);
    afterPhase?.("after-rollback-replacement-rename");
  } else if (replacementExists) {
    assertPrivateTransactionChildDirectory(transaction, REPLACEMENT_DIRECTORY, "Extraction replacement path");
  }
  journal.phase = "rollback-replacement-unpublished";
  writeJournal(transaction, journal);
  afterPhase?.("rollback-replacement-unpublished");
  journal.phase = "rollback-restoring-previous";
  writeJournal(transaction, journal);
  afterPhase?.("rollback-restoring-previous");
  if (lstatIfPresent(output) !== undefined) throw new Error("Extraction rollback state is ambiguous: a live workspace remains before restoration");
  assertPrivateTransactionChildDirectory(transaction, BACKUP_DIRECTORY, "Extraction backup path");
  afterPhase?.("before-rollback-previous-restore-rename");
  renameSync(join(transaction, BACKUP_DIRECTORY), output);
  fsyncDirectory(dirname(output));
  fsyncDirectory(transaction);
  afterPhase?.("after-rollback-previous-restore-rename");
  journal.phase = "rollback-previous-restored";
  writeJournal(transaction, journal);
  afterPhase?.("rollback-previous-restored");
}

function recoverRollback(transaction: string, output: string, journal: Journal): void {
  const backup = join(transaction, BACKUP_DIRECTORY);
  const replacement = join(transaction, REPLACEMENT_DIRECTORY);
  const outputExists = lstatIfPresent(output) !== undefined;
  const backupExists = lstatIfPresent(backup) !== undefined;
  const replacementExists = lstatIfPresent(replacement) !== undefined;
  if (journal.phase === "rolling-back") {
    if (!backupExists) throw new Error(`Extraction rollback backup is missing: ${backup}`);
    if (outputExists && replacementExists) throw new Error("Extraction rollback state is ambiguous: both live and replacement workspaces are present");
    restorePreviousWorkspace(transaction, output, journal, undefined);
  } else if (journal.phase === "rollback-replacement-unpublished") {
    if (outputExists || !backupExists) throw new Error("Extraction rollback state is inconsistent after replacement removal");
    restorePreviousWorkspace(transaction, output, journal, undefined);
  } else if (journal.phase === "rollback-restoring-previous") {
    if (backupExists === outputExists) throw new Error("Extraction rollback state is ambiguous while restoring the previous workspace");
    if (backupExists) restorePreviousWorkspace(transaction, output, journal, undefined);
  } else if (journal.phase === "rollback-previous-restored" || journal.phase === "rolled-back") {
    if (!outputExists || backupExists) throw new Error("Extraction rollback state is inconsistent after previous-workspace restoration");
  }
  verifyRestoredWorkspace(output);
  journal.phase = "rolled-back";
  writeJournal(transaction, journal);
  removeTransactionDirectory(transaction);
}

function isRollbackPhase(phase: Phase): boolean {
  return phase === "rolling-back" || phase === "rollback-replacement-unpublished" || phase === "rollback-restoring-previous"
    || phase === "rollback-previous-restored" || phase === "rolled-back";
}

function verifyRestoredWorkspace(output: string): void {
  assertOutputPath(output);
  assertSafeExtractionDestination(output, true);
  fsyncDirectory(output);
  fsyncDirectory(dirname(output));
}

function writeJournal(transaction: string, journal: Journal): void {
  assertPrivateTransactionDirectory(transaction);
  writePrivateFileAtomic(join(transaction, JOURNAL_FILE), Buffer.from(`${JSON.stringify(journal)}\n`, "utf8"), { force: true, label: "Extraction journal" });
}

function readJournal(transaction: string): Journal {
  const journalPath = join(transaction, JOURNAL_FILE);
  assertNoSymlinkPath(transaction, JOURNAL_FILE, "Extraction journal");
  const stats = lstatIfPresent(journalPath);
  if (stats === undefined || !stats.isFile()) throw new Error(`Extraction journal must be a regular file: ${journalPath}`);
  if ((stats.mode & 0o777) !== 0o600) throw new Error(`Extraction journal must be private: ${journalPath}`);
  let parsed: unknown;
  try { parsed = JSON.parse(readBoundedRegularFileNoFollow(journalPath, { label: "Extraction journal", maxBytes: 16 * 1024 }).toString("utf8")) as unknown; }
  catch { throw new Error("Extraction journal is invalid"); }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("Extraction journal is invalid");
  const journal = parsed as Partial<Journal>;
  if (journal.version !== 1 || !["initializing", "prepared", "previous-published", "replacement-published", "rolling-back", "rollback-replacement-unpublished", "rollback-restoring-previous", "rollback-previous-restored", "rolled-back", "complete"].includes(journal.phase ?? "")) throw new Error("Extraction journal is invalid");
  return journal as Journal;
}

function removeTransactionDirectory(transaction: string): void {
  if (lstatIfPresent(transaction) === undefined) return;
  assertPrivateTransactionDirectory(transaction);
  rmSync(transaction, { recursive: true, force: true });
  fsyncDirectory(dirname(transaction));
}

function removeUnjournaledTransactionDirectory(transaction: string): void {
  assertPrivateTransactionDirectory(transaction);
  assertNoSymlinkTree(transaction);
  rmSync(transaction, { recursive: true, force: true });
  fsyncDirectory(dirname(transaction));
}

function transactionPath(output: string): string { return join(dirname(output), `.${basename(output)}${TRANSACTION_SUFFIX}`); }

function assertPrivateTransactionDirectory(transaction: string): void {
  assertNoSymlinkPath(dirname(transaction), basename(transaction), "Extraction transaction path");
  const stats = lstatIfPresent(transaction);
  if (stats === undefined || !stats.isDirectory()) throw new Error(`Extraction transaction path must be a directory: ${transaction}`);
  if ((stats.mode & 0o777) !== 0o700) throw new Error(`Extraction transaction path must be private: ${transaction}`);
}

function assertPrivateTransactionChildDirectory(transaction: string, name: string, label: string): void {
  assertNoSymlinkPath(transaction, name, label);
  const path = join(transaction, name);
  const stats = lstatIfPresent(path);
  if (stats === undefined || !stats.isDirectory()) throw new Error(`${label} must be a directory: ${path}`);
}

function assertNoSymlinkTree(directory: string): void {
  for (const name of listDirectoryNames(directory)) {
    assertNoSymlinkPath(directory, name, "Extraction transaction path");
    const child = join(directory, name);
    if (lstatSync(child).isDirectory()) assertNoSymlinkTree(child);
  }
}

function assertOutputPath(output: string): void {
  assertNoSymlinkPath(output, "", "Output path");
  const stats = lstatIfPresent(output);
  if (stats === undefined || !stats.isDirectory()) throw new Error(`Output path must be a directory: ${output}`);
}

function assertSafeExtractionDestination(output: string, force: boolean): void {
  assertNoSymlinkPath(output, "", "Output path");
  if (!existsSync(output)) return;
  if (!lstatSync(output).isDirectory()) throw new Error(`Output path exists and is not a directory: ${output}`);
  for (const path of MANAGED_PROJECT_PATHS) assertNoSymlinkPath(output, path, "Output path");
  const policies = join(output, "policies");
  if (existsSync(policies)) for (const name of listDirectoryNames(policies)) assertNoSymlinkPath(output, `policies/${name}`, "Output path");
  if (!force && listDirectoryNames(output).length > 0) throw new Error(`Output directory is not empty: ${output}`);
}

function fsyncTree(path: string): void {
  const stats = lstatSync(path);
  if (stats.isSymbolicLink()) return;
  if (!stats.isDirectory()) {
    if (!stats.isFile()) throw new Error(`Extraction staging path must contain only files and directories: ${path}`);
    fsyncFile(path);
    return;
  }
  assertNoSymlinkPath(path, "", "Extraction staging path");
  for (const name of listDirectoryNames(path)) fsyncTree(join(path, name));
  fsyncDirectory(path);
}

function fsyncFile(path: string): void {
  if (process.platform === "win32") return;
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
}

function fsyncDirectory(path: string): void {
  if (process.platform === "win32") return;
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
}

function interruptionHook(options: ExtractOptions): InterruptionHook | undefined {
  return (options as ExtractOptions & { readonly testOnlyAfterPublication?: InterruptionHook }).testOnlyAfterPublication;
}
