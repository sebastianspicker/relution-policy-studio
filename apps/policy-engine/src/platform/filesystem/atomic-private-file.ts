/** Writes private files atomically with restrictive ownership and permissions. */
import { randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  fsyncSync,
  linkSync,
  mkdirSync,
  openSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { isMissingPathError, lstatIfPresent } from "./filesystem.js";
import { resolveSymlinkFreePath } from "./path-safety.js";

/** fsyncs a private temporary file before atomically publishing its final name. */
export function writePrivateFileAtomic(
  outputPath: string,
  data: Buffer,
  options: { readonly force: boolean; readonly label: string },
): string {
  const resolvedOutput = resolveSymlinkFreePath(outputPath, options.label);
  const existing = lstatIfPresent(resolvedOutput);
  if (existing !== undefined && !existing.isFile()) {
    throw new Error(`${options.label} exists and is not a regular file: ${outputPath}`);
  }
  if (existing !== undefined && !options.force) {
    throw Object.assign(new Error(`${options.label} already exists: ${outputPath}`), { code: "EEXIST" });
  }

  const parent = dirname(resolvedOutput);
  createDirectoriesDurably(parent);
  const temporary = join(parent, `.${basename(resolvedOutput)}.${randomUUID()}.tmp`);
  let descriptor: number | undefined;
  let linkedOutput = false;
  try {
    descriptor = openSync(temporary, "wx", 0o600);
    writeFileSync(descriptor, data);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    if (options.force) {
      renameSync(temporary, resolvedOutput);
      fsyncDirectory(parent);
    } else {
      linkSync(temporary, resolvedOutput);
      linkedOutput = true;
      fsyncDirectory(parent);
      unlinkSync(temporary);
      fsyncDirectory(parent);
    }
    return resolvedOutput;
  } catch (error) {
    const cleanupErrors = cleanUpFailedPrivateFileWrite(error, { descriptor, linkedOutput, resolvedOutput, temporary });
    if (cleanupErrors.length > 1) throw new AggregateError(cleanupErrors, `Failed to write and clean up ${options.label}`);
    throw error;
  }
}

/** Closes and removes unpublished output after a failed atomic write. */
function cleanUpFailedPrivateFileWrite(
  error: unknown,
  failedWrite: {
    readonly descriptor: number | undefined;
    readonly linkedOutput: boolean;
    readonly resolvedOutput: string;
    readonly temporary: string;
  },
): unknown[] {
  if (failedWrite.descriptor !== undefined) closeSync(failedWrite.descriptor);
  const cleanupErrors: unknown[] = [error];
  if (failedWrite.linkedOutput) removeFailedPrivateFileWritePath(failedWrite.resolvedOutput, cleanupErrors);
  removeFailedPrivateFileWritePath(failedWrite.temporary, cleanupErrors);
  return cleanupErrors;
}

/** Adds a cleanup failure unless the path was already absent. */
function removeFailedPrivateFileWritePath(path: string, cleanupErrors: unknown[]): void {
  try {
    unlinkSync(path);
  } catch (cleanupError) {
    if (!isMissingPathError(cleanupError)) cleanupErrors.push(cleanupError);
  }
}

/** Creates a mode-0700 directory without silently reusing an existing path. */
export function createPrivateDirectoryExclusive(path: string, label: string): string {
  const resolved = resolveSymlinkFreePath(path, label);
  const parent = dirname(resolved);
  createDirectoriesDurably(parent);
  mkdirSync(resolved, { mode: 0o700 });
  fsyncDirectory(parent);
  return resolved;
}

export function removeEmptyPrivateDirectoryDurably(path: string, label: string): void {
  const resolved = resolveSymlinkFreePath(path, label);
  const parent = dirname(resolved);
  rmdirSync(resolved);
  fsyncDirectory(parent);
}

function createDirectoriesDurably(path: string): void {
  const missing: string[] = [];
  let current = path;
  while (lstatIfPresent(current) === undefined) {
    missing.push(current);
    const next = dirname(current);
    if (next === current) break;
    current = next;
  }
  mkdirSync(path, { recursive: true, mode: 0o700 });
  for (const created of missing.reverse()) {
    fsyncDirectory(created);
    fsyncDirectory(dirname(created));
  }
}

function fsyncDirectory(path: string): void {
  if (process.platform === "win32") return;
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_DIRECTORY);
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}
