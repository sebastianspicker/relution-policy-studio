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


test("validates a posted workspace without saving it", async () => {
  const bundle = loadTemplateBundle();
  const root = mkdtempSync(join(tmpdir(), "relution-editor-validate-"));
  const out = join(root, "policy.rexp");
  const workspaceDir = join(root, "workspace");
  const workspace = createNewWorkspace({
    workspace: workspaceDir,
    platform: "IOS",
    name: "Validate Only Test",
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
    const invalidWorkspace = structuredClone(workspace) as PolicyWorkspace;
    const firstPolicy = invalidWorkspace.policies[0];
    assert.notEqual(firstPolicy, undefined);
    if (firstPolicy !== undefined) {
      firstPolicy.document.platform = "NOT_A_PLATFORM";
    }

    const response = await postJson(`${handle.url}api/workspace/validate`, { workspace: invalidWorkspace });
    assert.equal(response.ok, true);
    const result = await response.json() as WorkspaceValidateOnlyResponse;
    assert.equal(result.validation.ok, false);
    assert.match(result.validation.errors[0]?.message ?? "", /platform is invalid/);
    assert.deepEqual(loadWorkspace(workspaceDir), workspace);
  } finally {
    await handle.close();
  }
});

test("validates generated workspaces larger than the default JSON body limit", async () => {
  const bundle = loadTemplateBundle();
  const root = mkdtempSync(join(tmpdir(), "relution-editor-large-validate-"));
  const out = join(root, "policy.rexp");
  const workspaceDir = join(root, "workspace");
  const workspace = createNewWorkspace({
    workspace: workspaceDir,
    platform: "IOS",
    name: "Large Validate Test",
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
    const largeWorkspace = expandWorkspace(workspace, 500);
    assert.equal(JSON.stringify({ workspace: largeWorkspace }).length > 1024 * 1024, true);

    const response = await postJson(`${handle.url}api/workspace/validate`, { workspace: largeWorkspace });
    assert.equal(response.ok, true);
    const result = await response.json() as WorkspaceValidateOnlyResponse;
    assert.equal(result.validation.ok, true);
    assert.deepEqual(loadWorkspace(workspaceDir), workspace);
  } finally {
    await handle.close();
  }
});

test("replaces persisted policies when a workspace save removes one", async () => {
  const bundle = loadTemplateBundle();
  const root = mkdtempSync(join(tmpdir(), "relution-editor-save-replace-"));
  const out = join(root, "policy.rexp");
  const workspaceDir = join(root, "workspace");
  createNewWorkspace({
    workspace: workspaceDir,
    platform: "IOS",
    name: "Keep iOS",
    serverVersion: bundle.serverVersion,
  });
  addPolicyToWorkspace(workspaceDir, bundle, { platform: "WINDOWS", name: "Remove Windows" });
  const handle = await startEditorServer({
    workspace: workspaceDir,
    out,
    key: password,
    port: 0,
    host: "127.0.0.1",
  });

  try {
    const nextWorkspace = loadWorkspace(workspaceDir);
    nextWorkspace.policies = nextWorkspace.policies.slice(0, 1);

    const saveResponse = await postJson(`${handle.url}api/workspace`, { workspace: nextWorkspace });
    assert.equal(saveResponse.ok, true);
    const saveResult = await saveResponse.json() as WorkspaceValidationResponse;
    assert.equal(saveResult.workspace.policies.length, 1);
    assert.equal(loadWorkspace(workspaceDir).policies.length, 1);

    const buildResponse = await postJson(`${handle.url}api/build`, {});
    assert.equal(buildResponse.ok, true);
    assert.equal(inspectRexp(out, password).policyEntries.length, 1);
  } finally {
    await handle.close();
  }
});

function expandWorkspace(workspace: PolicyWorkspace, policyCount: number): PolicyWorkspace {
  const templatePolicy = workspace.policies[0];
  if (templatePolicy === undefined) {
    throw new Error("Workspace has no template policy");
  }
  const expanded = structuredClone(workspace) as PolicyWorkspace;
  const exportedPolicies: Record<string, unknown> = {};
  const policiesToExport: string[] = [];
  expanded.policies = Array.from({ length: policyCount }, (_unused, index) => {
    const sequence = String(index + 1).padStart(12, "0");
    const policyUuid = `00000000-0000-4000-8000-${sequence}`;
    const versionUuid = `00000000-0000-4001-8000-${sequence}`;
    const policy = structuredClone(templatePolicy);
    policy.path = `policies/policy_${policyUuid}.json`;
    policy.document.uuid = policyUuid;
    policy.document.name = `Large Validate Policy ${sequence}`;
    policy.document.description = "Large validation fixture padding ".repeat(100);
    const versions = Array.isArray(policy.document.versions) ? policy.document.versions : [];
    const firstVersion = versions[0];
    if (typeof firstVersion === "object" && firstVersion !== null && !Array.isArray(firstVersion)) {
      (firstVersion as Record<string, unknown>).uuid = versionUuid;
    }
    policiesToExport.push(policyUuid);
    exportedPolicies[policyUuid] = {
      policyUuid,
      policyName: policy.document.name,
      result: "SUCCESS",
      errors: [],
    };
    return policy;
  });
  expanded.report = {
    ...expanded.report,
    policiesToExport,
    exportedPolicies,
    failedPolicies: {},
  };
  return expanded;
}

test("rejects workspace save with policy paths outside the policies root", async () => {
  const bundle = loadTemplateBundle();
  const root = mkdtempSync(join(tmpdir(), "relution-editor-unsafe-save-"));
  const out = join(root, "policy.rexp");
  const workspaceDir = join(root, "workspace");
  const workspace = createNewWorkspace({
    workspace: workspaceDir,
    platform: "IOS",
    name: "Unsafe Save Test",
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
    const invalidWorkspace = structuredClone(workspace) as PolicyWorkspace;
    invalidWorkspace.policies[0]!.path = "../outside.json";
    const outsidePath = join(workspaceDir, "..", "outside.json");

    const response = await postJson(`${handle.url}api/workspace`, { workspace: invalidWorkspace });
    assert.equal(response.status, 400);
    assert.equal(existsSync(outsidePath), false);
    assert.deepEqual(loadWorkspace(workspaceDir), workspace);
  } finally {
    await handle.close();
  }
});

test("rejects workspace save with duplicate policy paths", async () => {
  const bundle = loadTemplateBundle();
  const root = mkdtempSync(join(tmpdir(), "relution-editor-duplicate-save-"));
  const out = join(root, "policy.rexp");
  const workspaceDir = join(root, "workspace");
  const workspace = createNewWorkspace({
    workspace: workspaceDir,
    platform: "IOS",
    name: "Duplicate Save Test",
    serverVersion: bundle.serverVersion,
  });
  addPolicyToWorkspace(workspaceDir, bundle, { platform: "WINDOWS", name: "Duplicate Me" });
  const before = loadWorkspace(workspaceDir);
  const handle = await startEditorServer({
    workspace: workspaceDir,
    out,
    key: password,
    port: 0,
    host: "127.0.0.1",
  });

  try {
    const invalidWorkspace = structuredClone(before) as PolicyWorkspace;
    invalidWorkspace.policies[1]!.path = invalidWorkspace.policies[0]!.path;

    const response = await postJson(`${handle.url}api/workspace`, { workspace: invalidWorkspace });
    assert.equal(response.status, 400);
    assert.deepEqual(loadWorkspace(workspaceDir), before);
  } finally {
    await handle.close();
  }
});

test("rejects workspace save with structurally invalid metadata or policy documents", async () => {
  const bundle = loadTemplateBundle();
  const root = mkdtempSync(join(tmpdir(), "relution-editor-invalid-shape-save-"));
  const out = join(root, "policy.rexp");
  const workspaceDir = join(root, "workspace");
  const workspace = createNewWorkspace({
    workspace: workspaceDir,
    platform: "IOS",
    name: "Invalid Shape Save Test",
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
    const invalidMetadataWorkspace = structuredClone(workspace) as PolicyWorkspace;
    invalidMetadataWorkspace.metadata = [] as unknown as Record<string, unknown>;
    const metadataResponse = await postJson(`${handle.url}api/workspace`, { workspace: invalidMetadataWorkspace });
    assert.equal(metadataResponse.status, 400);
    assert.deepEqual(loadWorkspace(workspaceDir), workspace);

    const invalidPolicyWorkspace = structuredClone(workspace) as PolicyWorkspace;
    invalidPolicyWorkspace.policies[0]!.document = [] as unknown as Record<string, unknown>;
    const policyResponse = await postJson(`${handle.url}api/workspace`, { workspace: invalidPolicyWorkspace });
    assert.equal(policyResponse.status, 400);
    assert.deepEqual(loadWorkspace(workspaceDir), workspace);
  } finally {
    await handle.close();
  }
});

test("workspace save refreshes mobileconfig restore state from the saved workspace", async () => {
  const bundle = loadTemplateBundle();
  const catalog = loadAppleSchemaCatalog();
  const root = mkdtempSync(join(tmpdir(), "relution-editor-save-sidecar-refresh-"));
  const out = join(root, "policy.rexp");
  const workspaceDir = join(root, "workspace");
  const workspace = createNewWorkspace({
    workspace: workspaceDir,
    platform: "IOS",
    name: "Save Sidecar Refresh Test",
    serverVersion: bundle.serverVersion,
  });
  const policyPath = requirePolicyPath(workspace);
  addAppleCompatConfigurationToWorkspace(workspaceDir, { policyPath, versionIndex: 0, settingId: "associated-domains" });
  recordMobileConfigRestoreEntries(workspaceDir, loadWorkspace(workspaceDir), catalog.source.revision);
  const handle = await startEditorServer({
    workspace: workspaceDir,
    out,
    key: password,
    port: 0,
    host: "127.0.0.1",
  });

  try {
    const updatedWorkspace = loadWorkspace(workspaceDir);
    const firstPolicy = updatedWorkspace.policies[0];
    const firstVersion = Array.isArray(firstPolicy?.document.versions) ? firstPolicy.document.versions[0] : undefined;
    const firstVersionRecord =
      typeof firstVersion === "object" && firstVersion !== null && !Array.isArray(firstVersion)
        ? (firstVersion as Record<string, unknown>)
        : undefined;
    if (firstVersionRecord !== undefined) {
      firstVersionRecord.configurations = [];
    }

    const saveResponse = await postJson(`${handle.url}api/workspace`, { workspace: updatedWorkspace });
    assert.equal(saveResponse.ok, true);
    const saveResult = await saveResponse.json() as WorkspaceValidationResponse & SidecarResponse;
    assert.deepEqual(saveResult.sidecar.mobileConfigRestore, []);
    assert.deepEqual(loadEditorSidecar(workspaceDir).mobileConfigRestore, []);

    const reconcileResponse = await postJson(`${handle.url}api/roundtrip/reconcile`, {});
    assert.equal(reconcileResponse.ok, true);
    const reconcileResult = await reconcileResponse.json() as ReconcileResponse;
    assert.equal(configurationTypes(reconcileResult.workspace).filter((type) => type === "APPLE_MOBILECONFIG").length, 0);
  } finally {
    await handle.close();
  }
});

test("restores the previous workspace when workspace save sidecar refresh fails", async () => {
  const bundle = loadTemplateBundle();
  const root = mkdtempSync(join(tmpdir(), "relution-editor-save-sidecar-rollback-"));
  const out = join(root, "policy.rexp");
  const workspaceDir = join(root, "workspace");
  const workspace = createNewWorkspace({
    workspace: workspaceDir,
    platform: "IOS",
    name: "Save Rollback Test",
    serverVersion: bundle.serverVersion,
  });
  const before = loadWorkspace(workspaceDir);
  mkdirSync(join(workspaceDir, "editor-sidecar.json"));
  const handle = await startEditorServer({
    workspace: workspaceDir,
    out,
    key: password,
    port: 0,
    host: "127.0.0.1",
  });

  try {
    const nextWorkspace = structuredClone(workspace);
    nextWorkspace.policies[0]!.document.name = "Mutated Name";

    const saveResponse = await postJson(`${handle.url}api/workspace`, { workspace: nextWorkspace });
    assert.equal(saveResponse.status, 400);
    assert.deepEqual(loadWorkspace(workspaceDir), before);
  } finally {
    await handle.close();
  }
});
