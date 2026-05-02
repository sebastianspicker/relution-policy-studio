import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { startEditorServer } from "../src/editor-server.js";
import { createNewWorkspace } from "../src/workspace.js";
import { loadTemplateBundle } from "../src/templates.js";

test("editor Relution and Zammad sessions reject local service hosts by default", async () => {
  const root = mkdtempSync(join(tmpdir(), "relution-editor-api-hosts-"));
  const workspace = join(root, "workspace");
  createNewWorkspace({
    workspace,
    platform: "IOS",
    name: "Relution host validation test",
    serverVersion: loadTemplateBundle().serverVersion,
  });
  const handle = await startEditorServer({ workspace, key: "", out: join(root, "out.rexp"), port: 0 });
  try {
    const cases = [
      {
        label: "Relution IP literal",
        path: "/api/relution/session",
        body: { host: "127.0.0.1", apiToken: "secret-token" },
      },
      {
        label: "Relution DNS private",
        path: "/api/relution/session",
        body: { host: "localhost", apiToken: "secret-token" },
      },
      {
        label: "Zammad IP literal",
        path: "/api/zammad/session",
        body: { host: "127.0.0.1", apiToken: "zammad-token", group: "IT", customer: "it@example.test" },
      },
      {
        label: "Zammad DNS private",
        path: "/api/zammad/session",
        body: { host: "localhost", apiToken: "zammad-token", group: "IT", customer: "it@example.test" },
      },
    ];

    for (const entry of cases) {
      const response = await postRaw(handle.url, entry.path, entry.body);
      const text = await response.text();
      assert.equal(response.status, 400, `${entry.label}: ${text}`);
      assert.match(text, /blocked local\/private address/u, entry.label);
    }
  } finally {
    await handle.close();
  }
});

test("editor Relution API session queries devices and writes local reports", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (String(input).startsWith("https://relution.example.test/")) {
      assert.equal((init?.headers as Record<string, string>)["X-User-Access-Token"], "secret-token");
      assert.match(String(init?.body), /"ownership"/u);
      assert.match(String(init?.body), /"policyStatus"/u);
      return new Response(JSON.stringify({
        nonpagedCount: 1,
        results: [
          {
            uuid: "DEVICE-1",
            name: "Campus iPad",
            platform: "IOS",
            status: "COMPLIANT",
            policyStatus: "APPLIED",
            assignedPolicies: ["Other Policy"],
            lastConnectionDate: "2026-01-01T00:00:00.000Z",
          },
        ],
      }));
    }
    if (String(input).startsWith("https://zammad.example.test/")) {
      assert.equal((init?.headers as Record<string, string>)["Authorization"], "Token token=zammad-token");
      if (String(input).endsWith("/api/v1/users/me")) {
        return new Response(JSON.stringify({ id: 1 }));
      }
      assert.match(String(init?.body), /MDM non-compliance/u);
      return new Response(JSON.stringify({ id: 42, number: "240042" }), { status: 201 });
    }
    return originalFetch(input, init);
  };

  const root = mkdtempSync(join(tmpdir(), "relution-editor-api-"));
  const workspace = join(root, "workspace");
  createNewWorkspace({
    workspace,
    platform: "IOS",
    name: "Relution API Test",
    serverVersion: loadTemplateBundle().serverVersion,
  });
  const handle = await startEditorServer({ workspace, key: "", out: join(root, "out.rexp"), port: 0, allowLocalServiceHosts: true });
  try {
    const session = await postJson<{ configured: boolean }>(handle.url, "/api/relution/session", {
      protocol: "https",
      host: "relution.example.test",
      apiToken: "secret-token",
    });
    assert.equal(session.configured, true);

    const devices = await postJson<{ count: number }>(handle.url, "/api/relution/devices/query", {
      platforms: ["IOS"],
      statuses: ["COMPLIANT"],
      ownerships: ["CORPORATE"],
      sortField: "policyStatus",
    });
    assert.equal(devices.count, 1);

    const assessment = await postJson<{ report: { summary: { issue: number } } }>(handle.url, "/api/relution/devices/assess", {});
    assert.equal(assessment.report.summary.issue, 1);

    const audit = await postJson<{ report: { summary: { missingPolicy: number; inactiveProblem: number } } }>(handle.url, "/api/relution/devices/audit", {
      platforms: ["IOS"],
      ownerships: ["CORPORATE"],
      sortField: "policyStatus",
      expectedPoliciesByPlatform: { IOS: ["Baseline iOS"] },
      inactiveProblemDays: 30,
    });
    assert.equal(audit.report.summary.missingPolicy, 1);
    assert.equal(audit.report.summary.inactiveProblem, 1);

    const report = await postJson<{ jsonPath: string; markdownPath: string }>(handle.url, "/api/relution/reports/compliance", {});
    assert.match(report.jsonPath, /relution-compliance-report/u);
    assert.match(report.markdownPath, /relution-compliance-report/u);

    const history = await getJson<{ reports: Array<{ jsonPath: string; markdownPath?: string }> }>(handle.url, "/api/relution/reports");
    assert.equal(history.reports.length, 1);
    assert.equal(history.reports[0]?.jsonPath, report.jsonPath);
    assert.equal(history.reports[0]?.markdownPath, report.markdownPath);

    const zammadSession = await postJson<{ configured: boolean }>(handle.url, "/api/zammad/session", {
      host: "zammad.example.test",
      apiToken: "zammad-token",
      group: "IT",
      customer: "it@example.test",
    });
    assert.equal(zammadSession.configured, true);
    const zammadTest = await postJson<{ ok: boolean }>(handle.url, "/api/zammad/test", {});
    assert.equal(zammadTest.ok, true);
    const ticket = await postJson<{ ticket: { number: string } }>(handle.url, "/api/zammad/tickets", {
      draft: {
        kind: "non-compliant-device",
        title: "MDM non-compliance: Campus iPad",
        body: "Finding body",
        issueId: "missing-policy",
      },
    });
    assert.equal(ticket.ticket.number, "240042");
  } finally {
    await handle.close();
    globalThis.fetch = originalFetch;
  }
});

async function getJson<T>(baseUrl: string, path: string): Promise<T> {
  const response = await fetch(new URL(path, baseUrl));
  const text = await response.text();
  assert.equal(response.ok, true, text);
  return JSON.parse(text) as T;
}

async function postJson<T>(baseUrl: string, path: string, body: unknown): Promise<T> {
  const response = await postRaw(baseUrl, path, body);
  const text = await response.text();
  assert.equal(response.ok, true, text);
  return JSON.parse(text) as T;
}

async function postRaw(baseUrl: string, path: string, body: unknown): Promise<Response> {
  const response = await fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return response;
}
