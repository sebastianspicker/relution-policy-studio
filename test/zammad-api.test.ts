import assert from "node:assert/strict";
import test from "node:test";
import { normalizeZammadConnection, publicZammadSession, createZammadTicket, testZammadConnection } from "../src/zammad-api.js";
import { handleZammadApiRequest } from "../src/zammad-editor-routes.js";
import { buildZammadTicketDraft } from "../src/zammad-ticket-drafts.js";

test("normalizes Zammad connection settings without exposing the token publicly", () => {
  const connection = normalizeZammadConnection({
    host: "http://zammad.example.test:8080/helpdesk",
    apiToken: "secret-token",
    group: "IT",
    customer: "it@example.test",
  });

  assert.equal(connection.baseUrl, "http://zammad.example.test:8080/helpdesk");
  assert.deepEqual(publicZammadSession(connection), {
    configured: true,
    baseUrl: "http://zammad.example.test:8080/helpdesk",
    tokenConfigured: true,
    group: "IT",
    customer: "it@example.test",
  });
});

test("builds non-compliant-device ticket drafts through the dispatcher", () => {
  const draft = buildZammadTicketDraft(
    {
      status: "issue",
      device: {
        uuid: "DEVICE-1",
        name: "Campus iPad",
        platform: "IOS",
        status: "COMPLIANT",
        policyStatus: "MISSING",
        assignedPolicies: ["Required baseline"],
        raw: {},
      },
      issues: [],
    },
    {
      id: "missing-policy",
      severity: "problem",
      message: "Required policy is missing.",
      evidence: { expectedPolicy: "Required baseline" },
    },
  );

  assert.equal(draft.kind, "non-compliant-device");
  assert.equal(draft.deviceUuid, "DEVICE-1");
  assert.equal(draft.issueId, "missing-policy");
  assert.match(draft.title, /Campus iPad/u);
  assert.match(draft.body, /Re-push the policy/u);
});

test("builds inactive-device ticket drafts with age-specific remediation", () => {
  const draft = buildZammadTicketDraft(
    {
      status: "issue",
      device: {
        uuid: "DEVICE-1",
        name: "Dorm iPad",
        platform: "IOS",
        status: "COMPLIANT",
        policyStatus: "APPLIED",
        inactiveDays: 95,
        raw: {},
      },
      issues: [],
    },
    {
      id: "inactive-problem",
      severity: "problem",
      message: "Device has not checked in for 95 days.",
      evidence: { inactiveDays: "95" },
    },
  );

  assert.equal(draft.kind, "inactive-device");
  assert.match(draft.title, /95d/u);
  assert.match(draft.body, /stale asset candidate/u);
});

test("Zammad connection test validates the current-user response body", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://zammad.example.test/api/v1/users/me");
    assert.equal((init?.headers as Record<string, string>)["Authorization"], "Token token=secret-token");
    return new Response(JSON.stringify({ id: 7, login: "agent@example.test" }));
  };
  try {
    const result = await testZammadConnection(
      normalizeZammadConnection({
        host: "zammad.example.test",
        apiToken: "secret-token",
        group: "IT",
        customer: "it@example.test",
      }),
    );

    assert.deepEqual(result, { ok: true, baseUrl: "https://zammad.example.test" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Zammad connection test returns a failure signal for malformed 200 responses", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: "unauthorized" }));
  try {
    const result = await testZammadConnection(
      normalizeZammadConnection({
        host: "zammad.example.test",
        apiToken: "secret-token",
        group: "IT",
        customer: "it@example.test",
      }),
    );

    assert.deepEqual(result, {
      ok: false,
      baseUrl: "https://zammad.example.test",
      reason: "Zammad connection test returned an unexpected current-user response.",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("creates Zammad tickets with token auth and internal note article", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://zammad.example.test/api/v1/tickets");
    assert.equal((init?.headers as Record<string, string>)["Authorization"], "Token token=secret-token");
    assert.match(String(init?.body), /"internal":true/u);
    assert.match(String(init?.body), /"type":"note"/u);
    return new Response(JSON.stringify({ id: 42, number: "240042", title: "MDM non-compliance: Campus iPad" }), { status: 201 });
  };
  try {
    const ticket = await createZammadTicket(
      normalizeZammadConnection({
        host: "zammad.example.test",
        apiToken: "secret-token",
        group: "IT",
        customer: "it@example.test",
      }),
      {
        kind: "non-compliant-device",
        title: "MDM non-compliance: Campus iPad",
        body: "Finding body",
        deviceUuid: "DEVICE-1",
        issueId: "missing-policy",
      },
    );

    assert.equal(ticket.id, 42);
    assert.equal(ticket.number, "240042");
    assert.equal(ticket.url, "https://zammad.example.test/#ticket/zoom/42");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("accepts Zammad ticket creation when the response has an id but no number", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ id: 43, title: "ID-only ticket" }), { status: 201 });
  try {
    const ticket = await createZammadTicket(
      normalizeZammadConnection({
        host: "zammad.example.test",
        apiToken: "secret-token",
        group: "IT",
        customer: "it@example.test",
      }),
      {
        kind: "non-compliant-device",
        title: "ID-only ticket",
        body: "Finding body",
        issueId: "missing-policy",
      },
    );

    assert.equal(ticket.id, 43);
    assert.equal(ticket.number, undefined);
    assert.equal(ticket.url, "https://zammad.example.test/#ticket/zoom/43");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("accepts Zammad ticket creation when the response has a number but no id", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ number: "240043", title: "Number-only ticket" }), { status: 201 });
  try {
    const ticket = await createZammadTicket(
      normalizeZammadConnection({
        host: "zammad.example.test",
        apiToken: "secret-token",
        group: "IT",
        customer: "it@example.test",
      }),
      {
        kind: "non-compliant-device",
        title: "Number-only ticket",
        body: "Finding body",
        issueId: "missing-policy",
      },
    );

    assert.equal(ticket.id, undefined);
    assert.equal(ticket.number, "240043");
    assert.equal(ticket.url, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects Zammad ticket creation responses without an addressable identifier", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({}), { status: 201 });
  try {
    await assert.rejects(
      createZammadTicket(
        normalizeZammadConnection({
          host: "zammad.example.test",
          apiToken: "secret-token",
          group: "IT",
          customer: "it@example.test",
        }),
        {
          kind: "non-compliant-device",
          title: "MDM non-compliance: Campus iPad",
          body: "Finding body",
          issueId: "missing-policy",
        },
      ),
      /no ticket id or number/u,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects empty Zammad ticket creation responses without claiming success", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("", { status: 201 });
  try {
    await assert.rejects(
      createZammadTicket(
        normalizeZammadConnection({
          host: "zammad.example.test",
          apiToken: "secret-token",
          group: "IT",
          customer: "it@example.test",
        }),
        {
          kind: "non-compliant-device",
          title: "MDM non-compliance: Campus iPad",
          body: "Finding body",
          issueId: "missing-policy",
        },
      ),
      /invalid JSON/u,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sanitizes failed Zammad API errors", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(
    "secret-token Bearer unrelated-token it@example.test Campus iPad customer Alice",
    { status: 403, statusText: "Forbidden" },
  );
  try {
    await assert.rejects(
      createZammadTicket(
        normalizeZammadConnection({
          host: "zammad.example.test",
          apiToken: "secret-token",
          group: "IT",
          customer: "it@example.test",
        }),
        {
          kind: "non-compliant-device",
          title: "MDM non-compliance: Campus iPad",
          body: "Finding body",
          issueId: "missing-policy",
        },
      ),
      (error) => {
        assert.equal(error instanceof Error, true);
        const message = (error as Error).message;
        assert.equal(message, "Zammad API request failed: 403 Forbidden");
        assert.doesNotMatch(message, /secret-token/u);
        assert.doesNotMatch(message, /unrelated-token/u);
        assert.doesNotMatch(message, /it@example\.test/u);
        assert.doesNotMatch(message, /Campus iPad/u);
        assert.doesNotMatch(message, /Alice/u);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Zammad editor routes re-check outbound host policy before each request", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return new Response("{}");
  };
  try {
    await assert.rejects(
      handleZammadApiRequest(
        new URL("http://localhost/api/zammad/test"),
        { method: "POST" } as never,
        {} as never,
        {
          connection: normalizeZammadConnection({
            protocol: "http",
            host: "127.0.0.1",
            apiToken: "secret-token",
            group: "IT",
            customer: "it@example.test",
          }),
        },
        false,
      ),
      /blocked local\/private address/u,
    );
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
