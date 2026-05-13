import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const MAX_CODE_LINES_EXCLUSIVE = 720;
const CODE_ROOTS = ["src", "web/src", "test"] as const;
const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".py", ".mjs", ".css"]);
const SKIPPED_DIRECTORIES = new Set([".git", "node_modules", "dist", "dist-web", ".rexp-editor", "__pycache__"]);

test("code files stay below the hard line budget", () => {
  const oversized = CODE_ROOTS.flatMap((root) => codeFiles(resolve(root)))
    .map((path) => ({ path: relative(resolve("."), path), lines: lineCount(path) }))
    .filter((entry) => entry.lines >= MAX_CODE_LINES_EXCLUSIVE)
    .sort((left, right) => right.lines - left.lines || left.path.localeCompare(right.path));

  assert.deepEqual(oversized, []);
});

test("split Python tool modules use function-oriented names", () => {
  const opaqueModuleFiles = codeFiles(resolve("tools"))
    .map((path) => relative(resolve("."), path))
    .filter((path) => /(^|\/)part_\d+\.py$/u.test(path) || /(^|\/)_.*_parts\//u.test(path))
    .sort();

  assert.deepEqual(opaqueModuleFiles, []);
});

function codeFiles(root: string): string[] {
  const stats = statSync(root);
  if (!stats.isDirectory()) {
    return [];
  }
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    const childStats = statSync(path);
    if (childStats.isDirectory()) {
      return SKIPPED_DIRECTORIES.has(entry) ? [] : codeFiles(path);
    }
    return CODE_EXTENSIONS.has(extension(entry)) ? [path] : [];
  });
}

function lineCount(path: string): number {
  return readFileSync(path, "utf8").split(/\r?\n/u).length;
}

function extension(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot === -1 ? "" : path.slice(dot);
}
