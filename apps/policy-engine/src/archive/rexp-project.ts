/** Reads and writes the constrained extracted-project filesystem surface. */
import { chmodSync, existsSync, mkdirSync, opendirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { assertNoSymlinkPath } from "../platform/filesystem/path-safety.js";
import { readBoundedRegularFileNoFollow } from "../platform/filesystem/bounded-file-read.js";
import { isPolicyPath, policyPathCollisionKey } from "../workspace/policy-path.js";
import { MAX_REXP_POLICY_ENTRIES, MAX_REXP_TOTAL_UNCOMPRESSED_BYTES } from "./rexp-format.js";
import { assertManagedProjectPath } from "./rexp-paths.js";

export function listPolicyFiles(inputDir: string): string[] {
  const policiesDir = join(inputDir, "policies");
  if (!existsSync(policiesDir) || !statSync(policiesDir).isDirectory()) return [];
  assertNoSymlinkPath(inputDir, "policies", "Project path");
  const files = listDirectoryNames(policiesDir).filter((name) => name.startsWith("policy_") && name.endsWith(".json")).sort().map((name) => `policies/${name}`);
  if (files.length > MAX_REXP_POLICY_ENTRIES) throw new Error(`REXP archive supports at most ${String(MAX_REXP_POLICY_ENTRIES)} policy entries`);
  assertPolicyPaths(inputDir, files);
  return files;
}

export function readProjectFile(inputDir: string, relativePath: string): Buffer {
  assertNoSymlinkPath(inputDir, relativePath, "Project path");
  return readRegularFile(resolveManagedProjectPath(inputDir, relativePath), relativePath);
}

export function writeProjectFile(outputDir: string, relativePath: string, data: Buffer): void {
  const destination = resolveManagedProjectPath(outputDir, relativePath);
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
  chmodSync(dirname(destination), 0o700);
  writeFileSync(destination, data, { mode: 0o600 });
  chmodSync(destination, 0o600);
}

export function resolveManagedProjectPath(rootDir: string, relativePath: string): string {
  assertManagedProjectPath(relativePath);
  const root = resolve(rootDir);
  const candidate = resolve(root, relativePath);
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) throw new Error(`Project path resolves outside extraction root: ${relativePath}`);
  return candidate;
}

export function listDirectoryNames(path: string): string[] {
  const directory = opendirSync(path);
  const names: string[] = [];
  try { for (let entry = directory.readSync(); entry !== null; entry = directory.readSync()) names.push(entry.name); }
  finally { directory.closeSync(); }
  return names;
}

function assertPolicyPaths(inputDir: string, files: string[]): void {
  const seen = new Set<string>();
  for (const file of files) {
    if (!isPolicyPath(file)) throw new Error(`Project contains an invalid policy path: ${file}`);
    if (seen.has(policyPathCollisionKey(file))) throw new Error(`Project contains duplicate or colliding policy paths: ${file}`);
    seen.add(policyPathCollisionKey(file));
    assertNoSymlinkPath(inputDir, file, "Project path");
  }
}

function readRegularFile(path: string, label: string): Buffer {
  return readBoundedRegularFileNoFollow(resolve(path), { label, maxBytes: MAX_REXP_TOTAL_UNCOMPRESSED_BYTES });
}
