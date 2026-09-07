/** Exercises editor mutations through the composite workspace-and-sidecar unit of work. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import test from "node:test";
import { join } from "node:path";
import { startEditorServer } from "../../src/editor/editor-server.js";
import { editorRequest, rawEditorRequest } from "../support/editor-http.js";
import { createTestWorkspace, type TestWorkspace } from "../support/workspace.js";

test("removing an APPLE_MOBILECONFIG refreshes the sidecar so reconciliation cannot restore it", async () => {
  const fixture = createTestWorkspace("Mobileconfig removal");
  const handle = await startEditorServer({ workspace: fixture.workspace, out: fixture.archive, key: fixture.key, host: "127.0.0.1", port: 0, apiToken: "editor-uow-token" });
  try {
    const initial = await editorRequest<EditorState>(handle.url, handle.apiToken, "/api/state");
    const workspace = structuredClone(initial.workspace);
    const version = workspace.policies[0]!.document.versions[0] as { configurations: unknown[] };
    version.configurations.push({
      uuid: "MOBILECONFIG-REMOVAL-TEST",
      details: {
        type: "APPLE_MOBILECONFIG",
        rawContent: "<?xml version=\"1.0\"?><plist version=\"1.0\"><dict/></plist>",
      },
    });

    const imported = await editorRequest<EditorState>(handle.url, handle.apiToken, "/api/workspace", { workspace, expectedRevision: initial.revision });
    assert.equal(imported.sidecar.mobileConfigRestore.length, 1);

    await editorRequest(handle.url, handle.apiToken, "/api/configuration/remove", {
      policyPath: workspace.policies[0]!.path,
      versionIndex: 0,
      configurationIndex: version.configurations.length - 1,
      expectedRevision: imported.revision,
    });
    const afterRemoval = await editorRequest<EditorState>(handle.url, handle.apiToken, "/api/state");
    assert.equal(afterRemoval.sidecar.mobileConfigRestore.length, 0);

    const reconciled = await editorRequest<EditorState>(handle.url, handle.apiToken, "/api/roundtrip/reconcile", { expectedRevision: afterRemoval.revision });
    assert.equal(reconciled.sidecar.mobileConfigRestore.length, 0);
    assert.equal(configurationUuids(reconciled.workspace).includes("MOBILECONFIG-REMOVAL-TEST"), false);

    const reloaded = await editorRequest<EditorState>(handle.url, handle.apiToken, "/api/state");
    assert.equal(reloaded.sidecar.mobileConfigRestore.length, 0);
    assert.equal(configurationUuids(reloaded.workspace).includes("MOBILECONFIG-REMOVAL-TEST"), false);
  } finally {
    await handle.close();
    fixture.cleanup();
  }
});

test("the next editor state read recovers a crash after workspace publication as one composite pair", async () => {
  const fixture = createTestWorkspace("Editor crash recovery");
  try {
    assert.equal(runInterruptedSave(fixture, "editor-crash-recovered"), 73);
    assert.equal(existsSync(join(fixture.workspace, ".rexp-studio-workspace-state", "journal.json")), true);

    const handle = await startEditorServer({ workspace: fixture.workspace, out: fixture.archive, key: fixture.key, host: "127.0.0.1", port: 0, apiToken: "editor-crash-token" });
    try {
      const state = await editorRequest<EditorState>(handle.url, handle.apiToken, "/api/state");
      assert.equal(state.workspace.metadata.workspaceStateMarker, "editor-crash-recovered");
      assert.equal(state.sidecar.appleSchemaRevision, "editor-crash-recovered");
      assert.equal(existsSync(join(fixture.workspace, ".rexp-studio-workspace-state", "journal.json")), false);
    } finally {
      await handle.close();
    }
  } finally {
    fixture.cleanup();
  }
});

test("interleaved full workspace saves reject the stale client without losing the earlier publish", async () => {
  const fixture = createTestWorkspace("Stale workspace save");
  const first = await startEditorServer({ workspace: fixture.workspace, out: fixture.archive, key: fixture.key, host: "127.0.0.1", port: 0, apiToken: "stale-workspace-first" });
  const second = await startEditorServer({ workspace: fixture.workspace, out: fixture.archive, key: fixture.key, host: "127.0.0.1", port: 0, apiToken: "stale-workspace-second" });
  try {
    const [left, right] = await Promise.all([
      editorRequest<EditorState>(first.url, first.apiToken, "/api/state"),
      editorRequest<EditorState>(second.url, second.apiToken, "/api/state"),
    ]);
    assert.equal(left.revision, right.revision);
    const acceptedWorkspace = { ...left.workspace, metadata: { ...left.workspace.metadata, workspaceStateMarker: "accepted" } };
    const staleWorkspace = { ...right.workspace, metadata: { ...right.workspace.metadata, workspaceStateMarker: "stale" } };
    const accepted = await editorRequest<EditorState>(first.url, first.apiToken, "/api/workspace", {
      workspace: acceptedWorkspace, expectedRevision: left.revision,
    });
    const rejected = await rawEditorRequest(second.url, second.apiToken, "/api/workspace", {
      workspace: staleWorkspace, expectedRevision: right.revision,
    });
    assert.equal(rejected.status, 409);
    assert.match(JSON.stringify(rejected.body), /Workspace changed/u);
    const persisted = await editorRequest<EditorState>(first.url, first.apiToken, "/api/state");
    assert.equal(persisted.workspace.metadata.workspaceStateMarker, "accepted");
    assert.equal(persisted.revision, accepted.revision);
  } finally {
    await Promise.all([first.close(), second.close()]);
    fixture.cleanup();
  }
});

test("editor mutation responses use the canonical durable policy order and revision", async () => {
  const fixture = createTestWorkspace("Canonical editor mutation response");
  const handle = await startEditorServer({ workspace: fixture.workspace, out: fixture.archive, key: fixture.key, host: "127.0.0.1", port: 0, apiToken: "canonical-editor-token" });
  try {
    const initial = await editorRequest<EditorState>(handle.url, handle.apiToken, "/api/state");
    const withSecondPolicy = await editorRequest<EditorState>(handle.url, handle.apiToken, "/api/add-policy", {
      platform: "IOS", name: "Second canonical policy", expectedRevision: initial.revision,
    });
    const reversedWorkspace = { ...withSecondPolicy.workspace, policies: [...withSecondPolicy.workspace.policies].reverse() };
    const replaced = await editorRequest<EditorState>(handle.url, handle.apiToken, "/api/workspace", {
      workspace: reversedWorkspace, expectedRevision: withSecondPolicy.revision,
    });
    const durable = await editorRequest<EditorState>(handle.url, handle.apiToken, "/api/state");

    assert.deepEqual(replaced.workspace.policies.map((policy) => policy.path), [...replaced.workspace.policies.map((policy) => policy.path)].sort());
    assert.deepEqual(replaced.workspace, durable.workspace);
    assert.deepEqual(replaced.sidecar, durable.sidecar);
    assert.equal(replaced.revision, durable.revision);

    const accepted = await editorRequest<EditorState>(handle.url, handle.apiToken, "/api/add-policy", {
      platform: "IOS", name: "Revision accepted after canonical response", expectedRevision: replaced.revision,
    });
    assert.equal(accepted.workspace.policies.length, durable.workspace.policies.length + 1);
  } finally {
    await handle.close();
    fixture.cleanup();
  }
});

interface EditorState {
  readonly revision: string;
  readonly workspace: {
    readonly metadata: Record<string, unknown>;
    readonly policies: Array<{ readonly path: string; readonly document: { readonly versions: unknown[] } }>;
  };
  readonly sidecar: { readonly appleSchemaRevision?: string; readonly mobileConfigRestore: unknown[] };
}

function configurationUuids(workspace: EditorState["workspace"]): string[] {
  return workspace.policies.flatMap((policy) => policy.document.versions.flatMap((version) => {
    const configurations = typeof version === "object" && version !== null && Array.isArray((version as { configurations?: unknown }).configurations)
      ? (version as { configurations: unknown[] }).configurations
      : [];
    return configurations.flatMap((configuration) => typeof configuration === "object" && configuration !== null && typeof (configuration as { uuid?: unknown }).uuid === "string"
      ? [(configuration as { uuid: string }).uuid]
      : []);
  }));
}

function runInterruptedSave(fixture: TestWorkspace, marker: string): number | null {
  const program = [
    "const storage = await import(process.env.REXP_WORKSPACE_STATE_URL);",
    "const state = storage.loadWorkspaceState(process.env.REXP_WORKSPACE_DIR);",
    "const sidecar = Buffer.from(JSON.stringify({ version: 1, appleSchemaRevision: process.env.REXP_WORKSPACE_MARKER, mobileConfigRestore: [], ddmArtifacts: [], mdmCommandArtifacts: [], customManifests: [] }) + '\\n');",
    "const next = { workspace: { ...state.workspace, metadata: { ...state.workspace.metadata, workspaceStateMarker: process.env.REXP_WORKSPACE_MARKER } }, sidecar: { kind: 'file', contents: sidecar } };",
    "storage.saveWorkspaceState(process.env.REXP_WORKSPACE_DIR, next, { afterWorkspacePublished: () => process.exit(73) });",
  ].join("\n");
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", program], {
    env: {
      ...process.env,
      REXP_WORKSPACE_STATE_URL: new URL("../../src/workspace-state/persistence.js", import.meta.url).href,
      REXP_WORKSPACE_DIR: fixture.workspace,
      REXP_WORKSPACE_MARKER: marker,
    },
  });
  return result.status;
}
