import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import { loadTemplateBundle } from "../src/templates.js";
import { createNewWorkspace, loadWorkspace, saveWorkspace } from "../src/workspace.js";

test("saveWorkspace preserves the previous workspace when serialization fails mid-save", () => {
  const bundle = loadTemplateBundle();
  const workspaceDir = mkdtempSync(join(tmpdir(), "relution-workspace-atomic-save-"));
  const original = createNewWorkspace({
    workspace: workspaceDir,
    platform: "IOS",
    name: "Atomic Save Test",
    serverVersion: bundle.serverVersion,
  });
  const invalidWorkspace = structuredClone(original);
  const report = invalidWorkspace.report as Record<string, unknown>;
  report.self = report;

  assert.throws(() => saveWorkspace(workspaceDir, invalidWorkspace), /circular|cyclic/i);
  assert.deepEqual(loadWorkspace(workspaceDir), original);
});

test("loadWorkspace rejects symlinked managed files", () => {
  const bundle = loadTemplateBundle();
  const workspaceDir = mkdtempSync(join(tmpdir(), "relution-workspace-load-symlink-"));
  createNewWorkspace({
    workspace: workspaceDir,
    platform: "IOS",
    name: "Load Symlink Test",
    serverVersion: bundle.serverVersion,
  });

  const outsidePath = join(workspaceDir, "..", "outside-report.json");
  writeFileSync(outsidePath, "{}\n");
  rmSync(join(workspaceDir, "report.json"));
  symlinkSync(outsidePath, join(workspaceDir, "report.json"));

  assert.throws(() => loadWorkspace(workspaceDir), /symlink/i);
});

test("saveWorkspace rejects symlinked managed files that point outside the workspace", () => {
  const bundle = loadTemplateBundle();
  const workspaceDir = mkdtempSync(join(tmpdir(), "relution-workspace-save-symlink-"));
  const original = createNewWorkspace({
    workspace: workspaceDir,
    platform: "IOS",
    name: "Save Symlink Test",
    serverVersion: bundle.serverVersion,
  });

  const outsidePath = join(workspaceDir, "..", "outside-metadata.json");
  writeFileSync(outsidePath, "{\"outside\":true}\n");
  rmSync(join(workspaceDir, "metadata.json"));
  symlinkSync(outsidePath, join(workspaceDir, "metadata.json"));

  assert.throws(() => saveWorkspace(workspaceDir, original), /symlink/i);
  assert.equal(readFileSync(outsidePath, "utf8"), "{\"outside\":true}\n");
});
