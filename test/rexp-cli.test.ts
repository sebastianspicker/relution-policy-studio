import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import test from "node:test";
import { makeTempDir } from "./rexp-helpers.js";

test("serve creates a blank workspace and does not require an encryption key", () => {
  const root = makeTempDir("relution-cli");
  const workspace = join(root, "workspace");
  const out = join(root, "out.rexp");
  const result = spawnSync(
    process.execPath,
    ["dist/src/cli.js", "serve", "--workspace", workspace, "--out", out, "--port", "0", "--once"],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.equal(existsSync(join(workspace, "metadata.json")), true, "serve should create workspace metadata");
  assert.equal(existsSync(join(workspace, "report.json")), true, "serve should create workspace report");
  assert.match(result.stdout, /Created workspace/u, "serve should report workspace creation");
  assert.match(result.stdout, /Key: not set/u, "serve without key should report key state");
});

test("serve package smoke works outside the repo cwd", () => {
  const packageRoot = resolve(".");
  const foreignCwd = makeTempDir("relution-cli-cwd");
  const root = makeTempDir("relution-cli");
  const workspace = join(root, "workspace");
  const out = join(root, "out.rexp");
  const result = spawnSync(
    process.execPath,
    [resolve(packageRoot, "dist/src/cli.js"), "serve", "--workspace", workspace, "--out", out, "--port", "0", "--once"],
    {
      cwd: foreignCwd,
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.equal(existsSync(join(workspace, "metadata.json")), true, "package smoke should create workspace metadata");
  assert.equal(existsSync(join(workspace, "report.json")), true, "package smoke should create workspace report");
  assert.match(result.stdout, /Relution policy workbench:/u, "package smoke should print server URL");
});
