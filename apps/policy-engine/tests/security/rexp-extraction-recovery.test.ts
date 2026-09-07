/** Exercises crash recovery and private-path defenses for force extraction. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdtempSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import test from "node:test";
import { extractRexp } from "../../src/archive/rexp-extraction.js";
import { loadTemplateBundle } from "../../src/assurance/template-bundle.js";
import { createNewWorkspace } from "../../src/workspace/workspace-creation.js";
import { loadPersistedWorkspace } from "../../src/workspace/storage.js";
import { packPlainDirectory } from "../../src/archive/rexp-packing.js";
import { createTestWorkspace } from "../support/workspace.js";

const TRANSACTION_SUFFIX = ".rexp-extraction-transaction";

test("force extraction recovers a SIGKILL after every durable publication phase", () => {
  for (const phase of ["initializing", "prepared", "previous-published", "replacement-published"] as const) {
    const fixture = createTestWorkspace("Replacement policy");
    try {
      packPlainDirectory(fixture.workspace, fixture.archive, fixture.key);
      const output = join(fixture.root, "output");
      createWorkspace(output, "Original policy");

      assert.equal(runInterruptedExtraction(fixture.archive, output, fixture.key, phase), "SIGKILL");
      const transaction = transactionPath(output);
      assert.equal(lstatSync(transaction).mode & 0o777, 0o700);
      assert.equal(lstatSync(join(transaction, "journal.json")).mode & 0o777, 0o600);

      assert.throws(() => extractRexp(join(fixture.root, "missing.rexp"), output, fixture.key), /ENOENT/u);
      assert.equal(loadPersistedWorkspace(output).policies[0]!.document.name, phase === "replacement-published" ? "Replacement policy" : "Original policy");
      assert.equal(existsSync(transaction), false, `recovery must remove ${phase} transaction residue`);
    } finally { fixture.cleanup(); }
  }
});

test("force extraction removes a private no-journal transaction left by a pre-journal SIGKILL", () => {
  const fixture = createTestWorkspace("Replacement policy");
  try {
    packPlainDirectory(fixture.workspace, fixture.archive, fixture.key);
    const output = join(fixture.root, "output");
    createWorkspace(output, "Original policy");

    assert.equal(runInterruptedExtraction(fixture.archive, output, fixture.key, "transaction-created"), "SIGKILL");
    const transaction = transactionPath(output);
    assert.equal(lstatSync(transaction).mode & 0o777, 0o700);
    assert.equal(existsSync(join(transaction, "journal.json")), false);

    assert.throws(() => extractRexp(join(fixture.root, "missing.rexp"), output, fixture.key), /ENOENT/u);
    assert.equal(loadPersistedWorkspace(output).policies[0]!.document.name, "Original policy");
    assert.equal(existsSync(transaction), false);
  } finally { fixture.cleanup(); }
});

test("force extraction refuses a symlink substituted for its deterministic transaction directory", () => {
  const fixture = createTestWorkspace("Symlink target");
  const external = mkdtempSync(join(tmpdir(), "rexp-extraction-external-"));
  try {
    const output = join(fixture.root, "output");
    const transaction = transactionPath(output);
    symlinkSync(external, transaction);

    assert.throws(() => extractRexp(join(fixture.root, "missing.rexp"), output, fixture.key), /Extraction transaction path must not use symlinks/u);
    assert.deepEqual(readdirSync(external), []);
  } finally {
    fixture.cleanup();
    rmSync(external, { recursive: true, force: true });
  }
});

test("a synchronous publication failure rolls the force extraction back to its original workspace", () => {
  const fixture = createTestWorkspace("Replacement policy");
  try {
    packPlainDirectory(fixture.workspace, fixture.archive, fixture.key);
    const output = join(fixture.root, "output");
    createWorkspace(output, "Original policy");

    assert.throws(
      () => extractRexp(fixture.archive, output, fixture.key, {
        force: true,
        testOnlyAfterPublication: (phase) => { if (phase === "replacement-published") throw new Error("interrupted publication"); },
      } as Parameters<typeof extractRexp>[3] & { readonly testOnlyAfterPublication: (phase: string) => void }),
      /interrupted publication/u,
    );
    assert.equal(loadPersistedWorkspace(output).policies[0]!.document.name, "Original policy");
    assert.equal(existsSync(transactionPath(output)), false);
  } finally { fixture.cleanup(); }
});

test("rollback recovery restores the previous workspace after SIGKILL at every rename and cleanup boundary", () => {
  const rollbackPoints = [
    "before-rollback-replacement-rename",
    "after-rollback-replacement-rename",
    "before-rollback-previous-restore-rename",
    "after-rollback-previous-restore-rename",
    "before-rollback-cleanup",
    "after-rollback-cleanup",
  ];
  for (const point of rollbackPoints) {
    const fixture = createTestWorkspace("Replacement policy");
    try {
      packPlainDirectory(fixture.workspace, fixture.archive, fixture.key);
      const output = join(fixture.root, "output");
      createWorkspace(output, "Original policy");

      assert.equal(runInterruptedRollback(fixture.archive, output, fixture.key, point), "SIGKILL", point);
      assertRecoveryKeepsOriginal(fixture.root, output, fixture.key);
    } finally { fixture.cleanup(); }
  }
});

test("rollback recovery fails closed when its previous-workspace backup is missing", () => {
  const fixture = createTestWorkspace("Replacement policy");
  try {
    packPlainDirectory(fixture.workspace, fixture.archive, fixture.key);
    const output = join(fixture.root, "output");
    createWorkspace(output, "Original policy");
    assert.equal(runInterruptedRollback(fixture.archive, output, fixture.key, "before-rollback-replacement-rename"), "SIGKILL");

    const transaction = transactionPath(output);
    rmSync(join(transaction, "previous-workspace"), { recursive: true, force: true });
    assert.throws(() => extractRexp(join(fixture.root, "missing.rexp"), output, fixture.key), /Extraction rollback backup is missing/u);
    assert.equal(loadPersistedWorkspace(output).policies[0]!.document.name, "Replacement policy");
    assert.equal(existsSync(transaction), true);
  } finally { fixture.cleanup(); }
});

function createWorkspace(directory: string, name: string): void {
  createNewWorkspace({ workspace: directory, platform: "IOS", name, serverVersion: loadTemplateBundle().serverVersion });
}

function runInterruptedExtraction(archive: string, output: string, password: string, phase: string): string | null {
  const program = [
    "const extraction = await import(process.env.REXP_EXTRACTION_URL);",
    "extraction.extractRexp(process.env.REXP_ARCHIVE, process.env.REXP_OUTPUT, process.env.REXP_PASSWORD, { force: true, testOnlyAfterPublication: (phase) => { if (phase === process.env.REXP_PHASE) process.kill(process.pid, 'SIGKILL'); } });",
  ].join("\n");
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", program], {
    env: {
      ...process.env,
      REXP_EXTRACTION_URL: new URL("../../src/archive/rexp-extraction.js", import.meta.url).href,
      REXP_ARCHIVE: archive,
      REXP_OUTPUT: output,
      REXP_PASSWORD: password,
      REXP_PHASE: phase,
    },
  });
  return result.signal;
}

function runInterruptedRollback(archive: string, output: string, password: string, point: string): string | null {
  const program = [
    "const extraction = await import(process.env.REXP_EXTRACTION_URL);",
    "extraction.extractRexp(process.env.REXP_ARCHIVE, process.env.REXP_OUTPUT, process.env.REXP_PASSWORD, { force: true, testOnlyAfterPublication: (phase) => { if (phase === 'replacement-published') throw new Error('begin rollback'); if (phase === process.env.REXP_PHASE) process.kill(process.pid, 'SIGKILL'); } });",
  ].join("\n");
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", program], {
    env: {
      ...process.env,
      REXP_EXTRACTION_URL: new URL("../../src/archive/rexp-extraction.js", import.meta.url).href,
      REXP_ARCHIVE: archive,
      REXP_OUTPUT: output,
      REXP_PASSWORD: password,
      REXP_PHASE: point,
    },
  });
  return result.signal;
}

function assertRecoveryKeepsOriginal(root: string, output: string, password: string): void {
  const transaction = transactionPath(output);
  for (const attempt of [1, 2]) {
    assert.throws(() => extractRexp(join(root, "missing.rexp"), output, password), /ENOENT/u, `recovery attempt ${String(attempt)}`);
    assert.equal(loadPersistedWorkspace(output).policies[0]!.document.name, "Original policy", `recovery attempt ${String(attempt)}`);
    assert.equal(existsSync(transaction), false, `recovery attempt ${String(attempt)} must remove the transaction`);
  }
}

function transactionPath(output: string): string { return join(dirname(output), `.${basename(output)}${TRANSACTION_SUFFIX}`); }
