/** Verifies the built CLI's user-visible success and error boundaries. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import test from "node:test";

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
const cli = resolve(repositoryRoot, "dist/src/cli.js");

function runCli(...args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: repositoryRoot, encoding: "utf8" });
}

test("CLI help exits successfully and presents the archive workflow", () => {
  const result = runCli("--help");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^Usage:/mu);
  assert.match(result.stdout, /rexp pack <dir>/u);
});

test("CLI command failures use a non-zero exit and a concise user-facing error", () => {
  const result = runCli("not-a-command");
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /^ERROR: Unknown command: not-a-command$/mu);
});

test("forced new replaces the workspace and its sidecar through composite initialization", () => {
  const workspace = mkdtempSync(join(tmpdir(), "relution-cli-new-"));
  try {
    const initial = runCli("new", "--platform", "IOS", "--name", "Initial policy", "--workspace", workspace);
    assert.equal(initial.status, 0, initial.stderr);
    writeFileSync(join(workspace, "editor-sidecar.json"), JSON.stringify({ version: 1, appleSchemaRevision: "old", mobileConfigRestore: [], ddmArtifacts: [], mdmCommandArtifacts: [], customManifests: [] }) + "\n");

    const replacement = runCli("new", "--platform", "IOS", "--name", "Replacement policy", "--workspace", workspace, "--force");
    assert.equal(replacement.status, 0, replacement.stderr);
    assert.match(replacement.stdout, /^Created workspace /mu);
    assert.equal(existsSync(join(workspace, "editor-sidecar.json")), false);
    assert.match(readFileSync(join(workspace, "report.json"), "utf8"), /Replacement policy/u);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("built CLI edit --force replaces stale editor sidecar data with a fresh archive-derived state", () => {
  const root = mkdtempSync(join(tmpdir(), "relution-cli-edit-import-"));
  const source = join(root, "source");
  const workspace = join(root, "workspace");
  const archive = join(root, "source.rexp");
  const output = join(root, "output.rexp");
  const key = "correct-horse-battery-staple";
  try {
    assert.equal(runCli("new", "--platform", "IOS", "--name", "Imported policy", "--workspace", source).status, 0);
    const packed = runCli("pack", source, "--out", archive, "--key", key);
    assert.equal(packed.status, 0, packed.stderr);
    assert.equal(runCli("new", "--platform", "IOS", "--name", "Stale destination", "--workspace", workspace).status, 0);
    writeFileSync(join(workspace, "editor-sidecar.json"), JSON.stringify({
      version: 1,
      appleSchemaRevision: "stale",
      mobileConfigRestore: [],
      ddmArtifacts: [],
      mdmCommandArtifacts: [],
      customManifests: [],
      staleArchiveArtifact: { shouldNotSurvive: true },
    }) + "\n");

    const edited = runCli("edit", archive, "--key", key, "--workspace", workspace, "--out", output, "--force", "--once");
    assert.equal(edited.status, 0, edited.stderr);
    assert.match(readFileSync(join(workspace, "report.json"), "utf8"), /Imported policy/u);
    const sidecar = JSON.parse(readFileSync(join(workspace, "editor-sidecar.json"), "utf8")) as Record<string, unknown>;
    assert.equal("staleArchiveArtifact" in sidecar, false);
    assert.notEqual(sidecar.appleSchemaRevision, "stale");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("built CLI edit --force recovers interrupted base workspace transaction move phases before destination validation", () => {
  const root = mkdtempSync(join(tmpdir(), "relution-cli-edit-interrupted-base-"));
  const source = join(root, "source");
  const archive = join(root, "source.rexp");
  const key = "correct-horse-battery-staple";
  try {
    assert.equal(runCli("new", "--platform", "IOS", "--name", "Recovered archive policy", "--workspace", source).status, 0);
    const packed = runCli("pack", source, "--out", archive, "--key", key);
    assert.equal(packed.status, 0, packed.stderr);

    for (const direction of ["backup", "install"] as const) {
      for (const entry of ["metadata.json", "report.json", "policies"] as const) {
        const workspace = join(root, `${direction}-${entry}`);
        const output = join(root, `${direction}-${entry}.rexp`);
        const initial = runCli("new", "--platform", "IOS", "--name", "Interrupted destination", "--workspace", workspace);
        assert.equal(initial.status, 0, `${direction}/${entry}: ${initial.stderr}`);
        assert.equal(interruptBaseWorkspacePublication(workspace, direction, entry), "SIGKILL");

        const edited = runCli("edit", archive, "--key", key, "--workspace", workspace, "--out", output, "--force", "--once");
        assert.equal(edited.status, 0, `${direction}/${entry}: ${edited.stderr}`);
        assert.match(readFileSync(join(workspace, "report.json"), "utf8"), /Recovered archive policy/u);
        assert.equal(existsSync(join(workspace, ".rexp-studio-workspace-transaction", "journal.json")), false);
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("built CLI new --force recovers interrupted base workspace transaction phases before validating the destination", () => {
  for (const direction of ["backup", "install"] as const) {
    const workspace = mkdtempSync(join(tmpdir(), "relution-cli-new-interrupted-base-"));
    try {
      const initial = runCli("new", "--platform", "IOS", "--name", "Initial policy", "--workspace", workspace);
      assert.equal(initial.status, 0, initial.stderr);
      assert.equal(interruptBaseWorkspacePublication(workspace, direction), "SIGKILL");

      const replacement = runCli("new", "--platform", "IOS", "--name", "Recovered replacement", "--workspace", workspace, "--force");
      assert.equal(replacement.status, 0, `${direction}: ${replacement.stderr}`);
      assert.match(readFileSync(join(workspace, "report.json"), "utf8"), /Recovered replacement/u);
      assert.equal(existsSync(join(workspace, ".rexp-studio-workspace-transaction", "journal.json")), false);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  }
});

function interruptBaseWorkspacePublication(
  workspace: string,
  direction: "backup" | "install",
  entry: "metadata.json" | "report.json" | "policies" = "metadata.json",
): string | null {
  const program = [
    "const storage = await import(process.env.REXP_WORKSPACE_STORAGE_URL);",
    "const transactionApi = await import(process.env.REXP_WORKSPACE_TRANSACTION_URL);",
    "const previous = storage.loadPersistedWorkspace(process.env.REXP_WORKSPACE_DIR);",
    "const replacement = { ...previous, metadata: { ...previous.metadata, workspaceTransactionMarker: 'interrupted' } };",
    "const transaction = transactionApi.createWorkspaceTransaction(process.env.REXP_WORKSPACE_DIR);",
    "storage.savePersistedWorkspace(transactionApi.workspaceTransactionStageDirectory(transaction), replacement);",
    "transactionApi.replaceWorkspaceSurface(transaction, { afterManagedEntryRename: (move) => { if (move.direction === process.env.REXP_WORKSPACE_TRANSACTION_DIRECTION && move.entry === process.env.REXP_WORKSPACE_TRANSACTION_ENTRY) process.kill(process.pid, 'SIGKILL'); } });",
  ].join("\n");
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", program], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      REXP_WORKSPACE_STORAGE_URL: new URL("../../src/workspace/storage.js", import.meta.url).href,
      REXP_WORKSPACE_TRANSACTION_URL: new URL("../../src/workspace/workspace-storage-transaction.js", import.meta.url).href,
      REXP_WORKSPACE_DIR: workspace,
      REXP_WORKSPACE_TRANSACTION_DIRECTION: direction,
      REXP_WORKSPACE_TRANSACTION_ENTRY: entry,
    },
  });
  return result.signal;
}
