import assert from "node:assert/strict";
import test from "node:test";
import {
  assessRelutionDevices,
  assertRelutionReadOnlyRequest,
  createRelutionAssessmentReport,
  normalizeRelutionConnection,
  publicRelutionSession,
  queryRelutionDevices,
} from "../src/relution-api.js";
import { handleRelutionApiRequest } from "../src/relution-editor-routes.js";

test("normalizes Relution connection settings without exposing the token publicly", () => {
  const connection = normalizeRelutionConnection({
    protocol: "http",
    host: "http://127.0.0.1",
    port: 8080,
    apiToken: "secret-token",
  });

  assert.equal(connection.baseUrl, "http://127.0.0.1:8080");
  assert.deepEqual(publicRelutionSession(connection), {
    configured: true,
    baseUrl: "http://127.0.0.1:8080",
    tokenConfigured: true,
    mode: "read-only",
  });
});

test("derives protocol port and base path from host URLs", () => {
  const connection = normalizeRelutionConnection({
    host: "http://relution.example.test:8080/customer-a/",
    apiToken: "secret-token",
  });

  assert.equal(connection.protocol, "http");
  assert.equal(connection.host, "relution.example.test");
  assert.equal(connection.port, 8080);
  assert.equal(connection.basePath, "/customer-a");
  assert.equal(connection.baseUrl, "http://relution.example.test:8080/customer-a");
});

test("queries and normalizes Relution device responses", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://relution.example.test/api/v2/devices/baseInfo/query");
    assert.equal((init?.headers as Record<string, string>)["X-User-Access-Token"], "secret-token");
    assert.match(String(init?.body), /ANDROID_ENTERPRISE/u);
    assert.match(String(init?.body), /CORPORATE/u);
    assert.match(String(init?.body), /"name":"name"/u);
    assert.match(String(init?.body), /"ascending":true/u);
    return new Response(JSON.stringify({
      nonpagedCount: 1,
      results: [
        {
          uuid: "DEVICE-1",
          name: "Campus iPad",
          platform: "IOS",
          status: "COMPLIANT",
          policyStatus: "APPLIED",
          lastConnectionDate: "2026-04-26T10:00:00.000Z",
          ownership: "CORPORATE",
          serialNumber: "SERIAL-1",
          userEmail: "student@example.test",
          assignedPolicies: [{ name: "Baseline iOS" }],
        },
      ],
    }));
  };
  try {
    const result = await queryRelutionDevices(
      normalizeRelutionConnection({ host: "relution.example.test", apiToken: "secret-token" }),
      {
        platforms: ["ANDROID_ENTERPRISE"],
        statuses: ["COMPLIANT"],
        ownerships: ["CORPORATE"],
        sortField: "name",
        sortAscending: true,
      },
    );

    assert.equal(result.total, 1);
    assert.equal(result.devices[0]?.name, "Campus iPad");
    assert.equal(result.devices[0]?.policyStatus, "APPLIED");
    assert.equal(result.devices[0]?.serialNumber, "SERIAL-1");
    assert.deepEqual(result.devices[0]?.assignedPolicies, ["Baseline iOS"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sanitizes failed Relution API errors", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(
    "secret-token Bearer unrelated-token student@example.test Campus iPad Device owner Alice",
    { status: 401, statusText: "Unauthorized" },
  );
  try {
    await assert.rejects(
      queryRelutionDevices(normalizeRelutionConnection({ host: "relution.example.test", apiToken: "secret-token" }), {}),
      (error) => {
        assert.equal(error instanceof Error, true);
        const message = (error as Error).message;
        assert.equal(message, "Relution API request failed: 401 Unauthorized");
        assert.doesNotMatch(message, /secret-token/u);
        assert.doesNotMatch(message, /unrelated-token/u);
        assert.doesNotMatch(message, /student@example\.test/u);
        assert.doesNotMatch(message, /Campus iPad/u);
        assert.doesNotMatch(message, /Alice/u);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("blocks non-read-only Relution API requests at the low-level client boundary", () => {
  assert.doesNotThrow(() => assertRelutionReadOnlyRequest("POST", "/api/v2/devices/baseInfo/query"));
  assert.throws(
    () => assertRelutionReadOnlyRequest("POST", "/api/v2/devices/actions/wipe"),
    /Blocked non-read-only Relution API request/u,
  );
  assert.throws(
    () => assertRelutionReadOnlyRequest("PUT", "/api/v2/policies/123"),
    /Blocked non-read-only Relution API request/u,
  );
});

test("Relution editor routes re-check outbound host policy before each request", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return new Response("{}");
  };
  try {
    await assert.rejects(
      handleRelutionApiRequest(
        new URL("http://localhost/api/relution/test"),
        { method: "POST" } as never,
        {} as never,
        {
          lastDevices: [],
          connection: normalizeRelutionConnection({
            protocol: "http",
            host: "127.0.0.1",
            apiToken: "secret-token",
          }),
        },
        "/tmp/workspace",
        false,
      ),
      /blocked local\/private address/u,
    );
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("assesses device status and policy status into report findings", () => {
  const report = assessRelutionDevices("https://relution.example.test", [
    {
      uuid: "DEVICE-1",
      name: "Campus iPad",
      platform: "IOS",
      status: "COMPLIANT",
      policyStatus: "APPLIED",
      raw: {},
    },
    {
      uuid: "DEVICE-2",
      name: "Dorm Android",
      platform: "ANDROID_ENTERPRISE",
      status: "INACTIVE",
      policyStatus: "NONE",
      raw: {},
    },
  ]);

  assert.equal(report.summary.totalDevices, 2);
  assert.equal(report.summary.compliant, 1);
  assert.equal(report.summary.issue, 1);
  assert.equal(report.devices[1]?.issues.length, 2);
  assert.equal(report.devices[1]?.issues[0]?.id, "device-status-noncompliant");
});

test("audits missing policies and inactive devices with evidence", () => {
  const report = createRelutionAssessmentReport(
    "https://relution.example.test",
    [
      {
        uuid: "DEVICE-1",
        name: "Campus iPad",
        platform: "IOS",
        status: "COMPLIANT",
        policyStatus: "APPLIED",
        assignedPolicies: ["Baseline iOS"],
        lastConnectionDate: "2026-03-01T00:00:00.000Z",
        raw: {},
      },
      {
        uuid: "DEVICE-2",
        name: "Dorm iPad",
        platform: "IOS",
        status: "COMPLIANT",
        policyStatus: "APPLIED",
        assignedPolicies: ["Other Policy"],
        lastConnectionDate: "2026-01-01T00:00:00.000Z",
        raw: {},
      },
      {
        uuid: "DEVICE-3",
        name: "Unknown policy iPad",
        platform: "IOS",
        status: "COMPLIANT",
        policyStatus: "APPLIED",
        raw: {},
      },
    ],
    {
      expectedPoliciesByPlatform: { IOS: ["Baseline iOS"] },
      inactiveWarningDays: 30,
      inactiveProblemDays: 90,
      now: new Date("2026-04-26T00:00:00.000Z"),
    },
  );

  assert.equal(report.summary.missingPolicy, 1);
  assert.equal(report.summary.inactiveWarning, 1);
  assert.equal(report.summary.inactiveProblem, 1);
  assert.equal(report.devices[1]?.issues.some((issue) => issue.id === "missing-policy"), true);
  assert.equal(report.devices[1]?.issues.some((issue) => issue.id === "inactive-problem"), true);
  assert.equal(report.devices[2]?.issues.some((issue) => issue.id === "policy-assignment-unknown"), true);
});
