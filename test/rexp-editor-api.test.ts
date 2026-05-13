import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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

test("keeps static asset resolution inside the dist-web root", () => {
  const root = mkdtempSync(join(tmpdir(), "relution-static-root-"));
  const staticRoot = join(root, "dist-web");
  const siblingRoot = join(root, "dist-web-backup");
  mkdirSync(staticRoot, { recursive: true });
  mkdirSync(siblingRoot, { recursive: true });
  writeFileSync(join(staticRoot, "index.html"), "INDEX");
  writeFileSync(join(siblingRoot, "leak.txt"), "LEAK");

  assert.equal(resolveStaticAssetPath(staticRoot, "/../dist-web-backup/leak.txt"), join(staticRoot, "index.html"));
});

test("returns 404 for missing static assets but still serves index for SPA routes", async () => {
  const bundle = loadTemplateBundle();
  const root = mkdtempSync(join(tmpdir(), "relution-static-http-"));
  const out = join(root, "policy.rexp");
  const workspaceDir = join(root, "workspace");
  createNewWorkspace({
    workspace: workspaceDir,
    platform: "IOS",
    name: "Static Route Test",
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
    writeFileSync("dist-web/unsupported.txt", "unsupported");
    const missingAsset = await fetch(`${handle.url}assets/does-not-exist.js`);
    assert.equal(missingAsset.status, 404);
    assert.match(await missingAsset.text(), /missing/i);

    const spaRoute = await fetch(`${handle.url}policies/editor`);
    assert.equal(spaRoute.status, 200);
    assert.match(spaRoute.headers.get("content-type") ?? "", /text\/html/);
    assert.equal(spaRoute.headers.get("x-content-type-options"), "nosniff");

    const unsupportedAsset = await fetch(`${handle.url}unsupported.txt`);
    assert.equal(unsupportedAsset.status, 404);
    assert.match(await unsupportedAsset.text(), /not supported/i);
  } finally {
    rmSync("dist-web/unsupported.txt", { force: true });
    await handle.close();
  }
});

test("serves the local editor API and builds a verifiable rexp", async () => {
  const bundle = loadTemplateBundle();
  const root = mkdtempSync(join(tmpdir(), "relution-editor-"));
  const out = join(root, "policy.rexp");
  const workspaceDir = join(root, "workspace");
  const workspace = createNewWorkspace({
    workspace: workspaceDir,
    platform: "IOS",
    name: "API iOS Test",
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
    const state = await getJson<EditorStateResponse>(
      `${handle.url}api/state`,
    );
    assert.equal(state.bundle.configurationTypes.length, 201);
    assert.equal(state.appleCompat.summary.mobileconfigBacked, 22);
    const missingApiResponse = await fetch(`${handle.url}api/does-not-exist`);
    assert.equal(missingApiResponse.status, 404);
    const missingApi = await missingApiResponse.json() as { error?: string };
    assert.match(missingApi.error ?? "", /Unknown API endpoint/);

    const baselineIndexResponse = await fetch(`${handle.url}api/baseline-templates`);
    assert.equal(baselineIndexResponse.ok, true);
    const baselineIndex = await baselineIndexResponse.json() as {
      options?: Array<{ platform?: string; tier?: number; shape?: string; actionableRuleCount?: number }>;
    };
    const iosTier3Modules = baselineIndex.options?.find((candidate) =>
      candidate.platform === "IOS" && candidate.tier === 3 && candidate.shape === "modules",
    );
    assert.equal((iosTier3Modules?.actionableRuleCount ?? 0) > 0, true);

    const baselineTemplateResponse = await fetch(`${handle.url}api/baseline-templates/template?platform=IOS&tier=3&shape=modules`);
    assert.equal(baselineTemplateResponse.ok, true);
    const baselineTemplate = await baselineTemplateResponse.json() as { policies?: unknown[] };
    assert.equal((baselineTemplate.policies ?? []).length > 0, true);

    const baselineExpertResponse = await fetch(`${handle.url}api/baseline-templates/expert?platform=IOS&shape=modules`);
    assert.equal(baselineExpertResponse.ok, true);
    const baselineExpert = await baselineExpertResponse.json() as {
      settings?: Array<{ requiredInTiers?: number[]; recommendations?: unknown[] }>;
      tierCoverage?: Array<{ tier?: number; totalSettings?: number }>;
    };
    assert.equal((baselineExpert.settings ?? []).length > 0, true);
    assert.equal(baselineExpert.settings?.every((setting) => (setting.recommendations ?? []).length > 0), true);
    assert.equal((baselineExpert.tierCoverage?.find((entry) => entry.tier === 3)?.totalSettings ?? 0) > 0, true);

    const invalidBaselineTemplateResponse = await fetch(`${handle.url}api/baseline-templates/template?platform=../IOS&tier=3&shape=modules`);
    assert.equal(invalidBaselineTemplateResponse.status, 400);

    const addPolicyResponse = await postJson(`${handle.url}api/add-policy`, {
      platform: "WINDOWS",
      name: "API Windows Test",
    });
    assert.equal(addPolicyResponse.ok, true);
    const addPolicyResult = await addPolicyResponse.json() as AddPolicyResponse;
    assert.equal(addPolicyResult.workspace.policies.length, 2);

    const addInitialConfigResponse = await postJson(`${handle.url}api/add-configuration`, {
      policyPath: requirePolicyPath(workspace),
      versionIndex: 0,
      type: "IOS_RESTRICTION",
    });
    assert.equal(addInitialConfigResponse.ok, true);

    const addSecondConfigResponse = await postJson(`${handle.url}api/add-configuration`, {
      policyPath: requirePolicyPath(workspace),
      versionIndex: 0,
      type: "IOS_AIRPLAY",
    });
    assert.equal(addSecondConfigResponse.ok, true);

    const addAppleCompatResponse = await postJson(`${handle.url}api/apple-compat/add`, {
      policyPath: requirePolicyPath(workspace),
      versionIndex: 0,
      settingId: "associated-domains",
    });
    assert.equal(addAppleCompatResponse.ok, true);

    const addMobileconfigResponse = await postJson(`${handle.url}api/add-configuration`, {
      policyPath: requirePolicyPath(workspace),
      versionIndex: 0,
      type: "APPLE_MOBILECONFIG",
    });
    assert.equal(addMobileconfigResponse.ok, true);
    const addMobileconfigResult = await addMobileconfigResponse.json() as WorkspaceValidationResponse;
    assert.equal(addMobileconfigResult.validation.ok, true);
    const firstPolicy = addMobileconfigResult.workspace.policies.find((candidate) => candidate.path === requirePolicyPath(workspace));
    const firstVersion = Array.isArray(firstPolicy?.document.versions) ? firstPolicy.document.versions[0] : undefined;
    const firstVersionRecord =
      typeof firstVersion === "object" && firstVersion !== null && !Array.isArray(firstVersion)
        ? (firstVersion as Record<string, unknown>)
        : undefined;
    const configurations = Array.isArray(firstVersionRecord?.configurations) ? firstVersionRecord.configurations : [];
    assert.equal(
      configurations.some((configuration) => {
        const details = typeof configuration === "object" && configuration !== null && !Array.isArray(configuration)
          ? (configuration as Record<string, unknown>).details
          : undefined;
        return (
          typeof details === "object" &&
          details !== null &&
          !Array.isArray(details) &&
          (details as Record<string, unknown>).type === "APPLE_MOBILECONFIG"
        );
      }),
      true,
    );

    const addNewConfigResponse = await postJson(`${handle.url}api/add-configuration`, {
      policyPath: addPolicyResult.policyPath,
      versionIndex: 0,
      type: "WINDOWS_WIFI",
    });
    assert.equal(addNewConfigResponse.ok, true);

    const moveDownResponse = await postJson(`${handle.url}api/configuration/move`, {
      policyPath: requirePolicyPath(workspace),
      versionIndex: 0,
      configurationIndex: 1,
      direction: "down",
    });
    assert.equal(moveDownResponse.ok, true);
    const moveDownResult = await moveDownResponse.json() as WorkspaceValidationResponse;
    assert.equal(moveDownResult.validation.ok, true);
    assert.deepEqual(configurationTypesForPolicy(moveDownResult.workspace, requirePolicyPath(workspace)), [
      "IOS_RESTRICTION",
      "APPLE_MOBILECONFIG",
      "IOS_AIRPLAY",
      "APPLE_MOBILECONFIG",
    ]);

    const removeResponse = await postJson(`${handle.url}api/configuration/remove`, {
      policyPath: requirePolicyPath(workspace),
      versionIndex: 0,
      configurationIndex: 2,
    });
    assert.equal(removeResponse.ok, true);
    const removeResult = await removeResponse.json() as WorkspaceValidationResponse;
    assert.equal(removeResult.validation.ok, true);
    assert.deepEqual(configurationTypesForPolicy(removeResult.workspace, requirePolicyPath(workspace)), [
      "IOS_RESTRICTION",
      "APPLE_MOBILECONFIG",
      "APPLE_MOBILECONFIG",
    ]);

    const buildResponse = await postJson(`${handle.url}api/build`, {});
    assert.equal(buildResponse.ok, true);
    assert.equal(verifyRexp(out, password).ok, true);
    assert.equal(inspectRexp(out, password).policyEntries.length, 2);

    const outputResponse = await fetch(`${handle.url}api/output`);
    assert.equal(outputResponse.ok, true);
    assert.match(outputResponse.headers.get("content-disposition") ?? "", /policy\.rexp/);
    assert.equal((await outputResponse.arrayBuffer()).byteLength > 0, true);
  } finally {
    await handle.close();
  }
});
