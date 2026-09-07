/** Rejects symlink traversal for resolved file-operation paths. */
import { realpathSync } from "node:fs";
import { join, parse, relative, resolve, sep } from "node:path";
import { lstatIfPresent } from "./filesystem.js";

export function assertNoSymlinkPath(rootPath: string, relativePath: string, label: string): void {
  const resolvedRoot = resolveSymlinkFreePath(rootPath, label);
  assertNoSymlinkSegments(resolvedRoot, relativePath, label, relativePath);
}

/** Resolve a path for mutation after rejecting user-controlled symlink ancestors. */
export function resolveSymlinkFreePath(path: string, label: string): string {
  const absolutePath = normalizeDarwinRootAlias(resolve(path));
  const root = parse(absolutePath).root;
  assertNoSymlinkSegments(root, relative(root, absolutePath), label, path);
  return absolutePath;
}

function assertNoSymlinkSegments(root: string, path: string, label: string, displayedPath: string): void {
  let current = root;
  for (const segment of path.split(/[\\/]/u).filter((part) => part.length > 0)) {
    current = join(current, segment);
    const stats = lstatIfPresent(current);
    if (stats === undefined) break;
    if (stats.isSymbolicLink()) throw new Error(`${label} must not use symlinks: ${displayedPath}`);
  }
}

function normalizeDarwinRootAlias(path: string): string {
  if (process.platform !== "darwin") return path;
  for (const [alias, expectedTarget] of [["/var", "/private/var"], ["/tmp", "/private/tmp"]] as const) {
    if (path !== alias && !path.startsWith(`${alias}${sep}`)) continue;
    let actualTarget: string;
    try {
      actualTarget = realpathSync.native(alias);
    } catch {
      return path;
    }
    if (actualTarget !== expectedTarget) return path;
    return resolve(expectedTarget, relative(alias, path));
  }
  return path;
}
