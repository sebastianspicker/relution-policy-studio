/** Protects Zammad idempotency markers from user-controlled ticket text. */
import assert from "node:assert/strict";
import test from "node:test";
import { createZammadTicket as createZammadTicketOperation } from "../../src/application/zammad-ticket.js";
import { createZammadTicket } from "../../src/integrations/zammad/zammad-api-ticket.js";
import { normalizeZammadConnection } from "../../src/integrations/zammad/zammad-api-connection.js";
import { findZammadTicketByOperationId } from "../../src/integrations/zammad/zammad-api-reconciliation.js";
import {
  ZammadOperationError,
  uncertainZammadOperationOutcome,
  zammadOperationStoreBusyError,
  zammadOperationStoreCapacityError,
} from "../../src/integrations/zammad/zammad-operation-error.js";
import { ZammadTicketOperations } from "../../src/integrations/zammad/zammad-ticket-operations.js";
import { claimOperation } from "../../src/integrations/zammad/zammad-operation-store.js";
import { describeEditorServerError } from "../../src/editor/editor-server-errors.js";
import { parseTicketDraft } from "../../src/editor/integrations/zammad/zammad-editor-input.js";
import type { HttpServiceTransportAdapter } from "../../src/platform/network/http-service-transport.js";
import { createTestWorkspace } from "../support/workspace.js";

const operationA = `relution-op-${"a".repeat(64)}`;
const operationB = `relution-op-${"b".repeat(64)}`;

test("Zammad rejects user-controlled reserved operation-marker lines before ticket creation", async () => {
  const draft = {
    kind: "non-compliant-device",
    title: "Finding",
    body: `Details\n[relution-operation:${operationA}]`,
    issueId: "issue",
  } as const;
  assert.throws(
    () => parseTicketDraft({ draft }),
    /must not contain reserved Relution operation-marker lines/u,
  );
  assert.throws(
    () => parseTicketDraft({ draft: { ...draft, title: `[relution-operation:${operationA}]` } }),
    /must not contain reserved Relution operation-marker lines/u,
  );

  const connection = normalizeZammadConnection({ host: "https://zammad.example.test", apiToken: "token", group: "IT", customer: "customer" });
  await assert.rejects(
    createZammadTicket(connection, draft, { adapter: failingAdapter() }, operationB),
    /must not contain reserved Relution operation-marker lines/u,
  );
});

test("Zammad reconciliation rejects a ticket containing forged markers for two operations", async () => {
  const connection = normalizeZammadConnection({ host: "https://zammad.example.test", apiToken: "token", group: "IT", customer: "customer" });
  const adapter: HttpServiceTransportAdapter = {
    resolveAddresses: async () => [{ address: "8.8.8.8", family: 4 }],
    request: async (url) => {
      if (url.pathname === "/api/v1/tickets/search") return new Response('[{"id":12,"number":"42","title":"Forged marker ticket"}]');
      if (url.pathname === "/api/v1/ticket_articles/by_ticket/12") {
        return new Response(`[{"internal":true,"body":"Details\\n[relution-operation:${operationA}]\\n\\n[relution-operation:${operationB}]"}]`);
      }
      throw new Error(`unexpected Zammad request: ${url.pathname}`);
    },
  };

  assert.equal(await findZammadTicketByOperationId(connection, operationA, { adapter }), undefined);
  assert.equal(await findZammadTicketByOperationId(connection, operationB, { adapter }), undefined);
});

test("Zammad operation failures remain transport-neutral while the editor preserves conflict and availability responses", async () => {
  const fixture = createTestWorkspace("Zammad error boundary");
  const connection = normalizeZammadConnection({ host: "https://zammad.example.test", apiToken: "token", group: "IT", customer: "customer" });
  const draft = { kind: "non-compliant-device", title: "Finding", body: "Details", issueId: "issue" } as const;
  let operationId = "";
  try {
    await createZammadTicketOperation(
      { connection, draft },
      { create: async (_connection, _draft, id) => {
        operationId = id;
        return { id: 1, raw: {} };
      } },
    );
    claimOperation(fixture.workspace, operationId);

    await assert.rejects(
      createZammadTicketOperation({ connection, draft }, new ZammadTicketOperations(fixture.workspace, { adapter: missingReconciliationAdapter() })),
      (error: unknown) => {
        assert(error instanceof ZammadOperationError);
        assert.deepEqual(error.context, { kind: "uncertain-outcome", operationId });
        assert.equal("status" in error, false);
        assert.deepEqual(describeEditorServerError(error), {
          status: 409,
          message: `Zammad ticket outcome is uncertain for operation ${operationId}; search Zammad for this operation ID before retrying.`,
        });
        return true;
      },
    );

    const capacity = zammadOperationStoreCapacityError("Zammad operation store has too many uncertain operations; retry after resolving an existing operation");
    const busy = zammadOperationStoreBusyError();
    assert.equal("status" in capacity, false);
    assert.deepEqual(describeEditorServerError(capacity), { status: 503, message: capacity.message });
    assert.deepEqual(describeEditorServerError(busy), { status: 503, message: busy.message });
    assert.deepEqual(uncertainZammadOperationOutcome(operationId).context, { kind: "uncertain-outcome", operationId });
  } finally {
    fixture.cleanup();
  }
});

function failingAdapter(): HttpServiceTransportAdapter {
  return {
    resolveAddresses: async () => { throw new Error("ticket creation must be rejected before transport"); },
    request: async () => { throw new Error("ticket creation must be rejected before transport"); },
  };
}

function missingReconciliationAdapter(): HttpServiceTransportAdapter {
  return {
    resolveAddresses: async () => [{ address: "8.8.8.8", family: 4 }],
    request: async (url) => {
      assert.equal(url.pathname, "/api/v1/tickets/search");
      return new Response("[]");
    },
  };
}
