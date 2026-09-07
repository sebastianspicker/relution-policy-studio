/** Verifies durable, recoverable publication of the managed workspace plus sidecar. */
import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadWorkspaceState, loadWorkspaceStateSnapshot, mutateWorkspaceState, recoverWorkspaceState, saveWorkspaceState, workspaceStateRevision, type WorkspaceState } from "../src/workspace-state/persistence.js";
import { loadTemplateBundle } from "../src/assurance/template-bundle.js";
import { createNewWorkspace } from "../src/workspace/workspace-creation.js";
import { addPolicyToLoadedWorkspace } from "../src/workspace/workspace-policy-actions.js";

function createWorkspaceState(name: string): { readonly directory: string; readonly state: WorkspaceState } {
  const directory = mkdtempSync(join(tmpdir(), "relution-workspace-state-"));
  createNewWorkspace({ workspace: directory, platform: "IOS", name, serverVersion: loadTemplateBundle().serverVersion });
  return { directory, state: loadWorkspaceState(directory) };
}

function withWorkspaceMarker(state: WorkspaceState, marker: string): WorkspaceState {
  return {
    workspace: { ...state.workspace, metadata: { ...state.workspace.metadata, workspaceStateMarker: marker } },
    sidecar: { kind: "file", contents: validSidecarBytes(marker) },
  };
}

function validSidecarBytes(revision: string): Buffer {
  return Buffer.from(`${JSON.stringify({ version: 1, appleSchemaRevision: revision, mobileConfigRestore: [], ddmArtifacts: [], mdmCommandArtifacts: [], customManifests: [] })}\n`);
}

function runInterruptedSave(directory: string, marker: string, hook: "afterStageCreated" | "afterWorkspacePublished" | "afterSidecarPublished"): number | null {
  const program = [
    "const storage = await import(process.env.REXP_WORKSPACE_STATE_URL);",
    "const state = storage.loadWorkspaceState(process.env.REXP_WORKSPACE_DIR);",
    "const next = { workspace: { ...state.workspace, metadata: { ...state.workspace.metadata, workspaceStateMarker: process.env.REXP_WORKSPACE_MARKER } }, sidecar: { kind: 'file', contents: Buffer.from(process.env.REXP_WORKSPACE_SIDECAR, 'base64') } };",
    "storage.saveWorkspaceState(process.env.REXP_WORKSPACE_DIR, next, { [process.env.REXP_WORKSPACE_HOOK]: () => process.exit(73) });",
  ].join("\n");
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", program], {
    env: {
      ...process.env,
      REXP_WORKSPACE_STATE_URL: new URL("../src/workspace-state/persistence.js", import.meta.url).href,
      REXP_WORKSPACE_DIR: directory,
      REXP_WORKSPACE_MARKER: marker,
      REXP_WORKSPACE_SIDECAR: validSidecarBytes(marker).toString("base64"),
      REXP_WORKSPACE_HOOK: hook,
    },
  });
  return result.status;
}

function runInterruptedForcedReplacement(directory: string): number | null {
  const program = [
    "const creation = await import(process.env.REXP_WORKSPACE_CREATION_URL);",
    "const storage = await import(process.env.REXP_WORKSPACE_STATE_URL);",
    "const workspace = creation.createNewWorkspaceInMemory({ workspace: process.env.REXP_WORKSPACE_DIR, platform: 'IOS', name: 'Forced replacement', serverVersion: 'test-server' });",
    "const replacement = { ...workspace, metadata: { ...workspace.metadata, workspaceStateMarker: 'forced-replacement' } };",
    "storage.initializeWorkspaceState(process.env.REXP_WORKSPACE_DIR, { workspace: replacement, sidecar: { kind: 'missing' } }, { force: true, afterWorkspacePublished: () => process.exit(73) });",
  ].join("\n");
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", program], {
    env: {
      ...process.env,
      REXP_WORKSPACE_CREATION_URL: new URL("../src/workspace/workspace-creation.js", import.meta.url).href,
      REXP_WORKSPACE_STATE_URL: new URL("../src/workspace-state/persistence.js", import.meta.url).href,
      REXP_WORKSPACE_DIR: directory,
    },
  });
  return result.status;
}

function runInterruptedInPlaceMutation(directory: string, marker: string): number | null {
  const program = [
    "const storage = await import(process.env.REXP_WORKSPACE_STATE_URL);",
    "storage.mutateWorkspaceState(process.env.REXP_WORKSPACE_DIR, (current) => {",
    "  current.workspace.metadata.workspaceStateMarker = process.env.REXP_WORKSPACE_MARKER;",
    "  return { workspace: current.workspace, sidecar: { kind: 'file', contents: Buffer.from(process.env.REXP_WORKSPACE_SIDECAR, 'base64') } };",
    "}, { afterWorkspacePublished: () => process.exit(73) });",
  ].join("\n");
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", program], {
    env: {
      ...process.env,
      REXP_WORKSPACE_STATE_URL: new URL("../src/workspace-state/persistence.js", import.meta.url).href,
      REXP_WORKSPACE_DIR: directory,
      REXP_WORKSPACE_MARKER: marker,
      REXP_WORKSPACE_SIDECAR: validSidecarBytes(marker).toString("base64"),
    },
  });
  return result.status;
}

test("workspace state publishes the workspace surface and arbitrary sidecar bytes together", () => {
  const { directory, state } = createWorkspaceState("Composite save");
  const next = withWorkspaceMarker(state, "published");

  saveWorkspaceState(directory, next);

  const loaded = loadWorkspaceState(directory);
  assert.equal(loaded.workspace.metadata.workspaceStateMarker, "published");
  assert.deepEqual(loaded.sidecar, next.sidecar);
  assert.equal(existsSync(join(directory, ".rexp-studio-workspace-state", "journal.json")), false);
  assert.equal(existsSync(join(directory, ".rexp-studio-workspace-state", "stage")), false);
  assert.equal(existsSync(join(directory, ".rexp-studio-workspace-state", "backup")), false);
  assert.equal(lstatSync(join(directory, ".rexp-studio-workspace-state")).mode & 0o777, 0o700);
});

test("concurrent atomic state mutations preserve disjoint updates after a busy retry", async () => {
  const { directory } = createWorkspaceState("Atomic concurrent mutations");
  const first = startAtomicMutation(directory, "atomicWriterA", "writer-a", 300);
  await waitForOutput(first, "entered");
  const second = startAtomicMutation(directory, "atomicWriterB", "writer-b", 0, true);

  const [firstResult, secondResult] = await Promise.all([collectProcess(first), collectProcess(second)]);
  assert.equal(firstResult.status, 0, firstResult.stderr);
  assert.equal(secondResult.status, 0, secondResult.stderr);
  assert.match(secondResult.stdout, /busy/u);

  const state = loadWorkspaceState(directory);
  assert.equal(state.workspace.metadata.atomicWriterA, "writer-a");
  assert.equal(state.workspace.metadata.atomicWriterB, "writer-b");
});

test("mutation returns the canonical durable policy order and revision", () => {
  const { directory } = createWorkspaceState("Canonical mutation result");
  const before = loadWorkspaceStateSnapshot(directory);

  const returned = mutateWorkspaceState(directory, (current) => {
    addPolicyToLoadedWorkspace(current.workspace, loadTemplateBundle(), { platform: "IOS", name: "Second policy" });
    current.workspace.policies.reverse();
    return current;
  }, { expectedRevision: before.revision });

  const durable = loadWorkspaceStateSnapshot(directory);
  assert.deepEqual(returned.workspace.policies.map((policy) => policy.path), [...returned.workspace.policies.map((policy) => policy.path)].sort());
  assert.deepEqual(returned, durable.state);
  assert.equal(workspaceStateRevision(returned), durable.revision);

  const accepted = mutateWorkspaceState(directory, (current) => ({
    ...current,
    workspace: { ...current.workspace, metadata: { ...current.workspace.metadata, canonicalRevisionAccepted: true } },
  }), { expectedRevision: durable.revision });
  assert.equal(accepted.workspace.metadata.canonicalRevisionAccepted, true);
});

test("an in-place nested mutation cannot contaminate the rollback snapshot", () => {
  const { directory, state } = createWorkspaceState("In-place rollback isolation");
  saveWorkspaceState(directory, withWorkspaceMarker(state, "old-pair"));
  const sidecar = join(directory, "editor-sidecar.json");

  assert.throws(() => mutateWorkspaceState(directory, (current) => {
    current.workspace.metadata.workspaceStateMarker = "new-pair";
    return { workspace: current.workspace, sidecar: { kind: "file", contents: validSidecarBytes("new-pair") } };
  }, { afterWorkspacePublished: () => mkdirSync(sidecar) }), /EEXIST/u);

  const restored = loadWorkspaceState(directory);
  assert.equal(restored.workspace.metadata.workspaceStateMarker, "old-pair");
  assert.deepEqual(restored.sidecar, { kind: "file", contents: validSidecarBytes("old-pair") });
});

test("failed sidecar publication preserves recovery evidence and recovery restores the previous pair", () => {
  const { directory, state } = createWorkspaceState("Composite recovery");
  const next = withWorkspaceMarker(state, "interrupted");
  const sidecar = join(directory, "editor-sidecar.json");

  assert.throws(
    () => saveWorkspaceState(directory, next, {
      afterWorkspacePublished: () => mkdirSync(sidecar),
    }),
    /workspace-state recovery failed: Editor sidecar path must be missing or a regular file/u,
  );
  assert.equal(existsSync(join(directory, ".rexp-studio-workspace-state", "journal.json")), true);
  assert.equal(existsSync(join(directory, ".rexp-studio-workspace-state", "backup", "state.json")), true);

  rmSync(sidecar, { recursive: true });
  recoverWorkspaceState(directory);

  const restored = loadWorkspaceState(directory);
  assert.equal(restored.workspace.metadata.workspaceStateMarker, undefined);
  assert.deepEqual(restored.sidecar, { kind: "missing" });
  assert.equal(existsSync(join(directory, ".rexp-studio-workspace-state", "journal.json")), false);
  assert.equal(existsSync(join(directory, ".rexp-studio-workspace-state", "backup")), false);
  assert.equal(readFileSync(join(directory, "metadata.json"), "utf8").includes("workspaceStateMarker"), false);
});

test("workspace state refuses a symlinked private transaction directory", () => {
  const { directory } = createWorkspaceState("Symlink safety");
  const privateState = join(directory, ".rexp-studio-workspace-state");
  const target = mkdtempSync(join(tmpdir(), "relution-workspace-state-target-"));
  rmSync(privateState, { recursive: true });
  symlinkSync(target, privateState);

  assert.throws(() => loadWorkspaceState(directory), /Workspace state path must not use symlinks/u);
  assert.equal(readFileSync(join(directory, "metadata.json"), "utf8").length > 0, true);
});

test("a new process reclaims a dead owner lock and completes a crash after workspace publication", () => {
  const { directory } = createWorkspaceState("Crash completion");

  assert.equal(runInterruptedSave(directory, "crash-complete", "afterWorkspacePublished"), 73);
  assert.equal(existsSync(join(directory, ".rexp-studio-workspace-state", "lock")), true);

  recoverWorkspaceState(directory);

  const recovered = loadWorkspaceState(directory);
  assert.equal(recovered.workspace.metadata.workspaceStateMarker, "crash-complete");
  assert.deepEqual(recovered.sidecar, { kind: "file", contents: validSidecarBytes("crash-complete") });
  assert.equal(existsSync(join(directory, ".rexp-studio-workspace-state", "journal.json")), false);
  assert.equal(existsSync(join(directory, ".rexp-studio-workspace-state", "lock")), false);
});

test("a new process discards unjournaled staging left by a crash before backup", () => {
  const { directory } = createWorkspaceState("Crash staging");

  assert.equal(runInterruptedSave(directory, "crash-stage", "afterStageCreated"), 73);
  assert.equal(existsSync(join(directory, ".rexp-studio-workspace-state", "stage", "state.json")), true);
  assert.equal(existsSync(join(directory, ".rexp-studio-workspace-state", "journal.json")), false);

  const recovered = loadWorkspaceState(directory);
  assert.equal(recovered.workspace.metadata.workspaceStateMarker, undefined);
  assert.deepEqual(recovered.sidecar, { kind: "missing" });
  assert.equal(existsSync(join(directory, ".rexp-studio-workspace-state", "stage")), false);
  assert.equal(existsSync(join(directory, ".rexp-studio-workspace-state", "lock")), false);
});

test("a new process finalizes a crash after sidecar publication without losing the journal evidence", () => {
  const { directory } = createWorkspaceState("Crash finalization");

  assert.equal(runInterruptedSave(directory, "crash-final", "afterSidecarPublished"), 73);
  assert.equal(existsSync(join(directory, ".rexp-studio-workspace-state", "journal.json")), true);
  assert.equal(existsSync(join(directory, ".rexp-studio-workspace-state", "stage", "state.json")), true);
  assert.equal(existsSync(join(directory, ".rexp-studio-workspace-state", "backup", "state.json")), true);

  recoverWorkspaceState(directory);

  const recovered = loadWorkspaceState(directory);
  assert.equal(recovered.workspace.metadata.workspaceStateMarker, "crash-final");
  assert.deepEqual(recovered.sidecar, { kind: "file", contents: validSidecarBytes("crash-final") });
  assert.equal(existsSync(join(directory, ".rexp-studio-workspace-state", "journal.json")), false);
  assert.equal(existsSync(join(directory, ".rexp-studio-workspace-state", "stage")), false);
  assert.equal(existsSync(join(directory, ".rexp-studio-workspace-state", "backup")), false);
});

test("an interrupted in-place mutation recovers one complete new pair", () => {
  const { directory, state } = createWorkspaceState("In-place crash isolation");
  saveWorkspaceState(directory, withWorkspaceMarker(state, "old-pair"));

  assert.equal(runInterruptedInPlaceMutation(directory, "new-pair"), 73);
  recoverWorkspaceState(directory);

  const recovered = loadWorkspaceState(directory);
  assert.equal(recovered.workspace.metadata.workspaceStateMarker, "new-pair");
  assert.deepEqual(recovered.sidecar, { kind: "file", contents: validSidecarBytes("new-pair") });
});

test("forced initialization recovery never joins a replacement workspace to the prior sidecar", () => {
  const { directory, state } = createWorkspaceState("Before forced replacement");
  saveWorkspaceState(directory, withWorkspaceMarker(state, "old-sidecar"));

  assert.equal(runInterruptedForcedReplacement(directory), 73);
  assert.equal(existsSync(join(directory, ".rexp-studio-workspace-state", "journal.json")), true);

  recoverWorkspaceState(directory);
  const recovered = loadWorkspaceState(directory);
  const restoredOldPair = recovered.workspace.metadata.workspaceStateMarker === "old-sidecar"
    && recovered.sidecar.kind === "file"
    && recovered.sidecar.contents.equals(validSidecarBytes("old-sidecar"));
  const publishedFreshPair = recovered.workspace.metadata.workspaceStateMarker === "forced-replacement"
    && recovered.sidecar.kind === "missing";
  assert.equal(restoredOldPair || publishedFreshPair, true);
  assert.equal(recovered.workspace.metadata.workspaceStateMarker, "forced-replacement");
  assert.deepEqual(recovered.sidecar, { kind: "missing" });
  assert.equal(existsSync(join(directory, ".rexp-studio-workspace-state", "journal.json")), false);
});

function startAtomicMutation(directory: string, key: string, value: string, holdMilliseconds: number, retryBusy = false) {
  const program = [
    "const storage = await import(process.env.REXP_WORKSPACE_STATE_URL);",
    "const pause = (milliseconds) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);",
    "let attempts = 0;",
    "for (;;) {",
    "  try {",
    "    storage.mutateWorkspaceState(process.env.REXP_WORKSPACE_DIR, (current) => {",
    "      process.stdout.write('entered\\n');",
    "      if (Number(process.env.REXP_WORKSPACE_HOLD_MILLISECONDS) > 0) pause(Number(process.env.REXP_WORKSPACE_HOLD_MILLISECONDS));",
    "      return { workspace: { ...current.workspace, metadata: { ...current.workspace.metadata, [process.env.REXP_WORKSPACE_KEY]: process.env.REXP_WORKSPACE_VALUE } }, sidecar: current.sidecar };",
    "    });",
    "    break;",
    "  } catch (error) {",
    "    if (process.env.REXP_RETRY_BUSY !== 'true' || !(error instanceof Error) || !/Workspace state is busy/u.test(error.message) || attempts >= 100) throw error;",
    "    attempts += 1;",
    "    process.stdout.write('busy\\n');",
    "    pause(10);",
    "  }",
    "}",
  ].join("\n");
  return spawn(process.execPath, ["--input-type=module", "--eval", program], {
    env: {
      ...process.env,
      REXP_WORKSPACE_STATE_URL: new URL("../src/workspace-state/persistence.js", import.meta.url).href,
      REXP_WORKSPACE_DIR: directory,
      REXP_WORKSPACE_KEY: key,
      REXP_WORKSPACE_VALUE: value,
      REXP_WORKSPACE_HOLD_MILLISECONDS: String(holdMilliseconds),
      REXP_RETRY_BUSY: String(retryBusy),
    },
  });
}

function waitForOutput(child: ReturnType<typeof spawn>, expected: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const stdout = child.stdout;
    if (stdout === null) { reject(new Error("Atomic mutation process has no stdout")); return; }
    let output = "";
    stdout.setEncoding("utf8");
    stdout.on("data", (chunk: string) => {
      output += chunk;
      if (output.includes(expected)) resolve();
    });
    child.once("error", reject);
    child.once("exit", (status) => reject(new Error(`Atomic mutation process exited before ${expected.trim()}: ${String(status)}`)));
  });
}

function collectProcess(child: ReturnType<typeof spawn>): Promise<{ readonly status: number | null; readonly stdout: string; readonly stderr: string }> {
  return new Promise((resolve, reject) => {
    const output = child.stdout;
    const errors = child.stderr;
    if (output === null || errors === null) { reject(new Error("Atomic mutation process has no output streams")); return; }
    let stdout = "";
    let stderr = "";
    output.setEncoding("utf8");
    errors.setEncoding("utf8");
    output.on("data", (chunk: string) => { stdout += chunk; });
    errors.on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (status) => resolve({ status, stdout, stderr }));
  });
}
