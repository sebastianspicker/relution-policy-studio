import assert from "node:assert/strict";
import test from "node:test";
import { normalizeZammadConnection, publicZammadSession, createZammadTicket } from "../src/zammad-api.js";
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
