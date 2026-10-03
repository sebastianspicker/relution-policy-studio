/** Locates repository-level contract fixtures and schemas from the built test tree (dist/tests/<area>/), plus disposable roots. */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const ENGINE_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
export const REPO_ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));

export function readContractJson<T = unknown>(relativePath: string): T {
  return JSON.parse(readFileSync(new URL(`../../../../../contracts/${relativePath}`, import.meta.url), "utf8")) as T;
}

export function tempRoot(prefix: string): { readonly root: string; readonly cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), prefix));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
