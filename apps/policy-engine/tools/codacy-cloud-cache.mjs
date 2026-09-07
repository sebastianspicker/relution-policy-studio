// Supports local Codacy Cloud cache and configuration workflows.
import {
  existsSync,
  lstatSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";

/** Remove Python bytecode caches so analyzer output cannot dirty the public candidate tree. */
export function cleanPythonCaches() {
  for (const root of ["tests", "tools"]) {
    if (!existsSync(root)) {
      continue;
    }
    const rootStat = lstatSync(root);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
      continue;
    }
    removePycacheDirs(root);
  }
}

/** Remove nested __pycache__ directories without following filesystem symlinks. */
function removePycacheDirs(path) {
  for (const entry of readdirSync(path)) {
    const child = join(path, entry);
    const stat = lstatSync(child);
    if (stat.isSymbolicLink()) {
      continue;
    }
    if (stat.isDirectory() && entry === "__pycache__") {
      rmSync(child, { recursive: true, force: true });
      continue;
    }
    if (stat.isDirectory()) {
      removePycacheDirs(child);
    }
  }
}
