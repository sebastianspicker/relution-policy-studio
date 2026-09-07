/** Lists a directory tree deterministically without following directory symlinks. */
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

export function listFilesRecursively(path: string): string[] {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true })
    .flatMap((entry) => entry.isDirectory()
      ? listFilesRecursively(resolve(path, entry.name))
      : [resolve(path, entry.name)])
    .sort();
}
