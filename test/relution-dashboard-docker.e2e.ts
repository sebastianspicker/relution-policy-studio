import assert from "node:assert/strict";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadAppleSchemaCatalog } from "../src/apple-schema-catalog.js";
import { startEditorServer } from "../src/editor-server.js";
import { packPlainDirectory, inspectRexp, verifyRexp } from "../src/rexp.js";
import { loadTemplateBundle } from "../src/templates.js";
import { saveWorkspace } from "../src/workspace.js";
import { importRulesetWorkspace } from "../web/src/editor/ruleset-import.js";
import {
  archiveKey,
  baseUrl,
  configurationsHaveType,
  dockerCompose,
  expectedServerConfigurationTypes,
  exportPolicy,
  importBaselineTemplate,
  importedPolicyUuidByName,
  isRelutionExportablePolicy,
  publishFirstPolicyVersion,
  readJson,
  requireImportedWorkspace,
  requireRelutionE2eAccessToken,
  waitForPublishedConfigurationsWithTypes,
  waitForRelution,
  type BaselineTemplate,
} from "./relution-docker-e2e-helpers.js";

test("local Docker Relution import/export supports dashboard audit with mock devices", { timeout: 900_000 }, async () => {
  const apiToken = requireRelutionE2eAccessToken();
  dockerCompose(["up", "-d"]);
  try {
    await waitForRelution();

    const root = mkdtempSync(join(tmpdir(), "relution-dashboard-e2e-"));
    const templatePath = "example/relution-baseline-templates/tiered/ios/tier-3-full.json";
    const template = readJson<BaselineTemplate>(templatePath);
    const importedWorkspace = importRulesetWorkspace(template, loadTemplateBundle(), loadAppleSchemaCatalog());
    assert.deepEqual(importedWorkspace.report.conflicts, [], "ruleset conflicts");
    assert.deepEqual(importedWorkspace.report.unresolved, [], "unresolved rules");
    const workspace = requireImportedWorkspace(importedWorkspace.workspace, templatePath);

    const workspaceDir = join(root, "workspace");
    const rexpPath = join(root, "dashboard-baseline.rexp");
    const exportedPath = join(root, "dashboard-baseline-exported.rexp");
    saveWorkspace(workspaceDir, workspace);
    packPlainDirectory(workspaceDir, rexpPath, archiveKey, { force: true });
    assert.equal(verifyRexp(rexpPath, archiveKey).ok, true, "local rexp verification");

    const importReport = await importBaselineTemplate(rexpPath, templatePath);
    const firstPolicy = requireExportablePolicy(template);
    const policyUuid = importedPolicyUuidByName(importReport, firstPolicy.name);
    const versionUuid = await publishFirstPolicyVersion(policyUuid);
    const expectedTypes = expectedServerConfigurationTypes(firstPolicy);
    const serverConfigurations = await waitForPublishedConfigurationsWithTypes(policyUuid, versionUuid, expectedTypes);
    for (const type of expectedTypes) {
      assert.equal(configurationsHaveType(serverConfigurations, type), true, `server configuration ${type}`);
    }

    const exportedArchive = await exportPolicy(policyUuid);
    writeFileSync(exportedPath, new Uint8Array(await exportedArchive.arrayBuffer()));
    assert.equal(verifyRexp(exportedPath, archiveKey).ok, true, "exported rexp verification");
    const exported = inspectRexp(exportedPath, archiveKey);
    assert.equal(exported.policies?.some((policy) => policy.name === firstPolicy.name), true, "exported archive policy");

    await probeDashboardWithMockDevices({ apiToken, workspaceDir, root, expectedPolicyName: firstPolicy.name });
  } catch (error) {
    const logs = dockerCompose(["logs", "--no-color", "--tail", "360", "relution"], false);
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n\nRelution logs:\n${logs}`);
  } finally {
    if (process.env.RELUTION_DOCKER_KEEP !== "1") {
      dockerCompose(["down", "--volumes", "--remove-orphans"], false);
    }
  }
});

async function probeDashboardWithMockDevices(options: {
  readonly apiToken: string;
  readonly workspaceDir: string;
  readonly root: string;
  readonly expectedPolicyName: string;
}): Promise<void> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url === `${baseUrl}/api/v2/devices/baseInfo/query`) {
      assert.equal((init?.headers as Record<string, string>)["X-User-Access-Token"], options.apiToken);
      return new Response(JSON.stringify({
        nonpagedCount: 2,
        results: [
          {
            uuid: "MOCK-IOS-1",
            name: "Mock iPad compliant",
            platform: "IOS",
            status: "COMPLIANT",
            policyStatus: "APPLIED",
            ownership: "CORPORATE",
            userEmail: "user1@example.invalid",
            assignedPolicies: [options.expectedPolicyName],
            lastConnectionDate: new Date().toISOString(),
          },
          {
            uuid: "MOCK-IOS-2",
            name: "Mock iPad stale",
            platform: "IOS",
            status: "COMPLIANT",
            policyStatus: "NONE",
            ownership: "CORPORATE",
            userEmail: "user2@example.invalid",
            assignedPolicies: [],
            lastConnectionDate: "2026-01-01T00:00:00.000Z",
          },
        ],
      }));
    }
    return originalFetch(input, init);
  };

  const handle = await startEditorServer({
    workspace: options.workspaceDir,
    out: join(options.root, "dashboard-out.rexp"),
    key: archiveKey,
    port: 0,
    allowLocalServiceHosts: true,
  });
  try {
    const session = await postJson<{ configured: boolean; baseUrl?: string }>(handle.url, "/api/relution/session", {
      host: baseUrl,
      apiToken: options.apiToken,
    });
    assert.equal(session.configured, true, "dashboard session configured");
    assert.equal(session.baseUrl, baseUrl, "dashboard session base URL");

    const audit = await postJson<{
      query: { count: number };
      report: { summary: { totalDevices: number; issue: number; missingPolicy: number; inactiveProblem: number } };
    }>(handle.url, "/api/relution/devices/audit", {
      platforms: ["IOS"],
      expectedPoliciesByPlatform: { IOS: [options.expectedPolicyName] },
      inactiveProblemDays: 30,
    });
    assert.equal(audit.query.count, 2, "mock device count");
    assert.equal(audit.report.summary.totalDevices, 2, "dashboard audit total devices");
    assert.equal(audit.report.summary.issue, 1, "dashboard audit issue count");
    assert.equal(audit.report.summary.missingPolicy, 1, "dashboard audit missing policy count");
    assert.equal(audit.report.summary.inactiveProblem, 1, "dashboard audit inactive problem count");

    const report = await postJson<{ jsonPath: string; markdownPath: string }>(handle.url, "/api/relution/reports/compliance", {});
    assert.equal(existsSync(report.jsonPath), true, "dashboard report JSON exists");
    assert.equal(existsSync(report.markdownPath), true, "dashboard report Markdown exists");
  } finally {
    globalThis.fetch = originalFetch;
    await handle.close();
  }
}

async function postJson<T>(baseUrlValue: string, path: string, body: unknown): Promise<T> {
  const response = await fetch(new URL(path, baseUrlValue), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  assert.equal(response.ok, true, text);
  return JSON.parse(text) as T;
}

function requireExportablePolicy(template: BaselineTemplate): BaselineTemplate["policies"][number] {
  const policy = template.policies.find((entry) => isRelutionExportablePolicy(expectedServerConfigurationTypes(entry)));
  if (policy === undefined) {
    throw new Error("Dashboard E2E template has no exportable policy");
  }
  return policy;
}
