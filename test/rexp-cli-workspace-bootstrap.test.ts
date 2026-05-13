import { existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import test from "node:test";

test("serve bootstraps an already-existing empty workspace directory", () => {
  const root = mkdtempSync(join(tmpdir(), "relution-cli-empty-workspace-"));
  const workspace = join(root, "workspace");
  const out = join(root, "out.rexp");
  mkdirSync(workspace, { recursive: true });

  const result = spawnSync(
    process.execPath,
    ["dist/src/cli.js", "serve", "--workspace", workspace, "--out", out, "--port", "0", "--once"],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.equal(existsSync(join(workspace, "metadata.json")), true);
  assert.equal(existsSync(join(workspace, "report.json")), true);
  assert.match(result.stdout, /Created workspace/u);
});
