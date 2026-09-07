/** Performs bounded, durable operations on the fixed editor-sidecar path. */
import { closeSync, constants, fstatSync, fsyncSync, openSync, unlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { writePrivateFileAtomic } from "../platform/filesystem/atomic-private-file.js";
import { readBoundedRegularFileNoFollow } from "../platform/filesystem/bounded-file-read.js";
import { lstatIfPresent } from "../platform/filesystem/filesystem.js";
import { assertNoSymlinkPath } from "../platform/filesystem/path-safety.js";
import { EDITOR_SIDECAR_FILE, MAX_EDITOR_SIDECAR_JSON_BYTES } from "./sidecar-types.js";

function resolveEditorSidecarPath(workspaceDir: string): string {
  assertNoSymlinkPath(workspaceDir, EDITOR_SIDECAR_FILE, "Workspace sidecar path");
  return join(resolve(workspaceDir), EDITOR_SIDECAR_FILE);
}

export function readEditorSidecarBytes(workspaceDir: string): Buffer | undefined {
  const path = resolveEditorSidecarPath(workspaceDir);
  const stat = regularSidecarStat(path);
  if (stat === undefined) return undefined;
  return readBoundedRegularFileNoFollow(path, {
    label: "Editor sidecar JSON file",
    maxBytes: MAX_EDITOR_SIDECAR_JSON_BYTES,
  });
}

export function writeEditorSidecarBytes(workspaceDir: string, data: Buffer): void {
  const path = resolveEditorSidecarPath(workspaceDir);
  if (data.length > MAX_EDITOR_SIDECAR_JSON_BYTES) {
    throw new Error(`Editor sidecar JSON file exceeds the ${String(MAX_EDITOR_SIDECAR_JSON_BYTES)} byte limit: ${path}`);
  }
  writePrivateFileAtomic(path, data, { force: true, label: "Workspace sidecar path" });
}

/** Removes only the fixed regular sidecar file and durably records the unlink. */
export function deleteEditorSidecarFile(workspaceDir: string): void {
  const path = resolveEditorSidecarPath(workspaceDir);
  const stat = regularSidecarStat(path);
  if (stat === undefined) return;
  ensureRegularNoFollow(path);
  unlinkSync(path);
  fsyncParent(path);
}

function regularSidecarStat(path: string) {
  const stat = lstatIfPresent(path);
  if (stat !== undefined && !stat.isFile()) throw new Error(`Editor sidecar path must be missing or a regular file: ${path}`);
  return stat;
}

function ensureRegularNoFollow(path: string): void {
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    if (!fstatSync(descriptor).isFile()) throw new Error(`Editor sidecar path must be a regular file: ${path}`);
  } finally {
    closeSync(descriptor);
  }
}

function fsyncParent(path: string): void {
  if (process.platform === "win32") return;
  const descriptor = openSync(dirname(path), constants.O_RDONLY | constants.O_DIRECTORY);
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}
