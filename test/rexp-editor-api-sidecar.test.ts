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


test("serves Apple schema, custom settings, sidecar, and mobileconfig inspection APIs", async () => {
  const bundle = loadTemplateBundle();
  const root = mkdtempSync(join(tmpdir(), "relution-editor-apple-schema-"));
  const out = join(root, "policy.rexp");
  const workspaceDir = join(root, "workspace");
  const workspace = createNewWorkspace({
    workspace: workspaceDir,
    platform: "MACOS",
    name: "API Apple Schema Test",
    serverVersion: bundle.serverVersion,
  });
  const handle = await startEditorServer({
    workspace: workspaceDir,
    out,
    key: password,
    port: 0,
    host: "127.0.0.1",
  });

  try {
    const state = await getJson<AppleSchemaEditorStateResponse>(`${handle.url}api/state`);
    assert.equal(state.appleSchema.counts.profile, 126);
    assert.deepEqual(state.sidecar.ddmArtifacts, []);

    const addProfileResponse = await postJson(`${handle.url}api/apple-profile/add`, {
      policyPath: requirePolicyPath(workspace),
      versionIndex: 0,
      schemaId: "profile:com.apple.security.acme",
    });
    assert.equal(addProfileResponse.ok, true);
    const addProfileResult = await addProfileResponse.json() as WorkspaceValidationResponse;
    assert.equal(addProfileResult.validation.ok, true);
    assert.equal(configurationTypes(addProfileResult.workspace).includes("APPLE_MOBILECONFIG"), true);

    const customSettingsResponse = await postJson(`${handle.url}api/custom-settings/add`, {
      policyPath: requirePolicyPath(workspace),
      versionIndex: 0,
      domain: "com.example.managed",
      settings: { ExampleKey: "ExampleValue" },
    });
    assert.equal(customSettingsResponse.ok, true);
    const customSettingsResult = await customSettingsResponse.json() as WorkspaceValidationResponse;
    assert.equal(customSettingsResult.validation.ok, true);
    assert.equal(configurationTypes(customSettingsResult.workspace).filter((type) => type === "APPLE_MOBILECONFIG").length, 2);

    const ddmResponse = await postJson(`${handle.url}api/ddm/artifact`, {
      schemaId: "ddm-configuration:com.apple.configuration.softwareupdate.settings",
      values: { Notifications: false },
    });
    assert.equal(ddmResponse.ok, true);
    const ddmResult = await ddmResponse.json() as { sidecar: { ddmArtifacts: Array<{ identifier?: string; payload?: Record<string, unknown> }> } };
    assert.equal(ddmResult.sidecar.ddmArtifacts.length, 1);
    assert.equal(ddmResult.sidecar.ddmArtifacts[0]?.identifier, "com.apple.configuration.softwareupdate.settings");
    assert.equal(ddmResult.sidecar.ddmArtifacts[0]?.payload?.Notifications, false);

    const commandResponse = await postJson(`${handle.url}api/mdm-command/artifact`, {
      schemaId: "mdm-command:DeclarativeManagement",
    });
    assert.equal(commandResponse.ok, true);
    const commandResult = await commandResponse.json() as { sidecar: { mdmCommandArtifacts: Array<{ requestType?: string }> } };
    assert.equal(commandResult.sidecar.mdmCommandArtifacts[0]?.requestType, "DeclarativeManagement");

    const inspectResponse = await postJson(`${handle.url}api/mobileconfig/inspect`, {
      rawContent: "-----BEGIN PKCS7-----\nopaque\n-----END PKCS7-----",
    });
    assert.equal(inspectResponse.ok, true);
    const inspection = await inspectResponse.json() as { signatureState?: string };
    assert.equal(inspection.signatureState, "signed-opaque");

    const buildResponse = await postJson(`${handle.url}api/build`, {});
    assert.equal(buildResponse.ok, true);
    const buildResult = await buildResponse.json() as { sidecar: { mobileConfigRestore: unknown[] } };
    assert.equal(buildResult.sidecar.mobileConfigRestore.length, 2);
    assert.equal(loadEditorSidecar(workspaceDir).mobileConfigRestore.length, 2);
    assert.equal(verifyRexp(out, password).ok, true);
  } finally {
    await handle.close();
  }
});


test("adds, updates, removes DDM artifacts, and returns reconcile shape", async () => {
  const bundle = loadTemplateBundle();
  const root = mkdtempSync(join(tmpdir(), "relution-editor-ddm-artifacts-"));
  const out = join(root, "policy.rexp");
  const workspaceDir = join(root, "workspace");
  createNewWorkspace({
    workspace: workspaceDir,
    platform: "MACOS",
    name: "DDM Artifact Test",
    serverVersion: bundle.serverVersion,
  });
  const handle = await startEditorServer({
    workspace: workspaceDir,
    out,
    key: password,
    port: 0,
    host: "127.0.0.1",
  });

  try {
    const addResponse = await postJson(`${handle.url}api/ddm/artifact`, {
      schemaId: "ddm-configuration:com.apple.configuration.softwareupdate.settings",
      values: { Notifications: false },
    });
    assert.equal(addResponse.ok, true);
    const addResult = await addResponse.json() as SidecarResponse;
    const artifact = addResult.sidecar.ddmArtifacts[0];
    assert.notEqual(artifact, undefined);
    assert.equal(artifact?.payload.Notifications, false);

    const updateResponse = await postJson(`${handle.url}api/ddm/artifact/update`, {
      uuid: artifact?.uuid,
      values: { Notifications: true },
    });
    assert.equal(updateResponse.ok, true);
    const updateResult = await updateResponse.json() as SidecarResponse;
    const updated = updateResult.sidecar.ddmArtifacts[0];
    assert.equal(updated?.uuid, artifact?.uuid);
    assert.equal(updated?.schemaId, "ddm-configuration:com.apple.configuration.softwareupdate.settings");
    assert.equal(updated?.payload.Notifications, true);

    const reconcileResponse = await postJson(`${handle.url}api/roundtrip/reconcile`, {});
    assert.equal(reconcileResponse.ok, true);
    const reconcileResult = await reconcileResponse.json() as ReconcileResponse;
    assert.equal(reconcileResult.validation.ok, true);
    assert.equal(reconcileResult.workspace.policies.length, 1);
    assert.equal(reconcileResult.sidecar.ddmArtifacts.length, 1);

    const removeResponse = await postJson(`${handle.url}api/ddm/artifact/remove`, { uuid: artifact?.uuid });
    assert.equal(removeResponse.ok, true);
    const removeResult = await removeResponse.json() as SidecarResponse;
    assert.deepEqual(removeResult.sidecar.ddmArtifacts, []);
  } finally {
    await handle.close();
  }
});

test("blocks builds for invalid mobileconfig details saved in the workspace", async () => {
  const bundle = loadTemplateBundle();
  const root = mkdtempSync(join(tmpdir(), "relution-editor-invalid-mobileconfig-"));
  const out = join(root, "policy.rexp");
  const workspaceDir = join(root, "workspace");
  const workspace = createNewWorkspace({
    workspace: workspaceDir,
    platform: "IOS",
    name: "Invalid Mobileconfig Test",
    serverVersion: bundle.serverVersion,
  });
  addConfigurationToWorkspace(workspaceDir, bundle, {
    policyPath: requirePolicyPath(workspace),
    versionIndex: 0,
    type: "APPLE_MOBILECONFIG",
  });
  const handle = await startEditorServer({
    workspace: workspaceDir,
    out,
    key: password,
    port: 0,
    host: "127.0.0.1",
  });

  try {
    const invalidWorkspace = loadWorkspace(workspaceDir);
    const firstPolicy = invalidWorkspace.policies[0];
    const firstVersion = Array.isArray(firstPolicy?.document.versions) ? firstPolicy.document.versions[0] : undefined;
    const firstVersionRecord =
      typeof firstVersion === "object" && firstVersion !== null && !Array.isArray(firstVersion)
        ? (firstVersion as Record<string, unknown>)
        : undefined;
    const firstConfiguration = Array.isArray(firstVersionRecord?.configurations) ? firstVersionRecord.configurations[0] : undefined;
    const firstConfigurationRecord =
      typeof firstConfiguration === "object" && firstConfiguration !== null && !Array.isArray(firstConfiguration)
        ? (firstConfiguration as Record<string, unknown>)
        : undefined;
    const details =
      typeof firstConfigurationRecord?.details === "object" &&
      firstConfigurationRecord.details !== null &&
      !Array.isArray(firstConfigurationRecord.details)
        ? (firstConfigurationRecord.details as Record<string, unknown>)
        : undefined;
    assert.notEqual(details, undefined);
    if (details !== undefined) {
      details.rawContent = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        "<plist version=\"1.0\">",
        "<dict>",
        "<key>PayloadType</key>",
        "<string>Configuration</string>",
        "<key>PayloadContent</key>",
        "<array>",
        "<dict>",
        "<key>PayloadType</key>",
        "<string>com.apple.associated-domains</string>",
        "</array>",
        "</dict>",
        "</plist>",
      ].join("\n");
      details.payloadContent = { stale: true };
      details.secondLevelPayloadType = "com.apple.associated-domains";
      details.mobileConfigSignatureState = "signed-invalid";
    }

    const saveResponse = await postJson(`${handle.url}api/workspace`, { workspace: invalidWorkspace });
    assert.equal(saveResponse.ok, true);
    const saveResult = await saveResponse.json() as WorkspaceValidationResponse;
    assert.equal(saveResult.validation.ok, false);

    const buildResponse = await postJson(`${handle.url}api/build`, {});
    assert.equal(buildResponse.status, 400);
    const buildResult = await buildResponse.json() as { validation?: { errors?: Array<{ message?: string }> } };
    assert.match(JSON.stringify(buildResult.validation?.errors ?? []), /mobileconfig/i);
  } finally {
    await handle.close();
  }
});

test("adds, updates, and removes MDM command artifacts", async () => {
  const bundle = loadTemplateBundle();
  const root = mkdtempSync(join(tmpdir(), "relution-editor-mdm-command-artifacts-"));
  const out = join(root, "policy.rexp");
  const workspaceDir = join(root, "workspace");
  createNewWorkspace({
    workspace: workspaceDir,
    platform: "IOS",
    name: "MDM Command Artifact Test",
    serverVersion: bundle.serverVersion,
  });
  const handle = await startEditorServer({
    workspace: workspaceDir,
    out,
    key: password,
    port: 0,
    host: "127.0.0.1",
  });

  try {
    const addResponse = await postJson(`${handle.url}api/mdm-command/artifact`, {
      schemaId: "mdm-command:InstallApplication",
      values: { Identifier: "com.example.initial" },
    });
    assert.equal(addResponse.ok, true);
    const addResult = await addResponse.json() as SidecarResponse;
    const artifact = addResult.sidecar.mdmCommandArtifacts[0];
    assert.notEqual(artifact, undefined);
    assert.equal(artifact?.requestType, "InstallApplication");
    assert.equal(artifact?.payload.RequestType, "InstallApplication");
    assert.equal(artifact?.payload.Identifier, "com.example.initial");

    const updateResponse = await postJson(`${handle.url}api/mdm-command/artifact/update`, {
      uuid: artifact?.uuid,
      values: { Identifier: "com.example.updated", iTunesStoreID: 42 },
    });
    assert.equal(updateResponse.ok, true);
    const updateResult = await updateResponse.json() as SidecarResponse;
    const updated = updateResult.sidecar.mdmCommandArtifacts[0];
    assert.equal(updated?.uuid, artifact?.uuid);
    assert.equal(updated?.schemaId, "mdm-command:InstallApplication");
    assert.equal(updated?.payload.RequestType, "InstallApplication");
    assert.equal(updated?.payload.Identifier, "com.example.updated");
    assert.equal(updated?.payload.iTunesStoreID, 42);

    const removeResponse = await postJson(`${handle.url}api/mdm-command/artifact/remove`, { uuid: artifact?.uuid });
    assert.equal(removeResponse.ok, true);
    const removeResult = await removeResponse.json() as SidecarResponse;
    assert.deepEqual(removeResult.sidecar.mdmCommandArtifacts, []);
  } finally {
    await handle.close();
  }
});
