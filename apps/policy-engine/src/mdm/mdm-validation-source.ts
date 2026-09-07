/** Loads MDM policy sources and verifies cached source-document integrity. */
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { MdmPolicySource, MdmSourceManifestEntry, MdmValidationIssue } from "./mdm-types.js";
import { SOURCE_MANIFEST, error, loadJson, loadYaml, sha256 } from "./mdm-validation-data.js";
import { listFilesRecursively } from "../platform/filesystem/file-inventory.js";

const SOURCE_CACHE_DIRECTORY = "private/source-pdfs-cache";

export interface SourceManifest {
  sources: MdmSourceManifestEntry[];
}

export function loadMdmPolicySources(root = process.cwd()): Array<{ path: string; source: MdmPolicySource }> {
  const policyRoot = resolve(root, "mdm/policies");
  return listFilesRecursively(policyRoot)
    .filter((path) => /\.ya?ml$/u.test(path))
    .map((path) => loadPolicySource(root, path));
}

function loadPolicySource(root: string, path: string): { path: string; source: MdmPolicySource } {
  const relativePath = relative(root, path);
  if (lstatSync(path).isSymbolicLink()) throw new Error(`MDM policy source must not use symlinks: ${relativePath}`);
  return { path: relativePath, source: loadYaml<MdmPolicySource>(path) };
}

export function loadMdmSourceManifest(root = process.cwd()): SourceManifest {
  return loadJson<SourceManifest>(resolve(root, SOURCE_MANIFEST));
}

export function verifyMdmSources(root = process.cwd()): MdmValidationIssue[] {
  const issues: MdmValidationIssue[] = [];
  const seen = new Set<string>();
  for (const source of loadMdmSourceManifest(root).sources) {
    verifyMdmSource(root, source, seen, issues);
  }
  return issues;
}

function verifyMdmSource(root: string, source: MdmSourceManifestEntry, seen: Set<string>, issues: MdmValidationIssue[]): void {
  if (seen.has(source.id)) issues.push(error(SOURCE_MANIFEST, `duplicate source ID ${source.id}`));
  seen.add(source.id);
  const path = sourceDocumentPath(root, source.local_path);
  if (path === undefined || !existsSync(path)) {
    issues.push(error(source.local_path, path === undefined ? "source must be a regular file in the ignored PDF cache" : `required source is missing (${source.title})`));
    return;
  }
  const stats = lstatSync(path);
  if (stats.isSymbolicLink() || !stats.isFile()) {
    issues.push(error(source.local_path, "source must be a regular file in the ignored PDF cache"));
    return;
  }
  verifySourceDigest(source, path, issues);
  if (source.extraction.status !== "extracted" || source.extraction.pages === null || source.extraction.text_sha256 === null) {
    issues.push(error(source.local_path, `source extraction state is ${source.extraction.status}`));
  }
}

function sourceDocumentPath(root: string, localPath: string): string | undefined {
  const cacheRoot = resolve(root, SOURCE_CACHE_DIRECTORY);
  const path = resolve(root, localPath);
  const fromCache = relative(cacheRoot, path);
  return fromCache.length > 0 && !fromCache.startsWith(`..${sep}`) && fromCache !== ".." && !isAbsolute(fromCache) ? path : undefined;
}

function verifySourceDigest(source: MdmSourceManifestEntry, path: string, issues: MdmValidationIssue[]): void {
  const actual = sha256(readFileSync(path));
  if (source.sha256 === null || actual !== source.sha256) {
    issues.push(error(source.local_path, `SHA-256 mismatch: expected ${String(source.sha256)}, got ${actual}`));
  }
}
