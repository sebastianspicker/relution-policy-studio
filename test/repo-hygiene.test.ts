import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";

test("project-managed trees do not contain local OS or Python cache artifacts", () => {
  const unwantedArtifacts = findUnwantedArtifacts(resolve("."));
  assert.deepEqual(unwantedArtifacts, []);
});

function findUnwantedArtifacts(root: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stats = statSync(path);
    if (stats.isDirectory() && shouldSkipDirectory(entry)) {
      continue;
    }
    if (stats.isDirectory()) {
      if (entry === "__pycache__") {
        found.push(relative(resolve("."), path));
        continue;
      }
      found.push(...findUnwantedArtifacts(path));
      continue;
    }
    if (entry === ".DS_Store" || entry.endsWith(".pyc")) {
      found.push(relative(resolve("."), path));
    }
  }
  return found.sort();
}

function shouldSkipDirectory(entry: string): boolean {
  return entry === ".git" || entry === "node_modules" || entry === "dist" || entry === "dist-web" || entry === ".rexp-editor" || entry === "private";
}
