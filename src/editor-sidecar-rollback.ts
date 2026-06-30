import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { saveWorkspace, type PolicyWorkspace } from "./workspace.js";

export type SidecarPathState =
  | { kind: "missing" }
  | { kind: "directory" }
  | { kind: "file"; contents: string }
  | { kind: "symlink"; target: string };

export function captureSidecarState(workspaceDir: string): SidecarPathState {
  const path = join(workspaceDir, "editor-sidecar.json");
  if (!existsSync(path)) {
    return { kind: "missing" };
  }
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) {
    return { kind: "symlink", target: readlinkSync(path) };
  }
  if (stat.isDirectory()) {
    return { kind: "directory" };
  }
  return { kind: "file", contents: readFileSync(path, "utf8") };
}

function restoreSidecarState(workspaceDir: string, snapshot: SidecarPathState): void {
  const path = join(workspaceDir, "editor-sidecar.json");
  rmSync(path, { recursive: true, force: true });

  if (snapshot.kind === "missing") {
    return;
  }
  if (snapshot.kind === "directory") {
    mkdirSync(path, { recursive: true });
    return;
  }
  if (snapshot.kind === "symlink") {
    symlinkSync(snapshot.target, path);
    return;
  }
  writeFileSync(path, snapshot.contents);
}

export function rollbackPersistedEditorState(
  workspaceDir: string,
  previousWorkspace: PolicyWorkspace,
  previousSidecar: SidecarPathState,
  originalError: unknown,
): void {
  const rollbackErrors: string[] = [];

  try {
    saveWorkspace(workspaceDir, previousWorkspace);
  } catch (error) {
    rollbackErrors.push(`workspace rollback failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    restoreSidecarState(workspaceDir, previousSidecar);
  } catch (error) {
    rollbackErrors.push(`sidecar rollback failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (rollbackErrors.length > 0) {
    const originalMessage = originalError instanceof Error ? originalError.message : String(originalError);
    throw new Error(`${originalMessage}; ${rollbackErrors.join("; ")}`);
  }
}
