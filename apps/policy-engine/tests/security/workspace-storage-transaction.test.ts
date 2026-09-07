/** Guards transaction journal publication and recovery against path redirection. */
import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { loadTemplateBundle } from "../../src/assurance/template-bundle.js";
import { createNewWorkspace } from "../../src/workspace/workspace-creation.js";
import { loadPersistedWorkspace, savePersistedWorkspace } from "../../src/workspace/storage.js";
import { createWorkspaceTransaction, recoverWorkspaceTransaction } from "../../src/workspace/workspace-storage-transaction.js";

function createWorkspace(): { readonly root: string; readonly workspace: string } {
  const root = mkdtempSync(join(tmpdir(), "rexp-workspace-transaction-security-"));
  const workspace = join(root, "workspace");
  createNewWorkspace({ workspace, platform: "IOS", name: "Transaction safety", serverVersion: loadTemplateBundle().serverVersion });
  return { root, workspace };
}

function killAfterTransactionSetup(workspace: string): NodeJS.Signals | null {
  const program = [
    "const transaction = await import(process.env.REXP_WORKSPACE_TRANSACTION_URL);",
    "transaction.createWorkspaceTransaction(process.env.REXP_WORKSPACE_DIR);",
    "process.kill(process.pid, 'SIGKILL');",
  ].join("\n");
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", program], {
    env: {
      ...process.env,
      REXP_WORKSPACE_TRANSACTION_URL: new URL("../../src/workspace/workspace-storage-transaction.js", import.meta.url).href,
      REXP_WORKSPACE_DIR: workspace,
    },
  });
  if (result.signal === null) throw new Error(result.stderr.toString());
  return result.signal;
}

function killDuringManagedRename(workspace: string, direction: "backup" | "install", entry: "metadata.json" | "report.json" | "policies", timing: "beforeManagedEntryRename" | "afterManagedEntryRename"): NodeJS.Signals | null {
  const program = [
    "const storage = await import(process.env.REXP_WORKSPACE_STORAGE_URL);",
    "const transactionApi = await import(process.env.REXP_WORKSPACE_TRANSACTION_URL);",
    "const previous = storage.loadPersistedWorkspace(process.env.REXP_WORKSPACE_DIR);",
    "const replacement = { ...previous, metadata: { ...previous.metadata, workspaceTransactionMarker: 'replacement' } };",
    "const transaction = transactionApi.createWorkspaceTransaction(process.env.REXP_WORKSPACE_DIR);",
    "storage.savePersistedWorkspace(transactionApi.workspaceTransactionStageDirectory(transaction), replacement);",
    "transactionApi.replaceWorkspaceSurface(transaction, { [process.env.REXP_WORKSPACE_TRANSACTION_HOOK]: (move) => { if (move.direction === process.env.REXP_WORKSPACE_TRANSACTION_DIRECTION && move.entry === process.env.REXP_WORKSPACE_TRANSACTION_ENTRY) process.kill(process.pid, 'SIGKILL'); } });",
  ].join("\n");
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", program], {
    env: {
      ...process.env,
      REXP_WORKSPACE_STORAGE_URL: new URL("../../src/workspace/storage.js", import.meta.url).href,
      REXP_WORKSPACE_TRANSACTION_URL: new URL("../../src/workspace/workspace-storage-transaction.js", import.meta.url).href,
      REXP_WORKSPACE_DIR: workspace,
      REXP_WORKSPACE_TRANSACTION_DIRECTION: direction,
      REXP_WORKSPACE_TRANSACTION_ENTRY: entry,
      REXP_WORKSPACE_TRANSACTION_HOOK: timing,
    },
  });
  if (result.signal === null) throw new Error(result.stderr.toString());
  return result.signal;
}

function killDuringRollbackRecovery(workspace: string, hook: "beforeManagedEntryRestoreRename" | "afterManagedEntryRestoreRename" | "afterStageDeletion" | "afterBackupDeletion" | "beforeJournalDeletion", entry?: "metadata.json" | "report.json" | "policies"): NodeJS.Signals | null {
  const program = [
    "const transaction = await import(process.env.REXP_WORKSPACE_TRANSACTION_URL);",
    "transaction.recoverWorkspaceTransaction(process.env.REXP_WORKSPACE_DIR, { [process.env.REXP_WORKSPACE_TRANSACTION_HOOK]: (move) => { if (process.env.REXP_WORKSPACE_TRANSACTION_ENTRY === '*' || move?.entry === process.env.REXP_WORKSPACE_TRANSACTION_ENTRY) process.kill(process.pid, 'SIGKILL'); } });",
  ].join("\n");
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", program], {
    env: {
      ...process.env,
      REXP_WORKSPACE_TRANSACTION_URL: new URL("../../src/workspace/workspace-storage-transaction.js", import.meta.url).href,
      REXP_WORKSPACE_DIR: workspace,
      REXP_WORKSPACE_TRANSACTION_HOOK: hook,
      REXP_WORKSPACE_TRANSACTION_ENTRY: entry ?? "*",
    },
  });
  if (result.signal === null) throw new Error(result.stderr.toString());
  return result.signal;
}

function assertRecoveredTransactionSurface(workspace: string, marker: string): void {
  recoverWorkspaceTransaction(workspace);
  recoverWorkspaceTransaction(workspace);
  const recovered = loadPersistedWorkspace(workspace);
  assert.equal(recovered.metadata.workspaceTransactionMarker, marker);
  for (const entry of ["metadata.json", "report.json", "policies"] as const) assert.equal(existsSync(join(workspace, entry)), true, `lost ${entry}`);
  const transactionDirectory = join(workspace, ".rexp-studio-workspace-transaction");
  assert.equal(existsSync(join(transactionDirectory, "journal.json")), false);
  assert.equal(readdirSync(transactionDirectory).some((name) => name.startsWith("stage-") || name.startsWith("backup-")), false);
}

test("workspace publication cannot clobber a pre-existing sibling journal temporary-file symlink", () => {
  const fixture = createWorkspace();
  const targetRoot = mkdtempSync(join(tmpdir(), "rexp-workspace-journal-target-"));
  try {
    const target = join(targetRoot, "sentinel.txt");
    const legacyTemporary = join(dirname(fixture.workspace), `.${basename(fixture.workspace)}-workspace-transaction.json.tmp`);
    writeFileSync(target, "do not overwrite");
    symlinkSync(target, legacyTemporary);

    savePersistedWorkspace(fixture.workspace, loadPersistedWorkspace(fixture.workspace));

    assert.equal(readFileSync(target, "utf8"), "do not overwrite");
    assert.equal(lstatSync(legacyTemporary).isSymbolicLink(), true);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
    rmSync(targetRoot, { recursive: true, force: true });
  }
});

test("forged sibling journal stage and backup paths cannot escape workspace transaction cleanup", () => {
  const fixture = createWorkspace();
  const targetRoot = mkdtempSync(join(tmpdir(), "rexp-workspace-forged-journal-target-"));
  try {
    const forgedStage = join(targetRoot, `${basename(fixture.workspace)}-forged-stage`);
    const forgedBackup = join(targetRoot, `${basename(fixture.workspace)}-forged-backup`);
    const stageSentinel = join(forgedStage, "stage-sentinel.txt");
    const backupSentinel = join(forgedBackup, "backup-sentinel.txt");
    mkdirSync(forgedStage);
    mkdirSync(forgedBackup);
    writeFileSync(stageSentinel, "retain stage", { flag: "w" });
    writeFileSync(backupSentinel, "retain backup", { flag: "w" });
    const legacyJournal = join(dirname(fixture.workspace), `.${basename(fixture.workspace)}-workspace-transaction.json`);
    writeFileSync(legacyJournal, `${JSON.stringify({
      workspaceDir: resolve(fixture.workspace),
      stageDir: forgedStage,
      backupDir: forgedBackup,
      phase: "installed",
      movedToBackup: [],
      movedFromStage: [],
    })}\n`);

    recoverWorkspaceTransaction(fixture.workspace);

    assert.equal(existsSync(stageSentinel), true);
    assert.equal(existsSync(backupSentinel), true);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
    rmSync(targetRoot, { recursive: true, force: true });
  }
});

test("private transaction recovery rejects a forged nonce-bound stage name before cleanup", () => {
  const fixture = createWorkspace();
  const targetRoot = mkdtempSync(join(tmpdir(), "rexp-workspace-private-forged-journal-target-"));
  try {
    const target = join(targetRoot, "sentinel.txt");
    const stateDirectory = join(fixture.workspace, ".rexp-studio-workspace-transaction");
    writeFileSync(target, "retain private target");
    rmSync(stateDirectory, { recursive: true, force: true });
    mkdirSync(stateDirectory);
    writeFileSync(join(stateDirectory, "journal.json"), `${JSON.stringify({
      version: 1,
      workspaceDir: resolve(fixture.workspace),
      nonce: "8a96e466-fb3f-4401-a7ee-5352e3246702",
      stage: `../../${basename(targetRoot)}`,
      backup: "backup-8a96e466-fb3f-4401-a7ee-5352e3246702",
      phase: "installed",
      movedToBackup: [],
      movedFromStage: [],
    })}\n`);

    assert.throws(() => recoverWorkspaceTransaction(fixture.workspace), /Workspace transaction journal is invalid/u);
    assert.equal(readFileSync(target, "utf8"), "retain private target");
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
    rmSync(targetRoot, { recursive: true, force: true });
  }
});

test("recovery removes nonce transaction state after SIGKILL before workspace publication begins", () => {
  const fixture = createWorkspace();
  try {
    const stateDirectory = join(fixture.workspace, ".rexp-studio-workspace-transaction");

    assert.equal(killAfterTransactionSetup(fixture.workspace), "SIGKILL");
    assert.equal(existsSync(join(stateDirectory, "journal.json")), true);
    assert.equal(readdirSync(stateDirectory).some((name) => name.startsWith("stage-") || name.startsWith("backup-")), true);

    recoverWorkspaceTransaction(fixture.workspace);

    assert.equal(existsSync(join(stateDirectory, "journal.json")), false);
    assert.equal(readdirSync(stateDirectory).some((name) => name.startsWith("stage-") || name.startsWith("backup-")), false);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("rollback rejects an absent backup unless its durable restore intent proves the live entry was restored", () => {
  for (const livePresent of [true, false]) {
    const fixture = createWorkspace();
    try {
      const transaction = createWorkspaceTransaction(fixture.workspace);
      transaction.phase = "backed-up";
      transaction.movedToBackup.push("metadata.json");
      const stateDirectory = join(fixture.workspace, ".rexp-studio-workspace-transaction");
      writeFileSync(join(stateDirectory, "journal.json"), `${JSON.stringify(transaction)}\n`);
      if (!livePresent) rmSync(join(fixture.workspace, "metadata.json"));

      assert.throws(() => recoverWorkspaceTransaction(fixture.workspace), /Workspace transaction backup entry is missing: metadata\.json/u);
      assert.equal(existsSync(join(stateDirectory, "journal.json")), true);
    } finally { rmSync(fixture.root, { recursive: true, force: true }); }
  }
});

test("workspace transaction recovery preserves a complete old-or-new surface across every managed rename crash point", () => {
  for (const direction of ["backup", "install"] as const) {
    for (const entry of ["metadata.json", "report.json", "policies"] as const) {
      for (const timing of ["beforeManagedEntryRename", "afterManagedEntryRename"] as const) {
        const fixture = createWorkspace();
        try {
          const original = loadPersistedWorkspace(fixture.workspace);
          savePersistedWorkspace(fixture.workspace, { ...original, metadata: { ...original.metadata, workspaceTransactionMarker: "original" } });

          assert.equal(killDuringManagedRename(fixture.workspace, direction, entry, timing), "SIGKILL", `${direction}/${entry}/${timing}`);

          let recovered;
          try { recovered = loadPersistedWorkspace(fixture.workspace); }
          catch (error) { throw new Error(`${direction}/${entry}/${timing}: ${error instanceof Error ? error.message : String(error)}`); }
          assert.ok(["original", "replacement"].includes(recovered.metadata.workspaceTransactionMarker as string), `${direction}/${entry}/${timing} recovered an incomplete or mixed surface`);
          for (const managedEntry of ["metadata.json", "report.json", "policies"] as const) assert.equal(existsSync(join(fixture.workspace, managedEntry)), true, `${direction}/${entry}/${timing} lost ${managedEntry}`);
          const transactionDirectory = join(fixture.workspace, ".rexp-studio-workspace-transaction");
          assert.equal(existsSync(join(transactionDirectory, "journal.json")), false);
          assert.equal(readdirSync(transactionDirectory).some((name) => name.startsWith("stage-") || name.startsWith("backup-")), false);
        } finally { rmSync(fixture.root, { recursive: true, force: true }); }
      }
    }
  }
});

test("workspace rollback recovery is replay-safe across restore renames and terminal residue cleanup", () => {
  const recoveryRenameHooks = ["beforeManagedEntryRestoreRename", "afterManagedEntryRestoreRename"] as const;
  const cleanupHooks = ["afterStageDeletion", "afterBackupDeletion", "beforeJournalDeletion"] as const;
  for (const hook of recoveryRenameHooks) {
    for (const entry of ["metadata.json", "report.json", "policies"] as const) {
      const fixture = createWorkspace();
      try {
        const original = loadPersistedWorkspace(fixture.workspace);
        savePersistedWorkspace(fixture.workspace, { ...original, metadata: { ...original.metadata, workspaceTransactionMarker: "original" } });
        assert.equal(killDuringManagedRename(fixture.workspace, "install", "metadata.json", "afterManagedEntryRename"), "SIGKILL", `${hook}/${entry} setup`);
        assert.equal(killDuringRollbackRecovery(fixture.workspace, hook, entry), "SIGKILL", `${hook}/${entry}`);
        assertRecoveredTransactionSurface(fixture.workspace, "original");
      } finally { rmSync(fixture.root, { recursive: true, force: true }); }
    }
  }
  for (const hook of cleanupHooks) {
    const fixture = createWorkspace();
    try {
      const original = loadPersistedWorkspace(fixture.workspace);
      savePersistedWorkspace(fixture.workspace, { ...original, metadata: { ...original.metadata, workspaceTransactionMarker: "original" } });
      assert.equal(killDuringManagedRename(fixture.workspace, "install", "metadata.json", "afterManagedEntryRename"), "SIGKILL", `${hook} setup`);
      assert.equal(killDuringRollbackRecovery(fixture.workspace, hook), "SIGKILL", hook);
      assertRecoveredTransactionSurface(fixture.workspace, "original");
    } finally { rmSync(fixture.root, { recursive: true, force: true }); }
  }
});
