import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadAppleSchemaCatalog } from "../src/apple-schema-catalog.js";
import {
  addAppleCompatConfigurationToWorkspace,
  addConfigurationToWorkspace,
  createNewWorkspace,
  loadWorkspace,
  saveWorkspace,
} from "../src/workspace.js";
import { extractRexp, inspectRexp, packPlainDirectory, verifyRexp } from "../src/rexp.js";
import { loadTemplateBundle } from "../src/templates.js";
import { importRulesetWorkspace } from "../web/src/editor/ruleset-import.js";
import {
  archiveKey,
  baselineTemplateEntries,
  configurationsHaveType,
  dockerCompose,
  expectedServerConfigurationTypes,
  exportPolicy,
  firstImportedPolicyUuid,
  importBaselineTemplate,
  importPolicy,
  importedPolicyUuidByName,
  isRelutionExportablePolicy,
  publishFirstPolicyVersion,
  readJson,
  requireImportedWorkspace,
  requirePolicyPath,
  waitForPublishedConfigurations,
  waitForPublishedConfigurationsWithTypes,
  waitForRelution,
  workspaceHasConfigurationType,
  type BaselineTemplate,
} from "./relution-docker-e2e-helpers.js";

test("local Docker Relution imports a generated Apple mobileconfig policy and exports native settings", { timeout: 600_000 }, async () => {
  dockerCompose(["up", "-d"]);
  try {
    await waitForRelution();

    const bundle = loadTemplateBundle();
    const root = mkdtempSync(join(tmpdir(), "relution-docker-e2e-"));
    const workspaceDir = join(root, "workspace");
    const rexpPath = join(root, "apple-gap.rexp");
    const exportedPath = join(root, "apple-gap-exported.rexp");
    const exportedWorkspaceDir = join(root, "exported-workspace");
    const workspace = createNewWorkspace({
      workspace: workspaceDir,
      platform: "IOS",
      name: "Docker E2E Apple Gap",
      serverVersion: bundle.serverVersion,
      force: true,
    });
    addConfigurationToWorkspace(workspaceDir, bundle, {
      policyPath: requirePolicyPath(workspace),
      versionIndex: 0,
      type: "IOS_RESTRICTION",
    });
    addAppleCompatConfigurationToWorkspace(workspaceDir, {
      policyPath: requirePolicyPath(workspace),
      versionIndex: 0,
      settingId: "associated-domains",
    });
    packPlainDirectory(workspaceDir, rexpPath, archiveKey, { force: true });
    assert.equal(verifyRexp(rexpPath, archiveKey).ok, true);

    const importReport = await importPolicy(rexpPath);
    assert.deepEqual(importReport.errors ?? [], []);
    assert.equal(Object.keys(importReport.failedPolicies ?? {}).length, 0);
    const importedPolicyUuid = firstImportedPolicyUuid(importReport);
    assert.equal(typeof importedPolicyUuid, "string");
    const publishedVersionUuid = await publishFirstPolicyVersion(importedPolicyUuid);
    const serverConfigurations = await waitForPublishedConfigurations(importedPolicyUuid, publishedVersionUuid);
    assert.equal(configurationsHaveType(serverConfigurations, "IOS_RESTRICTION"), true);
    assert.equal(configurationsHaveType(serverConfigurations, "APPLE_MOBILECONFIG"), true);
    assert.equal(
      serverConfigurations.some(
        (configuration) =>
          configuration.details?.type === "APPLE_MOBILECONFIG" &&
          configuration.details.secondLevelPayloadType === "com.apple.associated-domains" &&
          typeof configuration.details.rawContent === "string" &&
          configuration.details.rawContent.includes("<string>com.apple.associated-domains</string>"),
      ),
      true,
    );

    const exportedArchive = await exportPolicy(importedPolicyUuid);
    writeFileSync(exportedPath, new Uint8Array(await exportedArchive.arrayBuffer()));
    assert.equal(verifyRexp(exportedPath, archiveKey).ok, true);
    const exported = inspectRexp(exportedPath, archiveKey);
    assert.equal(exported.policies?.some((policy) => policy.name === "Docker E2E Apple Gap"), true);
    extractRexp(exportedPath, exportedWorkspaceDir, archiveKey, { force: true, pretty: true });
    const exportedWorkspace = loadWorkspace(exportedWorkspaceDir);
    assert.equal(workspaceHasConfigurationType(exportedWorkspace, "IOS_RESTRICTION"), true);
    assert.equal(
      workspaceHasConfigurationType(exportedWorkspace, "APPLE_MOBILECONFIG"),
      false,
      "Relution 26.1.1 stores APPLE_MOBILECONFIG after import, but marks it non-exportable for policy .rexp export.",
    );
  } catch (error) {
    const logs = dockerCompose(["logs", "--no-color", "--tail", "240", "relution"], false);
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n\nRelution logs:\n${logs}`);
  } finally {
    if (process.env.RELUTION_DOCKER_KEEP !== "1") {
      dockerCompose(["down", "--volumes", "--remove-orphans"], false);
    }
  }
});

test("local Docker Relution imports every generated OS baseline template", { timeout: 3_600_000 }, async () => {
  dockerCompose(["up", "-d"]);
  try {
    await waitForRelution();

    const bundle = loadTemplateBundle();
    const appleSchema = loadAppleSchemaCatalog();
    const root = mkdtempSync(join(tmpdir(), "relution-baseline-e2e-"));
    const entries = baselineTemplateEntries();

    for (const [entryIndex, entry] of entries.entries()) {
      const label = `${String(entryIndex + 1)}/${String(entries.length)} ${entry.path}`;
      const template = readJson<BaselineTemplate>(entry.path);
      const importResult = importRulesetWorkspace(template, bundle, appleSchema);
      assert.deepEqual(importResult.report.conflicts, [], `${label}: ruleset conflicts`);
      assert.deepEqual(importResult.report.unresolved, [], `${label}: unresolved rules`);
      assert.notEqual(importResult.workspace, undefined, `${label}: workspace`);
      const workspace = requireImportedWorkspace(importResult.workspace, label);

      const templateLabel = entry.path.replaceAll("/", "-").replaceAll(".", "-");
      const workspaceDir = join(root, `${templateLabel}-workspace`);
      const rexpPath = join(root, `${templateLabel}.rexp`);
      saveWorkspace(workspaceDir, workspace);
      packPlainDirectory(workspaceDir, rexpPath, archiveKey, { force: true });
      assert.equal(verifyRexp(rexpPath, archiveKey).ok, true, `${label}: local rexp verification`);
      const localArchive = inspectRexp(rexpPath, archiveKey);
      assert.equal(localArchive.policies?.some((policy) => policy.name === template.policies[0]?.name), true, `${label}: local archive policy`);

      const importReport = await importBaselineTemplate(rexpPath, label);
      for (const policy of template.policies) {
        const policyUuid = importedPolicyUuidByName(importReport, policy.name);
        const versionUuid = await publishFirstPolicyVersion(policyUuid);
        const expectedTypes = expectedServerConfigurationTypes(policy);
        const serverConfigurations = await waitForPublishedConfigurationsWithTypes(policyUuid, versionUuid, expectedTypes);
        for (const type of expectedTypes) {
          assert.equal(configurationsHaveType(serverConfigurations, type), true, `${label}: ${policy.name}: server configuration ${type}`);
        }

        const exportedPath = join(root, `${templateLabel}-${policyUuid}-exported.rexp`);
        const exportedArchive = await exportPolicy(policyUuid);
        writeFileSync(exportedPath, new Uint8Array(await exportedArchive.arrayBuffer()));
        assert.equal(verifyRexp(exportedPath, archiveKey).ok, true, `${label}: ${policy.name}: exported rexp verification`);
        const exported = inspectRexp(exportedPath, archiveKey);
        if (isRelutionExportablePolicy(expectedTypes)) {
          assert.equal(
            exported.policies?.some((exportedPolicy) => exportedPolicy.name === policy.name),
            true,
            `${label}: ${policy.name}: exported archive policy`,
          );
        }
      }
    }
  } catch (error) {
    const logs = dockerCompose(["logs", "--no-color", "--tail", "360", "relution"], false);
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n\nRelution logs:\n${logs}`);
  } finally {
    if (process.env.RELUTION_DOCKER_KEEP !== "1") {
      dockerCompose(["down", "--volumes", "--remove-orphans"], false);
    }
  }
});
