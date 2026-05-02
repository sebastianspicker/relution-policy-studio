import { existsSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import test from "node:test";

test("serve creates a blank workspace and does not require an encryption key", () => {
  const root = mkdtempSync(join(tmpdir(), "relution-cli-"));
  const workspace = join(root, "workspace");
  const out = join(root, "out.rexp");
  const result = spawnSync(
    process.execPath,
    ["dist/src/cli.js", "serve", "--workspace", workspace, "--out", out, "--port", "0", "--once"],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.equal(existsSync(join(workspace, "metadata.json")), true);
  assert.equal(existsSync(join(workspace, "report.json")), true);
  assert.match(result.stdout, /Created workspace/u);
  assert.match(result.stdout, /Key: not set/u);
});

test("serve package smoke works outside the repo cwd", () => {
  const packageRoot = resolve(".");
  const foreignCwd = mkdtempSync(join(tmpdir(), "relution-cli-cwd-"));
  const root = mkdtempSync(join(tmpdir(), "relution-cli-"));
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
  assert.equal(existsSync(join(workspace, "metadata.json")), true);
  assert.equal(existsSync(join(workspace, "report.json")), true);
  assert.match(result.stdout, /Relution policy workbench:/u);
});
