import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

test("serve rejects junk-suffixed numeric flags", () => {
  const root = mkdtempSync(join(tmpdir(), "relution-cli-strict-int-"));
  const workspace = join(root, "workspace");
  const out = join(root, "out.rexp");
  const result = spawnSync(
    process.execPath,
    ["dist/src/cli.js", "serve", "--workspace", workspace, "--out", out, "--port", "0junk", "--once"],
    { encoding: "utf8" },
  );

  assert.notEqual(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stderr, /ERROR: Expected integer for --port/u);
});

test("serve rejects non-loopback hosts unless network editor mode is explicit", () => {
  const root = mkdtempSync(join(tmpdir(), "relution-cli-host-guard-"));
  const workspace = join(root, "workspace");
  const out = join(root, "out.rexp");
  const rejected = spawnSync(
    process.execPath,
    ["dist/src/cli.js", "serve", "--workspace", workspace, "--out", out, "--host", "0.0.0.0", "--port", "0", "--once"],
    { encoding: "utf8" },
  );

  assert.notEqual(rejected.status, 0, `${rejected.stderr}\n${rejected.stdout}`);
  assert.match(rejected.stderr, /--allow-network-editor/u);

  const allowed = spawnSync(
    process.execPath,
    ["dist/src/cli.js", "serve", "--workspace", workspace, "--out", out, "--host", "0.0.0.0", "--port", "0", "--allow-network-editor", "--once"],
    { encoding: "utf8" },
  );

  assert.equal(allowed.status, 0, `${allowed.stderr}\n${allowed.stdout}`);
  assert.match(allowed.stdout, /Relution policy workbench/u);
});

test("new --force resets stale editor sidecar state", () => {
  const root = mkdtempSync(join(tmpdir(), "relution-cli-new-sidecar-"));
  const workspace = join(root, "workspace");
  const first = spawnSync(
    process.execPath,
    ["dist/src/cli.js", "new", "--workspace", workspace, "--platform", "IOS", "--name", "Before", "--force"],
    { encoding: "utf8" },
  );
  assert.equal(first.status, 0, `${first.stderr}\n${first.stdout}`);

  writeFileSync(
    join(workspace, "editor-sidecar.json"),
    JSON.stringify({
      version: 1,
      mobileConfigRestore: [
        {
          policyPath: "policies/policy_stale.json",
          policyName: "Stale",
          platform: "IOS",
          configurationUuid: "stale",
          payloadType: "com.apple.stale",
          displayName: "Stale",
          signatureState: "unsigned",
          configuration: { uuid: "stale" },
        },
      ],
      ddmArtifacts: [{ uuid: "stale-ddm", schemaId: "ddm", payload: {} }],
      mdmCommandArtifacts: [],
      customManifests: [],
    }),
  );

  const second = spawnSync(
    process.execPath,
    ["dist/src/cli.js", "new", "--workspace", workspace, "--platform", "IOS", "--name", "After", "--force"],
    { encoding: "utf8" },
  );
  assert.equal(second.status, 0, `${second.stderr}\n${second.stdout}`);
  assert.equal(existsSync(join(workspace, "editor-sidecar.json")), false);
});

test("RELUTION_REXP_KEY rejects obvious weak defaults", () => {
  const result = spawnSync(
    process.execPath,
    ["dist/src/cli.js", "verify", "missing.rexp"],
    {
      encoding: "utf8",
      env: { ...process.env, RELUTION_REXP_KEY: "key123" },
    },
  );

  assert.notEqual(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stderr, /RELUTION_REXP_KEY must be at least 16 characters/u);
});
