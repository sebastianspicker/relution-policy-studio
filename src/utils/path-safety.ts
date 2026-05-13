import { existsSync, lstatSync } from "node:fs";
import { join, resolve } from "node:path";

export function assertNoSymlinkPath(rootPath: string, relativePath: string, label: string): void {
  const resolvedRoot = resolve(rootPath);
  if (existsSync(resolvedRoot) && lstatSync(resolvedRoot).isSymbolicLink()) {
    throw new Error(`${label} must not use symlinks: ${rootPath}`);
  }

  let current = resolvedRoot;
  for (const segment of relativePath.split(/[\\/]/u).filter((part) => part.length > 0)) {
    current = join(current, segment);
    if (!existsSync(current)) {
      break;
    }
    if (lstatSync(current).isSymbolicLink()) {
      throw new Error(`${label} must not use symlinks: ${relativePath}`);
    }
  }
}
