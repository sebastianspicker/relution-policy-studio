/** Fail-closed report directory management and private atomic-file primitives. */
import { chmodSync, closeSync, fsyncSync, lstatSync, mkdirSync, openSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join, relative } from "node:path";
import { isMissingPathError } from "../../platform/filesystem/filesystem.js";
import { resolveSymlinkFreePath } from "../../platform/filesystem/path-safety.js";
import { reportFile } from "./relution-report-storage.js";

export function secureRelutionReportDir(workspace: string, create = true): { workspaceRoot: string; reportDir: string | undefined } {
  const workspacePath = resolveSymlinkFreePath(workspace, "Relution report workspace path");
  if (!lstatSync(workspacePath).isDirectory()) throw new Error("Relution report workspace path must be a real directory");
  const workspaceRoot = realpathSync(workspacePath);
  const reportDir = join(workspaceRoot, "reports");
  if (!reportDirectoryExists(reportDir)) {
    if (!create) return { workspaceRoot, reportDir: undefined };
    mkdirSync(reportDir, { recursive: true, mode: 0o700 });
  }
  const resolvedReportDir = realpathSync(reportDir);
  if (relative(workspaceRoot, resolvedReportDir) !== "reports") throw new Error("Relution report directory escaped the workspace");
  chmodSync(resolvedReportDir, 0o700);
  return { workspaceRoot, reportDir: resolvedReportDir };
}

export function writePrivateTemporaryFile(reportDir: string, name: string, contents: string): string {
  const temporary = reportFile(reportDir, `.${name}.${randomUUID()}.tmp`);
  let descriptor: number | undefined;
  try {
    descriptor = openSync(temporary, "wx", 0o600);
    writeFileSync(descriptor, contents, "utf8");
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    return temporary;
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    removeReportFile(temporary);
    throw error;
  }
}

export function removeReportFile(path: string): void {
  try {
    unlinkSync(path);
  } catch (error) {
    if (!isMissingPathError(error)) throw error;
  }
}

function reportDirectoryExists(reportDir: string): boolean {
  try {
    const stats = lstatSync(reportDir);
    if (stats.isSymbolicLink() || !stats.isDirectory()) throw new Error("Relution report directory must be a real directory inside the workspace");
    return true;
  } catch (error) {
    if (isMissingPathError(error)) return false;
    throw error;
  }
}
