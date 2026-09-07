/** Namespaces for project files and authenticated archive hash entries. */
import { isPolicyPath } from "../workspace/policy-path.js";
import { HASHES_JSON, METADATA_JSON, REPORT_JSON } from "./rexp-format.js";

function isManagedProjectPath(path: string): boolean {
  return path === METADATA_JSON || path === REPORT_JSON || path === HASHES_JSON || path === "policies" || isPolicyPath(path);
}

function isHashManagedProjectPath(path: string): boolean {
  return path === METADATA_JSON || path === REPORT_JSON || isPolicyPath(path);
}

export function assertManagedProjectPath(path: string): void {
  assertAllowedPath(path, isManagedProjectPath, "Project path resolves outside extraction root or managed surface");
}

export function assertHashManagedProjectPath(path: string): void {
  assertAllowedPath(path, isHashManagedProjectPath, "Archive hash map references path outside extraction root or managed surface");
}

function assertAllowedPath(path: string, allowed: (candidate: string) => boolean, prefix: string): void {
  if (!allowed(path)) throw new Error(`${prefix}: ${path}`);
}
