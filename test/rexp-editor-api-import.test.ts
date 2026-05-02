import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import { resolveStaticAssetPath, startEditorServer } from "../src/editor-server.js";
import { inspectRexp, verifyRexp } from "../src/rexp.js";
import { addDdmArtifact, loadEditorSidecar, recordMobileConfigRestoreEntries } from "../src/sidecar.js";
import { findAppleSchemaEntry, createDdmArtifact } from "../src/apple-schema.js";
import { loadAppleSchemaCatalog } from "../src/apple-schema-catalog.js";
import { loadTemplateBundle } from "../src/templates.js";
import {
  addAppleCompatConfigurationToWorkspace,
  addConfigurationToWorkspace,
  addPolicyToWorkspace,
  createNewWorkspace,
  loadWorkspace,
  type PolicyWorkspace,
} from "../src/workspace.js";
import {
  configurationTypes,
  configurationTypesForPolicy,
  fixture,
  getJson,
  password,
  postJson,
  requirePolicyPath,
  type AddPolicyResponse,
  type AppleSchemaEditorStateResponse,
  type EditorStateResponse,
  type ReconcileResponse,
  type SidecarResponse,
  type WorkspaceValidateOnlyResponse,
  type WorkspaceValidationResponse,
} from "./rexp-helpers.js";
import { readZip, writeZip } from "../src/zip.js";


test("updates the editor encryption key for rebuilt archives", async () => {
  const bundle = loadTemplateBundle();
  const root = mkdtempSync(join(tmpdir(), "relution-editor-key-"));
  const out = join(root, "policy.rexp");
  const workspaceDir = join(root, "workspace");
  const workspace = createNewWorkspace({
    workspace: workspaceDir,
    platform: "IOS",
    name: "API Key Test",
    serverVersion: bundle.serverVersion,
  });
  addConfigurationToWorkspace(workspaceDir, bundle, {
    policyPath: requirePolicyPath(workspace),
    versionIndex: 0,
    type: "IOS_RESTRICTION",
  });
  const handle = await startEditorServer({
    workspace: workspaceDir,
    out,
    key: "old-key",
    port: 0,
    host: "127.0.0.1",
  });

  try {
    const keyResponse = await postJson(`${handle.url}api/key`, { key: "new-key" });
    assert.equal(keyResponse.ok, true);
    const buildResponse = await postJson(`${handle.url}api/build`, {});
    assert.equal(buildResponse.ok, true);
    assert.equal(verifyRexp(out, "new-key").ok, true);
    assert.throws(() => verifyRexp(out, "old-key"), /authenticate|Unsupported state|bad decrypt/i);
  } finally {
    await handle.close();
  }
});

test("blocks archive builds until an encryption key is set", async () => {
  const bundle = loadTemplateBundle();
  const root = mkdtempSync(join(tmpdir(), "relution-editor-no-key-"));
  const out = join(root, "policy.rexp");
  const workspaceDir = join(root, "workspace");
  createNewWorkspace({
    workspace: workspaceDir,
    platform: "IOS",
    name: "No Key Policy",
    serverVersion: bundle.serverVersion,
  });
  const handle = await startEditorServer({
    workspace: workspaceDir,
    out,
    key: "",
    port: 0,
    host: "127.0.0.1",
  });

  try {
    const buildResponse = await postJson(`${handle.url}api/build`, {});
    assert.equal(buildResponse.status, 400);
    const result = await buildResponse.json() as { error?: string };
    assert.match(result.error ?? "", /encryption key/i);
  } finally {
    await handle.close();
  }
});

test("imports an existing rexp through the editor API and rebuilds with the import key", async () => {
  const bundle = loadTemplateBundle();
  const catalog = loadAppleSchemaCatalog();
  const root = mkdtempSync(join(tmpdir(), "relution-editor-import-"));
  const out = join(root, "policy.rexp");
  const workspaceDir = join(root, "workspace");
  const initialWorkspace = createNewWorkspace({
    workspace: workspaceDir,
    platform: "IOS",
    name: "Initial iOS",
    serverVersion: bundle.serverVersion,
  });
  const initialPolicyPath = requirePolicyPath(initialWorkspace);
  addPolicyToWorkspace(workspaceDir, bundle, { platform: "CHROMEOS", name: "Stale ChromeOS" });
  addAppleCompatConfigurationToWorkspace(workspaceDir, {
    policyPath: initialPolicyPath,
    versionIndex: 0,
    settingId: "associated-domains",
  });
  recordMobileConfigRestoreEntries(workspaceDir, loadWorkspace(workspaceDir), catalog.source.revision);
  const ddmEntry = findAppleSchemaEntry(catalog, "ddm-configuration:com.apple.configuration.softwareupdate.settings");
  assert.notEqual(ddmEntry, undefined);
  if (ddmEntry !== undefined) {
    addDdmArtifact(workspaceDir, createDdmArtifact(ddmEntry, { Notifications: false }), catalog.source.revision);
  }
  const handle = await startEditorServer({
    workspace: workspaceDir,
    out,
    key: "old-key",
    port: 0,
    host: "127.0.0.1",
  });

  try {
    assert.equal(initialWorkspace.policies.length, 1);
    assert.equal(loadWorkspace(workspaceDir).policies.length, 2);
    const importResponse = await postJson(`${handle.url}api/import`, {
      fileName: "fixture.rexp",
      key: password,
      dataBase64: readFileSync(fixture).toString("base64"),
    });
    assert.equal(importResponse.ok, true);
    const importResult = await importResponse.json() as {
      workspace: PolicyWorkspace;
      validation: { ok: boolean };
      keySet: boolean;
      sidecar: { mobileConfigRestore: unknown[]; ddmArtifacts: unknown[]; mdmCommandArtifacts: unknown[]; customManifests: unknown[] };
    };
    assert.equal(importResult.keySet, true);
    assert.equal(importResult.validation.ok, true);
    assert.equal(importResult.workspace.policies.length, 1);
    assert.equal(importResult.workspace.policies[0]?.document.name, "Example iOS Policy");
    assert.deepEqual(importResult.sidecar.mobileConfigRestore, []);
    assert.deepEqual(importResult.sidecar.ddmArtifacts, []);
    assert.deepEqual(importResult.sidecar.mdmCommandArtifacts, []);
    assert.deepEqual(importResult.sidecar.customManifests, []);
    assert.equal(loadWorkspace(workspaceDir).policies.length, 1);
    assert.deepEqual(loadEditorSidecar(workspaceDir).mobileConfigRestore, []);
    assert.deepEqual(loadEditorSidecar(workspaceDir).ddmArtifacts, []);

    const buildResponse = await postJson(`${handle.url}api/build`, {});
    assert.equal(buildResponse.ok, true);
    assert.equal(verifyRexp(out, password).ok, true);
    assert.equal(inspectRexp(out, password).policyEntries.length, 1);
  } finally {
    await handle.close();
  }
});

test("restores the previous workspace when import sidecar replacement fails", async () => {
  const bundle = loadTemplateBundle();
  const root = mkdtempSync(join(tmpdir(), "relution-editor-import-rollback-"));
  const out = join(root, "policy.rexp");
  const workspaceDir = join(root, "workspace");
  const original = createNewWorkspace({
    workspace: workspaceDir,
    platform: "IOS",
    name: "Import Rollback Test",
    serverVersion: bundle.serverVersion,
  });
  addPolicyToWorkspace(workspaceDir, bundle, { platform: "CHROMEOS", name: "Keep ChromeOS" });
  const before = loadWorkspace(workspaceDir);
  mkdirSync(join(workspaceDir, "editor-sidecar.json"));
  const handle = await startEditorServer({
    workspace: workspaceDir,
    out,
    key: "old-key",
    port: 0,
    host: "127.0.0.1",
  });

  try {
    const importResponse = await postJson(`${handle.url}api/import`, {
      fileName: "fixture.rexp",
      key: password,
      dataBase64: readFileSync(fixture).toString("base64"),
    });
    assert.equal(importResponse.status, 500);
    assert.deepEqual(loadWorkspace(workspaceDir), before);
    assert.equal(loadWorkspace(workspaceDir).policies.length, original.policies.length + 1);
  } finally {
    await handle.close();
  }
});

test("rejects tampered rexp imports before replacing the editor workspace", async () => {
  const bundle = loadTemplateBundle();
  const root = mkdtempSync(join(tmpdir(), "relution-editor-import-tampered-"));
  const out = join(root, "policy.rexp");
  const workspaceDir = join(root, "workspace");
  createNewWorkspace({
    workspace: workspaceDir,
    platform: "IOS",
    name: "Tampered Import Guard",
    serverVersion: bundle.serverVersion,
  });
  const before = loadWorkspace(workspaceDir);
  const tampered = join(root, "tampered.rexp");
  writeFileSync(
    tampered,
    writeZip(readZip(readFileSync(fixture)).map((entry) => ({
      name: entry.name,
      data: entry.name === "metadata.json" ? Buffer.from('{"tampered":true}\n', "utf8") : entry.data,
    }))),
  );
  const handle = await startEditorServer({
    workspace: workspaceDir,
    out,
    key: "",
    port: 0,
    host: "127.0.0.1",
  });

  try {
    const importResponse = await postJson(`${handle.url}api/import`, {
      fileName: "tampered.rexp",
      key: password,
      dataBase64: readFileSync(tampered).toString("base64"),
    });
    assert.equal(importResponse.status, 500);
    const result = await importResponse.json() as { error?: string };
    assert.match(result.error ?? "", /hash mismatch/i);
    assert.deepEqual(loadWorkspace(workspaceDir), before);
  } finally {
    await handle.close();
  }
});

test("import cleans up temporary extraction directories on success and failure", async () => {
  const bundle = loadTemplateBundle();
  const root = mkdtempSync(join(tmpdir(), "relution-editor-import-cleanup-"));
  const out = join(root, "policy.rexp");
  const workspaceDir = join(root, "workspace");
  createNewWorkspace({
    workspace: workspaceDir,
    platform: "IOS",
    name: "Import Cleanup Test",
    serverVersion: bundle.serverVersion,
  });
  const handle = await startEditorServer({
    workspace: workspaceDir,
    out,
    key: "",
    port: 0,
    host: "127.0.0.1",
  });

  try {
    const beforeSuccess = listImportTempDirectories();
    const successResponse = await postJson(`${handle.url}api/import`, {
      fileName: "fixture.rexp",
      key: password,
      dataBase64: readFileSync(fixture).toString("base64"),
    });
    assert.equal(successResponse.ok, true);
    assert.deepEqual(listImportTempDirectories(), beforeSuccess);

    const beforeFailure = listImportTempDirectories();
    const failureResponse = await postJson(`${handle.url}api/import`, {
      fileName: "fixture.rexp",
      key: "wrong-password",
      dataBase64: readFileSync(fixture).toString("base64"),
    });
    assert.equal(failureResponse.status, 500);
    assert.deepEqual(listImportTempDirectories(), beforeFailure);
  } finally {
    await handle.close();
  }
});

function listImportTempDirectories(): string[] {
  return readdirSync(tmpdir())
    .filter((name) => name.startsWith("relution-rexp-import-"))
    .sort();
}
