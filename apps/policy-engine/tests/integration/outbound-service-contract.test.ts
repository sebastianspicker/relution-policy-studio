/** Uses one pinned transport adapter to prove Relution reads and Zammad reconciliation contracts. */
import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRelutionConnection } from "../../src/integrations/relution/relution-connection.js";
import { relutionFetch } from "../../src/integrations/relution/relution-transport.js";
import { normalizeZammadConnection } from "../../src/integrations/zammad/zammad-api-connection.js";
import { findZammadTicketByOperationId } from "../../src/integrations/zammad/zammad-api-reconciliation.js";
import type { HttpServiceTransportAdapter } from "../../src/platform/network/http-service-transport.js";

test("Relution allows its documented read query through the pinned shared transport and blocks mutations before DNS", async () => {
  const connection = normalizeRelutionConnection({ host: "https://relution.example.test", apiToken: "relution-token" });
  const calls: string[] = [];
  const adapter: HttpServiceTransportAdapter = {
    resolveAddresses: async (serviceName) => { calls.push(`resolve:${serviceName}`); return [{ address: "8.8.8.8", family: 4 }]; },
    request: async (url, init, addresses) => {
      calls.push(`${init.method}:${url.pathname}`);
      assert.deepEqual(addresses, [{ address: "8.8.8.8", family: 4 }]);
      assert.equal(new Headers(init.headers).get("X-User-Access-Token"), "relution-token");
      return new Response('{"content":[]}');
    },
  };

  assert.equal((await relutionFetch(connection, "/api/v2/devices/baseInfo/query", { method: "POST" }, { adapter })).ok, true);
  await assert.rejects(relutionFetch(connection, "/api/v2/devices/1", { method: "DELETE" }, { adapter }), /Blocked non-read-only/u);
  assert.deepEqual(calls, ["resolve:Relution", "POST:/api/v2/devices/baseInfo/query"]);
});

test("Zammad reconciliation finds one exact operation marker through the same transport without posting a duplicate ticket", async () => {
  const connection = normalizeZammadConnection({ host: "https://zammad.example.test", apiToken: "zammad-token", group: "IT", customer: "customer" });
  const operationId = `relution-op-${"a".repeat(64)}`;
  const operations: string[] = [];
  const adapter: HttpServiceTransportAdapter = {
    resolveAddresses: async (serviceName) => { operations.push(`resolve:${serviceName}`); return [{ address: "8.8.8.8", family: 4 }]; },
    request: async (url, init) => {
      operations.push(`${init.method}:${url.pathname}${url.search}`);
      assert.equal(new Headers(init.headers).get("Authorization"), "Token token=zammad-token");
      if (url.pathname === "/api/v1/tickets/search") return new Response('[{"id":12,"number":"42","title":"Existing ticket"}]');
      if (url.pathname === "/api/v1/ticket_articles/by_ticket/12") return new Response(`[{"internal":true,"body":"finding\\n[relution-operation:${operationId}]"}]`);
      throw new Error(`unexpected Zammad request: ${url.pathname}`);
    },
  };

  const ticket = await findZammadTicketByOperationId(connection, operationId, { adapter });
  assert.deepEqual(ticket, { id: 12, number: "42", title: "Existing ticket", url: "https://zammad.example.test/#ticket/zoom/12", raw: {} });
  assert.deepEqual(operations, [
    "resolve:Zammad",
    `GET:/api/v1/tickets/search?query=${operationId}&per_page=10`,
    "resolve:Zammad",
    "GET:/api/v1/ticket_articles/by_ticket/12",
  ]);
});
