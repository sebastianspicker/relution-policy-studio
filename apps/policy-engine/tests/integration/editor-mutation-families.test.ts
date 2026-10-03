/** Exercises representative editor mutations through the authenticated loopback boundary. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { buildVerifiedArchive } from "../../src/application/editor-archive-compliance.js";
import { loadAppleSchemaCatalog } from "../../src/apple/apple-schema-catalog.js";
import { loadTemplateBundle } from "../../src/assurance/template-bundle.js";
import { extractRexp } from "../../src/archive/rexp-extraction.js";
import { verifyRexp } from "../../src/archive/rexp-inspection.js";
import { packPlainDirectory } from "../../src/archive/rexp-packing.js";
import { readZip } from "../../src/archive/zip.js";
import { buildVerifiedEditorArchive } from "../../src/editor/editor-build-publish.js";
import { startEditorServer } from "../../src/editor/editor-server.js";
import type { ComplianceReport } from "../../src/assurance/compliance-types.js";
import { captureEditorArchiveSnapshot } from "../../src/workspace-state/editor-port.js";
import { loadWorkspaceState, saveWorkspaceState } from "../../src/workspace-state/persistence.js";
import { editorRequest, rawEditorRequest } from "../support/editor-http.js";
import { createTestWorkspace } from "../support/workspace.js";

interface EditorState {
  readonly revision: string;
  readonly workspace: {
    readonly metadata: Record<string, unknown>;
    readonly policies: Array<{
      readonly path: string;
      readonly document: { readonly name: string; readonly versions: Array<{ readonly configurations?: unknown[] }> };
    }>;
  };
  readonly sidecar: { readonly version: number; readonly mobileConfigRestore: unknown[] };
}

test("loopback mutations persist native configurations and Apple profiles as one workspace-sidecar boundary", async () => {
  const fixture = createTestWorkspace("Mutation families");
  const handle = await startEditorServer({ workspace: fixture.workspace, out: fixture.archive, key: fixture.key, host: "127.0.0.1", port: 0, apiToken: "mutation-families-token" });
  let restarted: Awaited<ReturnType<typeof startEditorServer>> | undefined;
  try {
    const initial = await editorRequest<EditorState>(handle.url, handle.apiToken, "/api/state");
    const policy = initial.workspace.policies[0]!;
    const initialCount = configurationCount(initial);
    const configurationType = loadTemplateBundle().configurationTypes.find((candidate) => candidate.platforms.includes("IOS"))?.type;
    assert.notEqual(configurationType, undefined, "fixture requires an iOS configuration template");

    const native = await editorRequest<{ readonly workspace: EditorState["workspace"]; readonly validation: { readonly ok: boolean }; readonly revision: string }>(handle.url, handle.apiToken, "/api/add-configuration", {
      policyPath: policy.path,
      versionIndex: 0,
      type: configurationType,
      expectedRevision: initial.revision,
    });
    assert.equal(native.validation.ok, true);
    assert.equal(configurationCount({ workspace: native.workspace }), initialCount + 1);

    const profile = loadAppleSchemaCatalog().entries.find((entry) => entry.kind === "profile" && entry.availability.platforms.includes("IOS") && entry.fields.every((field) => !field.required));
    assert.notEqual(profile, undefined, "fixture requires a defaultable iOS Apple profile");
    const custom = await editorRequest<{ readonly workspace: EditorState["workspace"]; readonly sidecar: EditorState["sidecar"] }>(handle.url, handle.apiToken, "/api/apple-profile/add", {
      policyPath: policy.path,
      versionIndex: 0,
      schemaId: profile!.id,
      expectedRevision: native.revision,
    });
    assert.equal(configurationCount({ workspace: custom.workspace }), initialCount + 2);
    assert.equal(custom.sidecar.version, 1);

    await handle.close();
    restarted = await startEditorServer({ workspace: fixture.workspace, out: fixture.archive, key: fixture.key, host: "127.0.0.1", port: 0, apiToken: "mutation-families-restarted-token" });
    try {
      const persisted = await editorRequest<EditorState>(restarted.url, restarted.apiToken, "/api/state");
      assert.equal(configurationCount(persisted), initialCount + 2);
      assert.equal(persisted.sidecar.version, custom.sidecar.version);
      assert.match(JSON.stringify(persisted.workspace), new RegExp(profile!.id.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
    } finally {
      await restarted.close();
    }
  } finally {
    await restarted?.close();
    await handle.close();
    fixture.cleanup();
  }
});

test("loopback compliance check and apply select an available remediation and publish the resulting workspace", async () => {
  const fixture = createTestWorkspace("Compliance mutation");
  const handle = await startEditorServer({ workspace: fixture.workspace, out: fixture.archive, key: fixture.key, host: "127.0.0.1", port: 0, apiToken: "compliance-mutation-token" });
  try {
    const state = await editorRequest<EditorState>(handle.url, handle.apiToken, "/api/state");
    const sources = ["bsi", "vendor", "cis"];
    const applicability = { enrollmentChannel: "IOS", osVersion: "26", deviceOwnership: "organization", supervision: "supervised" };
    const checked = await editorRequest<{ readonly report: ComplianceReport; readonly revision: string }>(handle.url, handle.apiToken, "/api/compliance/check", {
      expectedRevision: state.revision,
      target: { policyPath: state.workspace.policies[0]!.path, versionIndex: 0 },
      sources, applicability,
    });
    const candidate = checked.report.results.flatMap((result) => result.remediationOptions
      .filter((option) => option.available !== false)
      .map((option) => ({ result, option })))[0];
    assert.notEqual(candidate, undefined, "fixture recommendation catalogs must provide one applicable remediation");

    const applied = await editorRequest<{ readonly workspace: EditorState["workspace"]; readonly validation: { readonly ok: boolean }; readonly report: ComplianceReport }>(handle.url, handle.apiToken, "/api/compliance/apply", {
      expectedRevision: checked.revision,
      target: { policyPath: state.workspace.policies[0]!.path, versionIndex: 0 },
      sources, applicability,
      source: candidate!.result.source,
      recommendationId: candidate!.result.recommendationId,
      remediationId: candidate!.option.id,
    });
    assert.equal(applied.validation.ok, true);
    assert.equal(applied.report.policyPath, state.workspace.policies[0]!.path);

    const persisted = await editorRequest<EditorState>(handle.url, handle.apiToken, "/api/state");
    assert.deepEqual(persisted.workspace, applied.workspace);
  } finally {
    await handle.close();
    fixture.cleanup();
  }
});

test("interleaved compliance remediation applies the locked current workspace and rejects a stale target", async () => {
  const fixture = createTestWorkspace("Stale compliance remediation");
  const first = await startEditorServer({ workspace: fixture.workspace, out: fixture.archive, key: fixture.key, host: "127.0.0.1", port: 0, apiToken: "stale-compliance-first" });
  const second = await startEditorServer({ workspace: fixture.workspace, out: fixture.archive, key: fixture.key, host: "127.0.0.1", port: 0, apiToken: "stale-compliance-second" });
  try {
    const [left, right] = await Promise.all([
      editorRequest<EditorState>(first.url, first.apiToken, "/api/state"),
      editorRequest<EditorState>(second.url, second.apiToken, "/api/state"),
    ]);
    const sources = ["bsi", "vendor", "cis"];
    const applicability = { enrollmentChannel: "IOS", osVersion: "26", deviceOwnership: "organization", supervision: "supervised" };
    const checked = await editorRequest<{ readonly report: ComplianceReport; readonly revision: string }>(first.url, first.apiToken, "/api/compliance/check", {
      expectedRevision: left.revision, target: { policyPath: left.workspace.policies[0]!.path, versionIndex: 0 }, sources, applicability,
    });
    const candidate = checked.report.results.flatMap((result) => result.remediationOptions
      .filter((option) => option.available !== false)
      .map((option) => ({ result, option })))[0];
    assert.notEqual(candidate, undefined, "fixture recommendation catalogs must provide one applicable remediation");
    const request = {
      target: { policyPath: left.workspace.policies[0]!.path, versionIndex: 0 }, sources, applicability,
      source: candidate!.result.source, recommendationId: candidate!.result.recommendationId, remediationId: candidate!.option.id,
    };
    const accepted = await editorRequest<{ readonly workspace: EditorState["workspace"]; readonly revision: string }>(first.url, first.apiToken, "/api/compliance/apply", {
      ...request, expectedRevision: checked.revision,
    });
    const rejected = await rawEditorRequest(second.url, second.apiToken, "/api/compliance/apply", {
      ...request, expectedRevision: right.revision,
    });
    assert.equal(rejected.status, 409);
    assert.match(JSON.stringify(rejected.body), /Workspace changed/u);
    const persisted = await editorRequest<EditorState>(first.url, first.apiToken, "/api/state");
    assert.deepEqual(persisted.workspace, accepted.workspace);
    assert.equal(persisted.revision, accepted.revision);
  } finally {
    await Promise.all([first.close(), second.close()]);
    fixture.cleanup();
  }
});

test("all durable editor mutation families reject an interleaved stale revision without replacing the accepted state", async () => {
  const fixture = createTestWorkspace("Stale editor mutation matrix");
  const source = createTestWorkspace("Stale archive replacement");
  packPlainDirectory(source.workspace, source.archive, source.key);
  const first = await startEditorServer({ workspace: fixture.workspace, out: fixture.archive, key: fixture.key, host: "127.0.0.1", port: 0, apiToken: "stale-matrix-first" });
  const second = await startEditorServer({ workspace: fixture.workspace, out: fixture.archive, key: fixture.key, host: "127.0.0.1", port: 0, apiToken: "stale-matrix-second" });
  try {
    const [left, right] = await Promise.all([
      editorRequest<EditorState>(first.url, first.apiToken, "/api/state"),
      editorRequest<EditorState>(second.url, second.apiToken, "/api/state"),
    ]);
    const policyPath = left.workspace.policies[0]!.path;
    const catalog = loadAppleSchemaCatalog();
    const ddmEntry = catalog.entries.find((entry) => entry.kind.startsWith("ddm-") && entry.kind !== "ddm-status" && entry.fields.every((field) => !field.required));
    const mdmCommandEntry = catalog.entries.find((entry) => entry.kind === "mdm-command" && entry.fields.every((field) => !field.required));
    assert.notEqual(ddmEntry, undefined, "fixture requires a defaultable DDM authoring entry");
    assert.notEqual(mdmCommandEntry, undefined, "fixture requires a defaultable MDM command entry");
    const accepted = await editorRequest<{ readonly workspace: EditorState["workspace"]; readonly revision: string }>(first.url, first.apiToken, "/api/add-policy", {
      platform: "IOS", name: "Accepted before stale requests", expectedRevision: left.revision,
    });
    const staleRequests: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
      ["/api/workspace", { workspace: right.workspace, expectedRevision: right.revision }],
      ["/api/roundtrip/reconcile", { expectedRevision: right.revision }],
      ["/api/add-configuration", { policyPath, versionIndex: 0, type: "IOS_PASSCODE", expectedRevision: right.revision }],
      ["/api/apple-compat/add", { policyPath, versionIndex: 0, settingId: "com.apple.applicationaccess", expectedRevision: right.revision }],
      ["/api/configuration/remove", { policyPath, versionIndex: 0, configurationIndex: 0, expectedRevision: right.revision }],
      ["/api/configuration/move", { policyPath, versionIndex: 0, configurationIndex: 0, direction: "down", expectedRevision: right.revision }],
      ["/api/add-policy", { platform: "IOS", name: "Stale policy", expectedRevision: right.revision }],
      ["/api/apple-profile/add", { policyPath, versionIndex: 0, schemaId: "com.apple.test", expectedRevision: right.revision }],
      ["/api/custom-settings/add", { policyPath, versionIndex: 0, expectedRevision: right.revision }],
      ["/api/ddm/artifact", { schemaId: ddmEntry!.id, expectedRevision: right.revision }],
      ["/api/ddm/artifact/update", { uuid: "stale", values: {}, expectedRevision: right.revision }],
      ["/api/ddm/artifact/remove", { uuid: "stale", expectedRevision: right.revision }],
      ["/api/mdm-command/artifact", { schemaId: mdmCommandEntry!.id, expectedRevision: right.revision }],
      ["/api/mdm-command/artifact/update", { uuid: "stale", values: {}, expectedRevision: right.revision }],
      ["/api/mdm-command/artifact/remove", { uuid: "stale", expectedRevision: right.revision }],
      ["/api/import", { dataBase64: readFileSync(source.archive).toString("base64"), key: source.key, expectedRevision: right.revision }],
    ];
    for (const [path, body] of staleRequests) {
      const rejected = await rawEditorRequest(second.url, second.apiToken, path, body);
      assert.equal(rejected.status, 409, path);
      assert.match(JSON.stringify(rejected.body), /Workspace changed/u, path);
    }
    const persisted = await editorRequest<EditorState>(first.url, first.apiToken, "/api/state");
    assert.deepEqual(persisted.workspace, accepted.workspace);
    assert.equal(persisted.revision, accepted.revision);
  } finally {
    await Promise.all([first.close(), second.close()]);
    source.cleanup();
    fixture.cleanup();
  }
});

test("loopback archive import and verified build retain local sidecar state while emitting a verified archive", async () => {
  const fixture = createTestWorkspace("Build destination");
  const source = createTestWorkspace("Imported archive policy");
  packPlainDirectory(source.workspace, source.archive, source.key);
  const handle = await startEditorServer({ workspace: fixture.workspace, out: fixture.archive, key: fixture.key, host: "127.0.0.1", port: 0, apiToken: "archive-mutation-token" });
  try {
    const imported = await editorRequest<EditorState>(handle.url, handle.apiToken, "/api/import", {
      dataBase64: readFileSync(source.archive).toString("base64"),
      key: source.key,
      expectedRevision: (await editorRequest<EditorState>(handle.url, handle.apiToken, "/api/state")).revision,
    });
    assert.equal(imported.workspace.policies[0]!.document.name, "Imported archive policy");
    assert.equal(imported.sidecar.version, 1);

    const built = await editorRequest<{ readonly verification: { readonly ok: boolean }; readonly sidecar: EditorState["sidecar"] }>(handle.url, handle.apiToken, "/api/build", {});
    assert.equal(built.verification.ok, true);
    assert.equal(existsSync(fixture.archive), true);
    assert.equal(verifyRexp(fixture.archive, source.key).ok, true);
    assert.equal(readZip(readFileSync(fixture.archive)).some((entry) => entry.name.includes("sidecar")), false);

    const persisted = await editorRequest<EditorState>(handle.url, handle.apiToken, "/api/state");
    assert.equal(persisted.workspace.policies[0]!.document.name, "Imported archive policy");
    assert.deepEqual(persisted.sidecar, built.sidecar);
  } finally {
    await handle.close();
    source.cleanup();
    fixture.cleanup();
  }
});

test("archive build validates, responds from, and packs one immutable workspace-state snapshot", () => {
  const fixture = createTestWorkspace("Snapshot before mutation");
  const extracted = join(fixture.root, "extracted");
  try {
    writeSnapshotSidecar(fixture.workspace, "before-mutation");
    const result = buildVerifiedArchive(fixture.key, {
      bundle: loadTemplateBundle(),
      archive: {
        captureSnapshot: () => {
          const snapshot = captureEditorArchiveSnapshot(
            { workspaceDir: fixture.workspace, appleSchemaRevision: "snapshot-test" },
            (key, workspace) => {
              const mutation = mutateWorkspaceInAnotherProcess(fixture.workspace, "Snapshot after mutation", "after-mutation");
              assert.equal(mutation.status, 0, mutation.stderr.toString());
              assert.throws(() => Object.assign(workspace.metadata, { snapshotMutation: "blocked" }), TypeError);
              assert.equal(workspace.metadata.snapshotMutation, undefined);
              return buildVerifiedEditorArchive({ workspace, output: fixture.archive, key });
            },
          );
          assert.throws(() => Object.assign(snapshot.validationWorkspace.metadata, { snapshotMutation: "blocked" }), TypeError);
          assert.equal(snapshot.validationWorkspace.metadata.snapshotMutation, undefined);
          return snapshot;
        },
      },
    });

    assert.equal(result.kind, "built");
    if (result.kind !== "built") return;
    assert.equal(result.sidecar.appleSchemaRevision, "before-mutation");
    extractRexp(fixture.archive, extracted, fixture.key);
    assert.match(JSON.stringify(loadWorkspaceState(extracted).workspace), /Snapshot before mutation/u);
    assert.match(JSON.stringify(loadWorkspaceState(fixture.workspace).workspace), /Snapshot after mutation/u);
  } finally {
    fixture.cleanup();
  }
});

function writeSnapshotSidecar(workspace: string, revision: string): void {
  const state = loadWorkspaceState(workspace);
  saveWorkspaceState(workspace, {
    workspace: state.workspace,
    sidecar: {
      kind: "file",
      contents: Buffer.from(JSON.stringify({ version: 1, appleSchemaRevision: revision, mobileConfigRestore: [], ddmArtifacts: [], mdmCommandArtifacts: [], customManifests: [] }) + "\n"),
    },
  });
}

function mutateWorkspaceInAnotherProcess(workspace: string, name: string, revision: string) {
  const program = [
    "const storage = await import(process.env.REXP_WORKSPACE_STATE_URL);",
    "const exportReport = await import(process.env.REXP_WORKSPACE_EXPORT_REPORT_URL);",
    "const state = storage.loadWorkspaceState(process.env.REXP_WORKSPACE_DIR);",
    "const workspace = { ...state.workspace, policies: state.workspace.policies.map((policy, index) => index === 0 ? { ...policy, document: { ...policy.document, name: process.env.REXP_SNAPSHOT_NAME } } : policy) };",
    "exportReport.synchronizeWorkspaceExportReport(workspace);",
    "const sidecar = Buffer.from(JSON.stringify({ version: 1, appleSchemaRevision: process.env.REXP_SNAPSHOT_REVISION, mobileConfigRestore: [], ddmArtifacts: [], mdmCommandArtifacts: [], customManifests: [] }) + '\\n');",
    "storage.saveWorkspaceState(process.env.REXP_WORKSPACE_DIR, { workspace, sidecar: { kind: 'file', contents: sidecar } });",
  ].join("\n");
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", program], {
    env: {
      ...process.env,
      REXP_WORKSPACE_STATE_URL: new URL("../../src/workspace-state/persistence.js", import.meta.url).href,
      REXP_WORKSPACE_EXPORT_REPORT_URL: new URL("../../src/workspace/workspace-export-report.js", import.meta.url).href,
      REXP_WORKSPACE_DIR: workspace,
      REXP_SNAPSHOT_NAME: name,
      REXP_SNAPSHOT_REVISION: revision,
    },
  });
  return result;
}

function configurationCount(state: Pick<EditorState, "workspace">): number {
  return state.workspace.policies.reduce((count, policy) => count + policy.document.versions.reduce(
    (versionCount, version) => versionCount + (version.configurations?.length ?? 0),
    0,
  ), 0);
}
